/**
 * Gerador de peças: transforma um módulo calculado em lista técnica.
 *
 * Aqui entram fita de borda, sentido do veio, usinagem do canal do fundo e
 * agrupamento de peças iguais. Função pura. Só aceita módulo válido: um módulo
 * com erro nunca vira lista de peças.
 *
 * As medidas das peças são as medidas ACABADAS (já com a fita). O desconto da
 * espessura da fita para o corte é feito no otimizador (Fase 6), porque a
 * fita tem centésimos de mm e a peça, décimos.
 */
import { intersecao, orientacaoDaPeca } from './geometria';
import type { Componente, ResultadoModulo } from './modulo';
import type { DirecaoFace, Furo } from './frentes';
import { NOME_FURO } from './furacao';
import type { MaterialComponente, PapelComponente } from './regra';
import { area, dmm, formatarMm, type Dmm, type Dmm2 } from './unidades';

/**
 * Bordas da peça. `frente` e `tras` são as bordas de comprimento `comprimento`
 * (as que acompanham o veio); `ext1` e `ext2` são as de comprimento `largura`.
 * `frente` é a borda voltada para quem usa o móvel.
 */
export interface Bordas {
  frente: boolean;
  tras: boolean;
  ext1: boolean;
  ext2: boolean;
}

export const SEM_BORDAS: Bordas = { frente: false, tras: false, ext1: false, ext2: false };

export type Usinagem = CanalFundo | Furacao;

/** Furos iguais numa face (copas de dobradiça, furos de pino). Coordenadas da peça. */
export interface Furacao extends Furo {
  tipo: 'furos';
}

export interface CanalFundo {
  tipo: 'canal_fundo';
  /** Largura do canal (espessura do fundo). */
  largura: Dmm;
  profundidade: Dmm;
  /** Distância da face traseira da peça até o canal. */
  distanciaTras: Dmm;
  /** Comprimento do canal: percorre a peça inteira, na direção do comprimento. */
  comprimento: Dmm;
  /** Distância da borda da frente da peça (v = 0) até o início do canal. */
  inicio?: Dmm;
  /** Face da peça onde o canal é aberto (a que olha para o fundo). */
  face?: DirecaoFace;
}

export interface Peca {
  /** Identificador do componente no módulo. */
  id: string;
  papel: PapelComponente;
  nome: string;
  material: MaterialComponente;
  comprimento: Dmm;
  largura: Dmm;
  espessura: Dmm;
  bordas: Bordas;
  /** Há sentido do veio a respeitar? Se não, a peça pode girar no plano de corte. */
  veio: boolean;
  usinagens: Usinagem[];
}

export interface ItemLista {
  /** Código estável na lista: P01, P02… */
  codigo: string;
  nome: string;
  papel: PapelComponente;
  material: MaterialComponente;
  comprimento: Dmm;
  largura: Dmm;
  espessura: Dmm;
  bordas: Bordas;
  veio: boolean;
  usinagens: Usinagem[];
  quantidade: number;
  /** Ids dos componentes (um por peça, repetidos se houver mais de um módulo). */
  ids: string[];
}

export interface TotalMaterial {
  material: MaterialComponente;
  espessura: Dmm;
  pecas: number;
  area: Dmm2;
}

export interface ListaPecas {
  itens: ItemLista[];
  totalPecas: number;
  porMaterial: TotalMaterial[];
  /** Soma dos comprimentos de fita, sem sobra. */
  fitaDmm: Dmm;
  /** Com a margem de perda pedida, arredondada para cima. */
  fitaComSobraDmm: Dmm;
}

export interface OpcoesPecas {
  /** Quantas vezes o módulo se repete (1 a 999). Padrão 1. */
  quantidadeModulos?: number;
  /** Peças com veio na estrutura/fundo. Padrão: estrutura sim, fundo não. */
  veioEstrutura?: boolean;
  veioFundo?: boolean;
  /** Portas e frentes de gaveta. Padrão: sim. */
  veioFrente?: boolean;
  /** Caixa da gaveta. Padrão: sim. */
  veioGaveta?: boolean;
  /** Troca as bordas padrão de um componente, pelo id. */
  bordas?: Readonly<Record<string, Partial<Bordas>>>;
  /** Margem de perda na fita, em %, inteira (0 a 100). Padrão 0. */
  sobraFitaPercentual?: number;
}

