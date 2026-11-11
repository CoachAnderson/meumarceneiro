/**
 * Orçamento: custo e preço de venda.
 *
 * Dinheiro sempre em centavos inteiros. Percentuais em centésimos de ponto
 * (12,5% = 1250), para não usar ponto flutuante. Cada arredondamento é
 * explícito e acontece uma vez por linha:
 *   - custo de linha: para cima (nunca subestima o custo);
 *   - margem e desconto: ao centavo mais próximo.
 * O total é sempre a soma exata das linhas mostradas.
 */

export type CategoriaCusto = 'chapa' | 'fita' | 'ferragem' | 'mao_de_obra' | 'outro';

export interface LinhaCusto {
  categoria: CategoriaCusto;
  descricao: string;
  /** Texto da quantidade, já formatado ("3 chapas", "16,45 m"). */
  quantidade: string;
  /** Null = falta preço no cadastro; a linha fica fora da soma e o orçamento fica pendente. */
  custoCentavos: number | null;
}

export interface EntradaOrcamento {
  chapas: Array<{ descricao: string; quantidade: number; precoCentavos: number | null }>;
  /** Fita: comprimento em décimos de mm e preço por metro. */
  fitas: Array<{ descricao: string; comprimentoDmm: number; precoMetroCentavos: number | null }>;
  ferragens: Array<{ descricao: string; quantidade: number; precoCentavos: number | null }>;
  /** Mão de obra: minutos trabalhados e valor da hora. */
  maoDeObra?: { minutos: number; valorHoraCentavos: number };
  outros?: Array<{ descricao: string; valorCentavos: number }>;
  /** Margem sobre o custo, em centésimos de % (35% = 3500). */
  margemCentesimos: number;
  /** Desconto sobre o preço, em centésimos de %. */
  descontoCentesimos?: number;
}

export interface Orcamento {
  linhas: LinhaCusto[];
  custoPorCategoria: Record<CategoriaCusto, number>;
  custoCentavos: number;
  margemCentavos: number;
  /** Custo + margem. */
  precoCentavos: number;
  descontoCentavos: number;
  /** Preço − desconto: o que o cliente paga. */
  totalCentavos: number;
  /** Lucro depois do desconto (total − custo). Pode ser negativo. */
  lucroCentavos: number;
  /** Linhas sem preço: enquanto houver, o orçamento não deve ser emitido. */
  pendencias: string[];
}

export class ErroOrcamento extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroOrcamento';
  }
}

const LIMITE = 100_000_000_00; // R$ 100 milhões, em centavos

function inteiro(v: number, min: number, max: number, nome: string): void {
  if (!Number.isSafeInteger(v) || v < min || v > max) throw new ErroOrcamento(`${nome}: valor inválido.`);
}

/** a × b / divisor, arredondado para cima, com inteiros grandes. */
function mulDivCima(a: number, b: number, divisor: number): number {
  const r = (BigInt(a) * BigInt(b) + BigInt(divisor - 1)) / BigInt(divisor);
  return Number(r);
}

/** a × b / divisor, ao inteiro mais próximo (meio para cima). */
function mulDivProximo(a: number, b: number, divisor: number): number {
  const r = (BigInt(a) * BigInt(b) * 2n + BigInt(divisor)) / (BigInt(divisor) * 2n);
  return Number(r);
}

/** "16,45 m" a partir de décimos de mm (duas casas, para cima). */
function textoMetros(dmm: number): string {
  const cm = Math.ceil(dmm / 100);
  return `${Math.floor(cm / 100)},${String(cm % 100).padStart(2, '0')} m`;
}

