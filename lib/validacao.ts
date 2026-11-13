/** Validações e formatações de documentos e contatos brasileiros. */

export const somenteDigitos = (texto: string): string => texto.replace(/\D/g, '');

/** Remove pontuação e passa para maiúsculas (CNPJ pode ter letras desde jul/2026). */
export const normalizarDocumento = (texto: string): string => texto.replace(/[^0-9A-Za-z]/g, '').toUpperCase();

function caracteresIguais(d: string): boolean {
  return /^(.)\1+$/.test(d);
}

export function cpfValido(texto: string): boolean {
  const d = somenteDigitos(texto);
  if (d.length !== 11 || caracteresIguais(d)) return false;
  const calc = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(d.slice(0, 9), 10) === Number(d[9]) && calc(d.slice(0, 10), 11) === Number(d[10]);
}

/**
 * CNPJ numérico ou alfanumérico. No alfanumérico, cada caractere vale
 * (código ASCII − 48); para dígitos isso dá o próprio dígito, então o
 * mesmo cálculo serve aos dois formatos.
 */
export function cnpjValido(texto: string): boolean {
  const d = normalizarDocumento(texto);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(d) || caracteresIguais(d)) return false;
  const valor = (c: string) => c.charCodeAt(0) - 48;
  const calc = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += valor(base[i] ?? '0') * (pesos[i] ?? 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calc(d.slice(0, 12)) === Number(d[12]) && calc(d.slice(0, 13)) === Number(d[13]);
}

/** CPF ou CNPJ válido; devolve o documento normalizado ou null se inválido. */
export function documentoNormalizado(texto: string): string | null {
  const d = normalizarDocumento(texto);
  if (/^[0-9]{11}$/.test(d)) return cpfValido(d) ? d : null;
  return cnpjValido(d) ? d : null;
}

export function formatarDocumento(texto: string | null): string {
  if (!texto) return '';
  const d = normalizarDocumento(texto);
  if (/^[0-9]{11}$/.test(d)) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\w{2})(\w{3})(\w{3})(\w{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return texto;
}

export const emailValido = (texto: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(texto.trim());

/** Só aceita caminhos internos no parâmetro ?proximo=, para não redirecionar para fora. */
export function caminhoInterno(valor: string | null, padrao = '/'): string {
  if (!valor || !valor.startsWith('/') || valor.startsWith('//') || valor.startsWith('/\\')) return padrao;
  return valor;
}

export function formatarData(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(iso));
}