export class ErroPecas extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroPecas';
  }
}

/** Código usado no lugar da montagem quando o móvel é uma mesa. */
export const MONTAGEM_MESA = 'mesa';

const FRENTE: Bordas = { ...SEM_BORDAS, frente: true };
const TRES_LADOS: Bordas = { frente: true, tras: false, ext1: true, ext2: true };
const TODAS: Bordas = { frente: true, tras: true, ext1: true, ext2: true };

/** Bordas padrão: o que fica aparente. Fundo e travessa traseira não levam fita. */
export function bordasPadrao(c: Pick<Componente, 'id' | 'papel'>, codigoMontagem: string): Bordas {
  if (codigoMontagem === MONTAGEM_MESA) {
    // Tampo aparente em volta toda; a faixa engrossada fica coberta pela fita larga do tampo.
    if (c.papel === 'tampo') return TODAS;
    if (c.papel === 'engrosso') return SEM_BORDAS;
    // Pé: a frente e a traseira aparecem (a largura do pé é a profundidade).
    if (c.papel === 'pe') return { ...SEM_BORDAS, frente: true, tras: true };
    // Saia: a borda de baixo. Travessa: as duas bordas compridas.
    if (c.papel === 'saia') return FRENTE;
    if (c.papel === 'travessa') return { ...SEM_BORDAS, frente: true, tras: true };
  }
  if (c.papel === 'fundo' || c.papel === 'fundo_gaveta' || c.id === 'travessa_traseira') return SEM_BORDAS;
  // Portas e frentes de gaveta: fita em volta toda.
  if (c.papel === 'porta' || c.papel === 'frente_gaveta') return TODAS;
  // Caixa da gaveta: a largura dessas peças é a altura, então `tras` é a borda de cima.
  if (c.papel === 'lateral_gaveta' || c.papel === 'contrafrente_gaveta' || c.papel === 'traseira_gaveta') return { ...SEM_BORDAS, tras: true };
  // Tampo que cobre as laterais fica aparente na frente e nas duas pontas.
  if (c.papel === 'tampo' && codigoMontagem === 'tampo_sobre_laterais') return TRES_LADOS;
  return FRENTE;
}

export function comprimentoDeFita(peca: { comprimento: Dmm; largura: Dmm; bordas: Bordas }): Dmm {
  const b = peca.bordas;
  const total =
    (b.frente ? peca.comprimento : 0) +
    (b.tras ? peca.comprimento : 0) +
    (b.ext1 ? peca.largura : 0) +
    (b.ext2 ? peca.largura : 0);
  return dmm(total);
}

export interface EntradaGeracao {
  resultado: ResultadoModulo;
  /** Código da montagem usada, para as bordas padrão. */
  montagem: string;
  /** Código do fundo usado; "fundo_canal" gera usinagem. */
  fundo: string;
  espessuraFundo: Dmm;
  opcoes?: OpcoesPecas;
}