export function calcularOrcamento(e: EntradaOrcamento): Orcamento {
  inteiro(e.margemCentesimos, 0, 100_000, 'Margem'); // até 1000%
  const desconto = e.descontoCentesimos ?? 0;
  inteiro(desconto, 0, 10_000, 'Desconto'); // até 100%

  const linhas: LinhaCusto[] = [];
  const pendencias: string[] = [];
  const pendente = (descricao: string) => pendencias.push(`${descricao}: sem preço no cadastro.`);

  for (const c of e.chapas) {
    inteiro(c.quantidade, 0, 100_000, `Quantidade de ${c.descricao}`);
    if (c.quantidade === 0) continue;
    if (c.precoCentavos !== null) inteiro(c.precoCentavos, 0, LIMITE, `Preço de ${c.descricao}`);
    else pendente(c.descricao);
    linhas.push({
      categoria: 'chapa',
      descricao: c.descricao,
      quantidade: `${c.quantidade} ${c.quantidade === 1 ? 'chapa' : 'chapas'}`,
      custoCentavos: c.precoCentavos === null ? null : c.quantidade * c.precoCentavos,
    });
  }
  for (const f of e.fitas) {
    inteiro(f.comprimentoDmm, 0, 1_000_000_000, `Comprimento de ${f.descricao}`);
    if (f.comprimentoDmm === 0) continue;
    if (f.precoMetroCentavos !== null) inteiro(f.precoMetroCentavos, 0, LIMITE, `Preço de ${f.descricao}`);
    else pendente(f.descricao);
    linhas.push({
      categoria: 'fita',
      descricao: f.descricao,
      quantidade: textoMetros(f.comprimentoDmm),
      // 1 m = 10 000 décimos de mm.
      custoCentavos: f.precoMetroCentavos === null ? null : mulDivCima(f.comprimentoDmm, f.precoMetroCentavos, 10_000),
    });
  }
  for (const h of e.ferragens) {
    inteiro(h.quantidade, 0, 1_000_000, `Quantidade de ${h.descricao}`);
    if (h.quantidade === 0) continue;
    if (h.precoCentavos !== null) inteiro(h.precoCentavos, 0, LIMITE, `Preço de ${h.descricao}`);
    else pendente(h.descricao);
    linhas.push({
      categoria: 'ferragem',
      descricao: h.descricao,
      quantidade: `${h.quantidade} un`,
      custoCentavos: h.precoCentavos === null ? null : h.quantidade * h.precoCentavos,
    });
  }
  if (e.maoDeObra && e.maoDeObra.minutos > 0) {
    inteiro(e.maoDeObra.minutos, 0, 6_000_000, 'Tempo de mão de obra');
    inteiro(e.maoDeObra.valorHoraCentavos, 0, LIMITE, 'Valor da hora');
    const h = Math.floor(e.maoDeObra.minutos / 60);
    const m = e.maoDeObra.minutos % 60;
    linhas.push({
      categoria: 'mao_de_obra',
      descricao: 'Mão de obra',
      quantidade: m === 0 ? `${h} h` : `${h} h ${m} min`,
      custoCentavos: mulDivCima(e.maoDeObra.minutos, e.maoDeObra.valorHoraCentavos, 60),
    });
  }
  for (const o of e.outros ?? []) {
    inteiro(o.valorCentavos, 0, LIMITE, o.descricao);
    linhas.push({ categoria: 'outro', descricao: o.descricao, quantidade: '', custoCentavos: o.valorCentavos });
  }

  const custoPorCategoria: Record<CategoriaCusto, number> = { chapa: 0, fita: 0, ferragem: 0, mao_de_obra: 0, outro: 0 };
  for (const l of linhas) custoPorCategoria[l.categoria] += l.custoCentavos ?? 0;
  const custo = Object.values(custoPorCategoria).reduce((s, v) => s + v, 0);
  if (!Number.isSafeInteger(custo) || custo > LIMITE) throw new ErroOrcamento('Custo total fora do limite.');

  const margem = mulDivProximo(custo, e.margemCentesimos, 10_000);
  const preco = custo + margem;
  const valorDesconto = mulDivProximo(preco, desconto, 10_000);
  const total = preco - valorDesconto;

  return {
    linhas,
    custoPorCategoria,
    custoCentavos: custo,
    margemCentavos: margem,
    precoCentavos: preco,
    descontoCentavos: valorDesconto,
    totalCentavos: total,
    lucroCentavos: total - custo,
    pendencias,
  };
}
