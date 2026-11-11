/**
 * Avisos do Mercado Pago (webhook) — lógica da função de servidor.
 *
 * 1. Confere a assinatura do aviso (cabeçalho x-signature, HMAC-SHA256 com o
 *    segredo da aplicação) ANTES de olhar o conteúdo.
 * 2. Responde 200 na hora; o trabalho segue em `depois`.
 * 3. Não confia no corpo do aviso: busca a assinatura no Mercado Pago e grava
 *    o que ele disser. Aviso repetido dá o mesmo resultado.
 *
 * Se um aviso se perder, a tela de assinatura reconcilia (ação "consultar").
 */
import { clienteMP, ehObjeto, ID_MP, sincronizar, type Base } from '../_shared/mp.ts';

export interface Aviso {
  metodo: string;
  /** Endereço completo chamado (o Mercado Pago manda data.id e type também na consulta). */
  url: string;
  assinatura: string | null;
  requestId: string | null;
  corpo: unknown;
}

export interface DependenciasAviso extends Base {
  /** Segredo da assinatura dos avisos (Suas integrações → Webhooks). */
  segredo: string;
  /** Registro de falha, sem dados sensíveis. */
  registrar?: (mensagem: string) => void;
}

export interface SaidaAviso {
  status: number;
  /** Processamento que continua depois da resposta. */
  depois?: Promise<void>;
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Comparação em tempo constante. */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

export async function hmacSha256(segredo: string, texto: string): Promise<string> {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(texto)));
}

/** Texto assinado pelo Mercado Pago: id:<data.id>;request-id:<x-request-id>;ts:<ts>; */
export const textoAssinado = (dataId: string, requestId: string, ts: string) => `id:${dataId};request-id:${requestId};ts:${ts};`;

export async function tratarAviso(a: Aviso, d: DependenciasAviso): Promise<SaidaAviso> {
  if (a.metodo !== 'POST') return { status: 405 };
  if (!d.segredo || !d.credencialMP || !d.chaveServico) return { status: 503 };

  // ---- 1. Assinatura do aviso.
  const partes: Record<string, string> = {};
  for (const p of (a.assinatura ?? '').split(',')) {
    const i = p.indexOf('=');
    if (i > 0) partes[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  let consulta: URLSearchParams;
  try {
    consulta = new URL(a.url).searchParams;
  } catch {
    return { status: 400 };
  }
  const corpo = ehObjeto(a.corpo) ? a.corpo : {};
  const dados = ehObjeto(corpo.data) ? corpo.data : {};
  const bruto = consulta.get('data.id') ?? (typeof dados.id === 'string' || typeof dados.id === 'number' ? String(dados.id) : '');
  // O Mercado Pago assina o identificador em minúsculas.
  const dataId = bruto.toLowerCase();
  const { ts, v1 } = partes;
  if (!ts || !v1 || !dataId || !a.requestId || !/^\d{1,16}$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return { status: 400 };
  const esperado = await hmacSha256(d.segredo, textoAssinado(dataId, a.requestId, ts));
  if (!iguais(esperado, v1.toLowerCase())) return { status: 401 };

  // ---- 2 e 3. Responde já; processa em seguida.
  const tipo = typeof corpo.type === 'string' ? corpo.type : (consulta.get('type') ?? '');
  const depois = (async () => {
    try {
      if (!ID_MP.test(bruto)) return;
      let preapproval: string | null = null;
      if (tipo === 'subscription_preapproval') {
        preapproval = bruto;
      } else if (tipo === 'subscription_authorized_payment') {
        // Cobrança recorrente: descobre de qual assinatura é.
        const r = await clienteMP(d)('GET', '/authorized_payments/' + encodeURIComponent(bruto));
        if (r.ok && ehObjeto(r.dados) && typeof r.dados.preapproval_id === 'string') preapproval = r.dados.preapproval_id;
        else d.registrar?.(`aviso de cobranca sem assinatura identificada (resposta ${r.status})`);
      }
      // Outros tipos (payment, plano) não mudam nada aqui.
      if (!preapproval) return;
      const s = await sincronizar(d, preapproval);
      if (!s.ok) d.registrar?.(`aviso ${tipo}: sincronia falhou (${s.motivo})`);
    } catch {
      d.registrar?.(`aviso ${tipo}: falha de rede ao sincronizar`);
    }
  })();
  return { status: 200, depois };
}
