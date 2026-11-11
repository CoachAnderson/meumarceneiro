/**
 * Visão Inteligente IA — lógica da função de servidor.
 *
 * Este arquivo não depende do Deno nem de biblioteca nenhuma (só de uma
 * função de busca injetada), para poder ser testado fora do Supabase:
 * packages/core/test/visao-funcao.test.ts roda todos os caminhos com a IA e
 * o banco simulados.
 *
 * Caminho: confere o pedido → reserva a análise no banco (permissão e cota,
 * com o token do próprio usuário) → envia a imagem à IA → encerra o registro
 * → devolve a leitura bruta. Quem valida a leitura é o motor, no navegador
 * (validarLeitura); a função não interpreta o móvel.
 *
 * A imagem não é gravada em lugar nenhum e não aparece em log.
 */

export interface Resposta {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type Buscar = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<Resposta>;

export interface Dependencias {
  buscar: Buscar;
  supabaseUrl: string;
  anonKey: string;
  /** Chave da API da IA. Fica só no servidor (segredo da função). */
  chaveIA: string;
  modelo: string;
  ferramenta: { name: string; [k: string]: unknown };
  instrucoes: string;
}

export interface Pedido {
  metodo: string;
  autorizacao: string | null;
  corpo: unknown;
}

export interface Saida {
  status: number;
  corpo: Record<string, unknown>;
}

const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'];
/** ~5 MB de imagem em base64. O navegador já reduz a foto antes de enviar. */
const MAX_BASE64 = 7_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMITES = { largura: [150, 6000], altura: [150, 3000], profundidade: [100, 1200] } as const;

const erro = (status: number, mensagem: string, codigo: string): Saida => ({ status, corpo: { erro: mensagem, codigo } });
const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Mesmo texto de pedidoVisao() do motor (o teste confere que são iguais). */
export function textoDoPedido(medidas: { largura?: number; altura?: number; profundidade?: number }, nota?: string): string {
  const partes: string[] = [];
  if (medidas.largura) partes.push(`largura ${medidas.largura} mm`);
  if (medidas.altura) partes.push(`altura ${medidas.altura} mm`);
  if (medidas.profundidade) partes.push(`profundidade ${medidas.profundidade} mm`);
  const m = partes.length ? `Medidas informadas pelo usuário: ${partes.join(', ')}.` : 'O usuário não informou medidas.';
  const n = nota?.trim() ? ` Observação do usuário: "${nota.trim().slice(0, 300)}".` : '';
  return `Leia o móvel desta imagem e registre a leitura. ${m}${n}`;
}

export async function tratar(pedido: Pedido, d: Dependencias): Promise<Saida> {
  if (pedido.metodo !== 'POST') return erro(405, 'Use POST.', 'metodo');
  if (!pedido.autorizacao || !/^Bearer \S+$/.test(pedido.autorizacao)) return erro(401, 'Entre no sistema para usar a Visão IA.', 'sem_login');
  if (!d.chaveIA) return erro(503, 'A Visão IA ainda não foi configurada neste sistema (falta a chave da IA no servidor).', 'sem_chave');

  // ---- Pedido
  const c = pedido.corpo;
  if (!ehObjeto(c)) return erro(400, 'Pedido inválido.', 'pedido');
  if (typeof c.empresaId !== 'string' || !UUID.test(c.empresaId)) return erro(400, 'Empresa inválida.', 'pedido');
  const img = c.imagem;
  if (!ehObjeto(img) || typeof img.tipo !== 'string' || !TIPOS_IMAGEM.includes(img.tipo)) return erro(400, 'Envie uma imagem JPEG, PNG ou WebP.', 'imagem_tipo');
  if (typeof img.base64 !== 'string' || img.base64.length < 100 || !/^[A-Za-z0-9+/]+={0,2}$/.test(img.base64)) return erro(400, 'A imagem não chegou inteira. Tente enviar de novo.', 'imagem');
  if (img.base64.length > MAX_BASE64) return erro(413, 'A imagem é grande demais (máximo de 5 MB).', 'imagem_grande');

  const medidas: { largura?: number; altura?: number; profundidade?: number } = {};
  if (c.medidas !== undefined && c.medidas !== null) {
    if (!ehObjeto(c.medidas)) return erro(400, 'Medidas inválidas.', 'medidas');
    for (const campo of ['largura', 'altura', 'profundidade'] as const) {
      const v = c.medidas[campo];
      if (v === undefined || v === null) continue;
      const [min, max] = LIMITES[campo];
      if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) return erro(400, `Medida de ${campo} fora do limite (${min} a ${max} mm).`, 'medidas');
      medidas[campo] = v;
    }
  }
  const nota = typeof c.nota === 'string' ? c.nota : undefined;

