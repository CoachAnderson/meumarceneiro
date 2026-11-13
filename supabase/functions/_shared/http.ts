/**
 * Resposta HTTP das funções chamadas pelo navegador.
 *
 * O navegador só consegue ler a resposta (inclusive a de erro) se ela trouxer
 * os cabeçalhos de CORS. Por isso toda resposta passa por aqui, até a de uma
 * falha inesperada: sem isso, qualquer erro no servidor aparece na tela como
 * "não foi possível falar com o servidor".
 */

/**
 * Origem liberada para a resposta. `configurado` aceita vários endereços
 * separados por vírgula; barra no final e maiúsculas não importam. Vazio
 * libera qualquer origem (as funções exigem login de qualquer jeito).
 */
export function origemPermitida(configurado: string, origemDoPedido: string | null): string {
  const normalizar = (v: string) => v.trim().replace(/\/+$/, '').toLowerCase();
  const lista = configurado.split(',').map(normalizar).filter(Boolean);
  if (lista.length === 0) return '*';
  const pedido = origemDoPedido ? normalizar(origemDoPedido) : '';
  return lista.includes(pedido) ? (origemDoPedido as string).trim().replace(/\/+$/, '') : lista[0]!;
}

export function cabecalhosCors(configurado: string, origemDoPedido: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origemPermitida(configurado, origemDoPedido),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

/** Executa o tratamento e sempre devolve JSON com CORS, inclusive quando algo quebra. */
export async function responder(
  cors: Record<string, string>,
  executar: () => Promise<{ status: number; corpo: Record<string, unknown> }>,
  registrar: (mensagem: string) => void = () => {},
): Promise<Response> {
  let status = 500;
  let corpo: Record<string, unknown> = {
    erro: 'A função falhou no servidor. O dono do sistema pode ver o motivo em Supabase → Edge Functions → Logs.',
    codigo: 'falha_servidor',
  };
  try {
    ({ status, corpo } = await executar());
  } catch (e) {
    registrar(e instanceof Error ? `${e.name}: ${e.message}` : 'erro desconhecido');
  }
  return new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