/** Gera as peças individuais (sem agrupar). */
export function gerarPecas(entrada: EntradaGeracao): Peca[] {
  const { resultado, opcoes = {} } = entrada;
  if (!resultado.valido) {
    throw new ErroPecas('O módulo tem erros; corrija as medidas antes de gerar a lista de peças.');
  }
  const veioEstrutura = opcoes.veioEstrutura ?? true;
  const veioFundo = opcoes.veioFundo ?? false;
  const veio: Record<MaterialComponente, boolean> = {
    estrutura: veioEstrutura,
    fundo: veioFundo,
    frente: opcoes.veioFrente ?? true,
    gaveta: opcoes.veioGaveta ?? true,
  };

  // Fundo em canal: o canal vai em toda peça que o fundo invade. Sai da
  // geometria, não de uma lista de papéis, então vale para qualquer montagem.
  const profundidadeCanal = resultado.medidas['c'];
  const temCanal = entrada.fundo === 'fundo_canal';
  const fundo = temCanal ? resultado.componentes.find((c) => c.papel === 'fundo') : undefined;
  if (temCanal && (profundidadeCanal === undefined || !fundo)) {
    throw new ErroPecas('Fundo em canal sem a peça de fundo ou a medida "c" no resultado do módulo.');
  }

  return resultado.componentes.filter((c) => !c.comprado).map((c) => {
    const base = bordasPadrao(c, entrada.montagem);
    const bordas: Bordas = { ...base, ...(opcoes.bordas?.[c.id] ?? {}) };
    const usinagens: Usinagem[] = [];
    if (fundo && c.id !== fundo.id && intersecao(c.caixa, fundo.caixa)) {
      usinagens.push({
        tipo: 'canal_fundo',
        largura: fundo.caixa.dz,
        profundidade: dmm(profundidadeCanal!),
        distanciaTras: dmm(c.caixa.z + c.caixa.dz - (fundo.caixa.z + fundo.caixa.dz)),
        comprimento: c.comprimento,
        ...posicaoDoCanal(c, fundo),
      });
    }
    for (const f of c.furos ?? []) usinagens.push({ tipo: 'furos', ...f });
    return {
      id: c.id,
      papel: c.papel,
      nome: c.nome,
      material: c.material,
      comprimento: c.comprimento,
      largura: c.largura,
      espessura: c.espessura,
      bordas,
      veio: veio[c.material],
      usinagens,
    };
  });
}

/** Nome de um item que reúne peças iguais: "Lateral esquerda" + "Lateral direita" = "Lateral". */
function nomeAgrupado(a: string, b: string): string {
  if (a === b) return a;
  const tronco = (n: string) => n.replace(/ \(vão \d+\)$/, '').replace(/ (?:esquerda|direita|\d+)$/, '');
  return tronco(a) === tronco(b) ? tronco(a) : `${a} + ${b}`;
}

function chaveBordas(b: Bordas): string {
  return `${+b.frente}${+b.tras}${+b.ext1}${+b.ext2}`;
}

function chaveItem(p: Peca): string {
  const u = p.usinagens
    .map((x) =>
      x.tipo === 'canal_fundo'
        ? `${x.tipo}:${x.largura}:${x.profundidade}:${x.distanciaTras}:${x.comprimento}`
        : `${x.tipo}:${x.finalidade}:${x.diametro}:${x.profundidade}:${x.face}:${+!!x.topo}${+!!x.passante}:${x.centros.map((c) => `${c.u},${c.v}`).join(';')}`,
    )
    .join('|');
  return [p.material, p.papel, p.comprimento, p.largura, p.espessura, chaveBordas(p.bordas), +p.veio, u].join('/');
}

/** Gera a lista técnica: agrupa peças iguais e soma áreas e fita. */
export function gerarListaPecas(entrada: EntradaGeracao): ListaPecas {
  const opcoes = entrada.opcoes ?? {};
  const modulos = opcoes.quantidadeModulos ?? 1;
  if (!Number.isInteger(modulos) || modulos < 1 || modulos > 999) {
    throw new ErroPecas('A quantidade de módulos precisa ser um inteiro de 1 a 999.');
  }
  const sobra = opcoes.sobraFitaPercentual ?? 0;
  if (!Number.isInteger(sobra) || sobra < 0 || sobra > 100) {
    throw new ErroPecas('A sobra de fita precisa ser um inteiro de 0 a 100 (%).');
  }

  const pecas = gerarPecas(entrada);
  const grupos = new Map<string, ItemLista>();
  for (const p of pecas) {
    const chave = chaveItem(p);
    const existente = grupos.get(chave);
    if (existente) {
      existente.quantidade += modulos;
      existente.nome = nomeAgrupado(existente.nome, p.nome);
      existente.ids.push(...Array.from({ length: modulos }, () => p.id));
    } else {
      grupos.set(chave, {
        codigo: '',
        nome: p.nome,
        papel: p.papel,
        material: p.material,
        comprimento: p.comprimento,
        largura: p.largura,
        espessura: p.espessura,
        bordas: p.bordas,
        veio: p.veio,
        usinagens: p.usinagens,
        quantidade: modulos,
        ids: Array.from({ length: modulos }, () => p.id),
      });
    }
  }
  const itens = [...grupos.values()];
  itens.forEach((it, i) => {
    it.codigo = `P${String(i + 1).padStart(2, '0')}`;
  });

  const totais = new Map<string, TotalMaterial>();
  let fita = 0;
  let totalPecas = 0;
  for (const it of itens) {
    totalPecas += it.quantidade;
    fita += comprimentoDeFita(it) * it.quantidade;
    const k = `${it.material}/${it.espessura}`;
    const t = totais.get(k) ?? { material: it.material, espessura: it.espessura, pecas: 0, area: 0 as Dmm2 };
    t.pecas += it.quantidade;
    t.area = (t.area + area(it.comprimento, it.largura) * it.quantidade) as Dmm2;
    totais.set(k, t);
  }
  if (!Number.isSafeInteger(fita)) throw new ErroPecas('Total de fita fora do limite.');

  return {
    itens,
    totalPecas,
    porMaterial: [...totais.values()],
    fitaDmm: dmm(fita),
    fitaComSobraDmm: dmm(Math.floor((fita * (100 + sobra) + 99) / 100)),
  };
}

