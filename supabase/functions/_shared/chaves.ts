/**
 * Chaves do Supabase dentro das funções.
 *
 * O Supabase está trocando as chaves antigas (anon e service_role, em formato
 * JWT) pelas novas (publishable "sb_publishable_..." e secret "sb_secret_...").
 * As novas chegam às funções num JSON por nome (SUPABASE_PUBLISHABLE_KEYS e
 * SUPABASE_SECRET_KEYS, com a chave "default"); as antigas, em
 * SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY. Usamos as novas quando
 * existem e as antigas como reserva, para funcionar nos dois tipos de projeto.
 *
 * As chaves novas vão só no cabeçalho `apikey`: não são JWT, e mandadas como
 * "Authorization: Bearer" são recusadas. A antiga service_role continua indo
 * nos dois, como antes.
 */

function daLista(texto: string): string {
  if (!texto) return '';
  try {
    const lista = JSON.parse(texto) as unknown;
    if (typeof lista !== 'object' || lista === null || Array.isArray(lista)) return '';
    const porNome = lista as Record<string, unknown>;
    if (typeof porNome.default === 'string') return porNome.default;
    const primeira = Object.values(porNome).find((v) => typeof v === 'string');
    return typeof primeira === 'string' ? primeira : '';
  } catch {
    return '';
  }
}

export function chavesSupabase(env: (nome: string) => string): { publica: string; servico: string } {
  return {
    publica: daLista(env('SUPABASE_PUBLISHABLE_KEYS')) || env('SUPABASE_ANON_KEY'),
    servico: daLista(env('SUPABASE_SECRET_KEYS')) || env('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

/** Chave antiga (JWT: três partes separadas por ponto). */
export const ehChaveJwt = (chave: string): boolean => /^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(chave);

/** Cabeçalhos para chamar o banco com a chave de serviço. */
export function cabecalhosServico(chave: string): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json', apikey: chave };
  if (ehChaveJwt(chave)) h.authorization = `Bearer ${chave}`;
  return h;
}
