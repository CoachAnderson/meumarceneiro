/**
 * Mercado Pago — peças comuns às funções de servidor (assinatura e mp-webhook).
 *
 * Sem dependência do Deno nem de biblioteca: recebe a função de busca, para
 * ser testado fora do Supabase (packages/core/test/assinatura-funcao.test.ts).
 *
 * As credenciais (MP_ACCESS_TOKEN e a chave de serviço do Supabase) ficam só
 * no servidor. Nada aqui grava credencial em registro de erro.
 */
import { cabecalhosServico } from './chaves.ts';

export interface Resposta {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type Buscar = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<Resposta>;

export interface Base {
  buscar: Buscar;
  supabaseUrl: string;
  /** Chave de serviço: só ela executa as funções que gravam a situação da assinatura. */
  chaveServico: string;
  /** Credencial privada do Mercado Pago (Access Token). */
  credencialMP: string;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Identificadores do Mercado Pago que entram em endereço: só letras, números, _ e -. */
export const ID_MP = /^[A-Za-z0-9_-]{8,64}$/;

export const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export type MpFetch = (metodo: 'GET' | 'POST' | 'PUT', caminho: string, corpo?: unknown) => Promise<{ ok: boolean; status: number; dados: unknown }>;

/** Chamadas à API do Mercado Pago (https://api.mercadopago.com, sem prefixo de versão nas assinaturas). */
export function clienteMP(d: Pick<Base, 'buscar' | 'credencialMP'>): MpFetch {
  return async (metodo, caminho, corpo) => {
    const r = await d.buscar(`https://api.mercadopago.com${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${d.credencialMP}`, 'Content-Type': 'application/json' },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });
    return { ok: r.ok, status: r.status, dados: await r.json().catch(() => null) };
  };
}

/** Executa uma função do banco com a chave de serviço. */
export async function rpcServico(d: Pick<Base, 'buscar' | 'supabaseUrl' | 'chaveServico'>, nome: string, args: Record<string, unknown>): Promise<{ ok: boolean; dados: unknown }> {
  const r = await d.buscar(`${d.supabaseUrl}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: cabecalhosServico(d.chaveServico),
    body: JSON.stringify(args),
  });
  return { ok: r.ok, dados: await r.json().catch(() => null) };
}

const dataOuNulo = (v: unknown): string | null => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);

export type ResultadoSincronia =
  | { ok: true; status: string; aplicada: boolean }
  | { ok: false; motivo: 'mp' | 'resposta' | 'referencia' | 'banco' };

/**
 * Busca a assinatura no Mercado Pago e grava a situação no banco.
 * A fonte da verdade é sempre a consulta ao Mercado Pago, nunca o corpo de um
 * aviso. Pode rodar quantas vezes for: o resultado é o mesmo.
 *
 * `referenciaEsperada`: quando a chamada parte de um usuário, a referência
 * devolvida pelo Mercado Pago tem de ser a da assinatura dele.
 */
export async function sincronizar(d: Base, mpId: string, referenciaEsperada?: string): Promise<ResultadoSincronia> {
  if (!ID_MP.test(mpId)) return { ok: false, motivo: 'resposta' };
  const mpFetch = clienteMP(d);
  const r = await mpFetch('GET', '/preapproval/' + encodeURIComponent(mpId));
  if (!r.ok) return { ok: false, motivo: 'mp' };
  const p = r.dados;
  if (!ehObjeto(p) || p.id !== mpId || typeof p.status !== 'string') return { ok: false, motivo: 'resposta' };
  // pending | authorized | paused | cancelled (a API também é citada com a grafia canceled).
  if (!['pending', 'authorized', 'paused', 'cancelled', 'canceled'].includes(p.status)) return { ok: false, motivo: 'resposta' };
  const referencia = p.external_reference;
  if (typeof referencia !== 'string' || !UUID.test(referencia)) return { ok: false, motivo: 'referencia' };
  if (referenciaEsperada && referencia.toLowerCase() !== referenciaEsperada.toLowerCase()) return { ok: false, motivo: 'referencia' };
  const resumo = ehObjeto(p.summarized) ? p.summarized : {};
  const gravou = await rpcServico(d, 'aplicar_assinatura_mp', {
    p_id: referencia,
    p_mp_id: mpId,
    p_status: p.status,
    p_proxima_cobranca: dataOuNulo(p.next_payment_date),
    p_ultima_cobranca: dataOuNulo(resumo.last_charged_date),
  });
  if (!gravou.ok) return { ok: false, motivo: 'banco' };
  return { ok: true, status: p.status, aplicada: gravou.dados === true };
}
