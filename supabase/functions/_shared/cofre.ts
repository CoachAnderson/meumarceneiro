/**
 * Cofre das chaves das marcenarias (token do Mercado Pago, token da Focus NFe).
 *
 * AES-GCM de 256 bits com a chave do segredo INTEGRACOES_CHAVE (32 bytes em
 * base64; gere com `openssl rand -base64 32`). O banco guarda só o texto
 * cifrado: um vazamento do banco sozinho não entrega as chaves.
 *
 * Formato: "v1.<iv base64>.<cifra base64>". Usa só Web Crypto: roda no Deno e
 * no Node (testes).
 */

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const deB64 = (texto: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));

type Chave = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

async function chave(segredoBase64: string): Promise<Chave> {
  let bruto: Uint8Array<ArrayBuffer>;
  try {
    bruto = deB64(segredoBase64.trim());
  } catch {
    throw new Error('INTEGRACOES_CHAVE inválida (não é base64).');
  }
  if (bruto.length !== 32) throw new Error('INTEGRACOES_CHAVE precisa ter 32 bytes (gere com: openssl rand -base64 32).');
  return crypto.subtle.importKey('raw', bruto, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function cifrar(texto: string, segredoBase64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifra = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chave(segredoBase64), new TextEncoder().encode(texto)));
  return `v1.${b64(iv)}.${b64(cifra)}`;
}

export async function decifrar(guardado: string, segredoBase64: string): Promise<string> {
  const [versao, iv, cifra] = guardado.split('.');
  if (versao !== 'v1' || !iv || !cifra) throw new Error('Chave guardada em formato desconhecido.');
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) }, await chave(segredoBase64), deB64(cifra));
  return new TextDecoder().decode(claro);
}

/** Últimos 4 caracteres, para mostrar qual chave está salva. */
export const finalDaChave = (texto: string) => texto.trim().slice(-4);
