/**
 * Números digitados no padrão brasileiro, convertidos para inteiros nas
 * unidades do sistema. Toda função lança ErroCampo com mensagem para o usuário.
 */

export class ErroCampo extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroCampo';
  }
}

const limpar = (texto: string) => texto.replace(/[\s ]/g, '');

/**
 * Lê um decimal sem separador de milhar ("18", "18,5", "0.45") e devolve
 * o valor multiplicado por 10^casas, exato. Casas a mais só se forem zeros.
 */
export function lerDecimalEscalado(texto: string, casas: number, nome: string): number {
  const t = limpar(texto);
  const m = /^(\d+)(?:[.,](\d+))?$/.exec(t);
  if (!m) throw new ErroCampo(`${nome}: "${texto}" não é um número válido.`);
  const inteira = m[1] ?? '0';
  let fracao = m[2] ?? '';
  if (fracao.length > casas) {
    if (/[^0]/.test(fracao.slice(casas))) {
      throw new ErroCampo(`${nome}: "${texto}" tem mais de ${casas} casa${casas === 1 ? '' : 's'} decimal${casas === 1 ? '' : 'is'}.`);
    }
    fracao = fracao.slice(0, casas);
  }
  const valor = Number(inteira) * 10 ** casas + Number(fracao.padEnd(casas, '0') || '0');
  if (!Number.isSafeInteger(valor)) throw new ErroCampo(`${nome}: "${texto}" é grande demais.`);
  return valor;
}

/**
 * Preço em reais → centavos.
 * Aceita "R$ 1.234,56", "1234,56", "1234.56", "1.234" (mil e duzentos e
 * trinta e quatro reais) e "1234". Com vírgula, pontos são milhar.
 */
export function lerPrecoCentavos(texto: string, nome = 'Preço'): number {
  let t = limpar(texto).replace(/^R\$/i, '');
  if (t.startsWith('-')) throw new ErroCampo(`${nome}: não pode ser negativo.`);

  if (t.includes(',')) {
    const [inteira = '', fracao = '', ...resto] = t.split(',');
    if (resto.length > 0) throw new ErroCampo(`${nome}: "${texto}" não é um valor válido.`);
    if (inteira.includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(inteira)) {
      throw new ErroCampo(`${nome}: "${texto}" tem separador de milhar fora do lugar.`);
    }
    t = `${inteira.replace(/\./g, '')},${fracao}`;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '');
  }
  return lerDecimalEscalado(t, 2, nome);
}

/** Metros → décimos de milímetro (1 m = 10000). Até 4 casas decimais. */
export function lerMetrosEmDmm(texto: string, nome = 'Metros'): number {
  return lerDecimalEscalado(texto.replace(/\s*m$/i, ''), 4, nome);
}

/** Espessura de fita em mm → centésimos de mm ("0,45" → 45; "2" → 200). */
export function lerEspessuraCmm(texto: string, nome = 'Espessura'): number {
  return lerDecimalEscalado(texto.replace(/\s*mm$/i, ''), 2, nome);
}

export function lerInteiroNaoNegativo(texto: string, nome: string): number {
  const t = limpar(texto);
  if (!/^\d+$/.test(t)) throw new ErroCampo(`${nome}: "${texto}" precisa ser um número inteiro (sem casas decimais).`);
  const valor = Number(t);
  if (!Number.isSafeInteger(valor)) throw new ErroCampo(`${nome}: "${texto}" é grande demais.`);
  return valor;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatarMoeda(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return '';
  return BRL.format(centavos / 100).replace(/ /g, ' ');
}

/** Centavos → texto para campo de edição ("1234,56"). */
export function centavosParaTexto(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return '';
  const reais = Math.trunc(centavos / 100);
  const resto = Math.abs(centavos % 100);
  return `${reais},${String(resto).padStart(2, '0')}`;
}

/** Centésimos de mm → "0,45". */
export function formatarCmm(cmm: number): string {
  const inteira = Math.trunc(cmm / 100);
  const fracao = String(cmm % 100).padStart(2, '0').replace(/0+$/, '');
  return fracao ? `${inteira},${fracao}` : String(inteira);
}

/** Décimos de mm → metros, "1234,5". */
export function formatarMetros(dmm: number): string {
  const inteira = Math.trunc(dmm / 10000);
  const fracao = String(dmm % 10000).padStart(4, '0').replace(/0+$/, '');
  return fracao ? `${inteira},${fracao}` : String(inteira);
}