const NOME_BORDA: Record<keyof Bordas, string> = {
  frente: 'frente',
  tras: 'trás',
  ext1: 'ponta 1',
  ext2: 'ponta 2',
};

/** Texto curto das bordas com fita, para listas e etiquetas. */
export function descreverBordas(b: Bordas): string {
  const l = (Object.keys(NOME_BORDA) as Array<keyof Bordas>).filter((k) => b[k]).map((k) => NOME_BORDA[k]);
  return l.length ? l.join(', ') : 'sem fita';
}

const NOME_FACE: Record<DirecaoFace, string> = { 'x+': 'face direita', 'x-': 'face esquerda', 'y+': 'face de cima', 'y-': 'face de baixo', 'z+': 'face de trás', 'z-': 'face da frente' };
const NOME_TOPO: Record<DirecaoFace, string> = { 'x+': 'topo direito', 'x-': 'topo esquerdo', 'y+': 'topo de cima', 'y-': 'topo de baixo', 'z+': 'topo de trás', 'z-': 'topo da frente' };

/** Onde fica o furo, em palavras: "face direita", "topo de cima". */
export const descreverFace = (u: Pick<Furacao, 'face' | 'topo'>): string => (u.topo ? NOME_TOPO : NOME_FACE)[u.face];

/** Texto curto de uma usinagem, para listas, etiquetas e CSV. Medidas em mm. */
/** Onde o canal cai na peça: início a partir da borda da frente e face que olha para o fundo. */
function posicaoDoCanal(c: Componente, fundo: Componente): { inicio?: Dmm; face?: DirecaoFace } {
  const o = orientacaoDaPeca(c);
  if (!o) return {};
  const [, el, ee] = o;
  const tam = { x: 'dx', y: 'dy', z: 'dz' } as const;
  const inicio = dmm(Math.max(0, fundo.caixa[el] - c.caixa[el]));
  const meioFundo = fundo.caixa[ee] * 2 + fundo.caixa[tam[ee]];
  const meioPeca = c.caixa[ee] * 2 + c.caixa[tam[ee]];
  const face = meioFundo === meioPeca ? undefined : (`${ee}${meioFundo > meioPeca ? '+' : '-'}` as DirecaoFace);
  return { inicio, ...(face ? { face } : {}) };
}

export function descreverUsinagem(u: Usinagem): string {
  if (u.tipo === 'canal_fundo') {
    return `Canal ${formatarMm(u.largura)} × ${formatarMm(u.profundidade)}, a ${formatarMm(u.distanciaTras)} da borda de trás`;
  }
  const n = u.centros.length;
  const oque = NOME_FURO[u.finalidade][n === 1 ? 0 : 1];
  return `${n} ${oque} Ø${formatarMm(u.diametro)} ${u.passante ? 'passante' : `× ${formatarMm(u.profundidade)}`} (${descreverFace(u)})`;
}