  // ---- Reserva no banco: com o token do usuário, então valem as regras dele (papel, empresa, cota).
  const rpc = (nome: string, args: Record<string, unknown>) =>
    d.buscar(`${d.supabaseUrl}/rest/v1/rpc/${nome}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: d.anonKey, authorization: pedido.autorizacao as string },
      body: JSON.stringify(args),
    });

  let analiseId: string;
  try {
    const r = await rpc('iniciar_analise_visao', { p_empresa: c.empresaId });
    if (!r.ok) {
      const e = (await r.json().catch(() => null)) as { code?: string; hint?: string; message?: string } | null;
      if (e?.hint === 'cota_visao') return erro(429, e.message ?? 'A cota de análises deste mês acabou.', 'cota');
      if (r.status === 401 || e?.code === '28000' || e?.code === 'PGRST301') return erro(401, 'Sua sessão expirou. Entre de novo.', 'sem_login');
      if (e?.code === '42501') return erro(403, 'Sua função não permite usar a Visão IA nesta empresa.', 'sem_permissao');
      return erro(502, 'Não foi possível registrar a análise. Tente de novo.', 'banco');
    }
    const id = await r.json();
    if (typeof id !== 'string' || !UUID.test(id)) return erro(502, 'Não foi possível registrar a análise. Tente de novo.', 'banco');
    analiseId = id;
  } catch {
    return erro(502, 'Não foi possível registrar a análise. Tente de novo.', 'banco');
  }

  const encerrar = async (status: 'concluida' | 'falhou' | 'recusada', extra: { entrada?: number; saida?: number; motivo?: string } = {}) => {
    // Falha ao encerrar não muda a resposta: a reserva expira sozinha em 5 minutos.
    await rpc('concluir_analise_visao', {
      p_id: analiseId,
      p_status: status,
      p_modelo: d.modelo,
      p_tokens_entrada: extra.entrada ?? null,
      p_tokens_saida: extra.saida ?? null,
      p_motivo: extra.motivo ?? null,
    }).catch(() => undefined);
  };

  // ---- IA
  let resposta: Resposta;
  try {
    resposta = await d.buscar('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': d.chaveIA, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: d.modelo,
        max_tokens: 1500,
        system: d.instrucoes,
        tools: [d.ferramenta],
        // Escolha automática: os modelos atuais recusam ferramenta forçada. O modo estrito garante o formato.
        tool_choice: { type: 'auto' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: img.tipo, data: img.base64 } },
              { type: 'text', text: textoDoPedido(medidas, nota) },
            ],
          },
        ],
      }),
    });
  } catch {
    await encerrar('falhou', { motivo: 'IA fora do ar' });
    return erro(502, 'A IA não respondeu. Tente de novo em instantes; esta tentativa não gastou cota.', 'ia_indisponivel');
  }

  if (!resposta.ok) {
    await encerrar('falhou', { motivo: `IA respondeu ${resposta.status}` });
    const sobrecarga = resposta.status === 429 || resposta.status === 529 || resposta.status >= 500;
    return erro(502, sobrecarga ? 'A IA está sobrecarregada. Tente de novo em instantes; esta tentativa não gastou cota.' : 'A IA recusou o pedido. Tente com outra foto; esta tentativa não gastou cota.', 'ia_erro');
  }

  const dados = (await resposta.json().catch(() => null)) as { content?: unknown; usage?: { input_tokens?: number; output_tokens?: number }; stop_reason?: string } | null;
  const uso = { entrada: dados?.usage?.input_tokens, saida: dados?.usage?.output_tokens };
  const blocos = Array.isArray(dados?.content) ? (dados.content as unknown[]).filter(ehObjeto) : [];
  const chamada = blocos.find((b) => b.type === 'tool_use' && b.name === d.ferramenta.name);

  if (!chamada || !ehObjeto(chamada.input) || dados?.stop_reason === 'max_tokens') {
    // A IA respondeu em texto: não viu um móvel que o sistema represente.
    const texto = blocos
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
    await encerrar('recusada', { ...uso, motivo: 'sem leitura' });
    return {
      status: 422,
      corpo: { erro: 'A IA não encontrou na imagem um móvel que o sistema consiga projetar.', codigo: 'sem_movel', explicacao: texto || null },
    };
  }

  await encerrar('concluida', uso);
  return { status: 200, corpo: { analiseId, leitura: chamada.input, modelo: d.modelo } };
}
