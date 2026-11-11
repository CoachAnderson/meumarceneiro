/**
 * Furação de montagem: junções da caixa (minifix, cavilha ou parafuso), calço
 * da dobradiça e puxador.
 *
 * As junções são achadas pela GEOMETRIA, não pelo nome da peça: onde o topo
 * de uma peça encosta inteiro na face de outra, há uma junção. Assim a
 * furação acompanha qualquer montagem, divisória ou prateleira fixa, e os
 * dois lados de cada junção saem sempre da mesma conta — o furo da face e o
 * furo do topo ficam, por construção, no mesmo ponto do móvel.
 *
 * Todas as medidas são parâmetros (PARAMETROS_FURACAO). Os padrões seguem o
 * que é mais comum (tambor de 15 mm a 34 mm da borda, cavilha 8 × 30, calço a
 * 37 mm da borda com furos a 32 mm), mas a referência é sempre a ferragem que
 * a marcenaria usa: confira com o gabarito do fabricante.
 */
import type { DirecaoFace, FerragemNecessaria, FinalidadeFuro, Furo } from './frentes';
import { orientacaoDaPeca, type Eixo } from './geometria';
import type { Componente, Problema } from './modulo';
import type { DefinicaoParametro, PapelComponente } from './regra';
import { distribuir, dmm, formatarMm, type Dmm } from './unidades';

export type TipoJuncao = 'nenhuma' | 'minifix' | 'cavilha' | 'parafuso';
/** Caixa da gaveta: minifix não cabe bem em lateral de 15 mm. */
export type TipoJuncaoGaveta = 'nenhuma' | 'cavilha' | 'parafuso';

export interface EntradaFuracao {
  /** Como as peças da caixa se prendem umas às outras. */
  juncao: TipoJuncao;
  /** Com minifix: uma cavilha ao lado do primeiro e do último minifix, para a peça não girar. */
  cavilhaComMinifix?: boolean;
  /** Furos do calço da dobradiça na lateral ou divisória. Padrão: sim. */
  calcoDobradica?: boolean;
  /** Distância entre os furos do puxador (0 = um furo só). Ausente ou null = não fura. */
  puxadorEntreFuros?: Dmm | null;
  /** Como a caixa da gaveta é montada. Com parafuso, o fundo também é parafusado. Ausente = não fura. */
  juncaoGaveta?: TipoJuncaoGaveta;
  /** Furos da corrediça na lateral (ou divisória) do móvel e na lateral da gaveta. */
  corredica?: boolean;
  /** Furos para prender a frente da gaveta pela contrafrente. */
  frenteGaveta?: boolean;
  /** Mesa: parafusos que prendem as faixas da borda engrossada por baixo. */
  engrosso?: boolean;
}

export const PARAMETROS_FURACAO: readonly DefinicaoParametro[] = [
  { nome: 'jf', rotulo: 'Junção: do primeiro ponto à borda da frente', padrao: 500, min: 150, max: 3000 },
  { nome: 'jt', rotulo: 'Junção: do último ponto à borda de trás', padrao: 500, min: 150, max: 3000 },
  { nome: 'jp', rotulo: 'Junção: distância máxima entre pontos', padrao: 5000, min: 640, max: 20000, ajuda: 'Acima disso entra um ponto a mais no meio.' },
  { nome: 'mfd', rotulo: 'Minifix: do centro do tambor à borda', padrao: 340, min: 200, max: 500, ajuda: 'Também é a profundidade do furo da haste, no topo.' },
  { nome: 'mft', rotulo: 'Minifix: diâmetro do tambor', padrao: 150, min: 100, max: 250 },
  { nome: 'mfp', rotulo: 'Minifix: profundidade do tambor', padrao: 130, min: 80, max: 200 },
  { nome: 'mfh', rotulo: 'Minifix: diâmetro do furo da haste (topo)', padrao: 80, min: 50, max: 100 },
  { nome: 'mfb', rotulo: 'Minifix: diâmetro do furo do pino (face)', padrao: 50, min: 30, max: 100, ajuda: '5 mm para pino de rosca direta; 8 ou 10 mm para pino com bucha.' },
  { nome: 'mfq', rotulo: 'Minifix: profundidade do furo do pino (face)', padrao: 120, min: 50, max: 200 },
  { nome: 'cvd', rotulo: 'Cavilha: diâmetro', padrao: 80, min: 50, max: 120 },
  { nome: 'cvc', rotulo: 'Cavilha: comprimento', padrao: 300, min: 200, max: 600 },
  { nome: 'cvf', rotulo: 'Cavilha: profundidade do furo na face', padrao: 120, min: 50, max: 250, ajuda: 'O furo do topo fica com o resto da cavilha mais 2 mm de folga.' },
  { nome: 'pfd', rotulo: 'Parafuso: diâmetro do furo passante (face)', padrao: 40, min: 20, max: 80 },
  { nome: 'pfg', rotulo: 'Parafuso: diâmetro do furo-guia (topo)', padrao: 30, min: 15, max: 60 },
  { nome: 'pfp', rotulo: 'Parafuso: profundidade do furo-guia (topo)', padrao: 300, min: 100, max: 600 },
  { nome: 'czd', rotulo: 'Calço da dobradiça: dos furos à frente da lateral', padrao: 370, min: 200, max: 800, ajuda: 'Porta embutida: soma-se a espessura da porta.' },
  { nome: 'cze', rotulo: 'Calço da dobradiça: distância entre os dois furos', padrao: 320, min: 160, max: 640 },
  { nome: 'czf', rotulo: 'Calço da dobradiça: diâmetro do furo', padrao: 50, min: 20, max: 100 },
  { nome: 'czp', rotulo: 'Calço da dobradiça: profundidade do furo', padrao: 120, min: 30, max: 200 },
  { nome: 'pxf', rotulo: 'Puxador: diâmetro do furo', padrao: 50, min: 30, max: 100 },
  { nome: 'pxb', rotulo: 'Puxador na porta: do centro à borda de abrir', padrao: 500, min: 150, max: 3000 },
  { nome: 'pxa', rotulo: 'Puxador na porta: do centro à borda de cima (0 = no meio)', padrao: 0, min: 0, max: 20000 },
  { nome: 'crh', rotulo: 'Corrediça: altura dos furos acima da base da lateral da gaveta', padrao: 225, min: 50, max: 1500, ajuda: 'Corrediça de 45 mm alinhada embaixo: 22,5 mm.' },
  { nome: 'crf', rotulo: 'Corrediça no móvel: do primeiro furo à frente da corrediça', padrao: 370, min: 0, max: 3000 },
  { nome: 'crp', rotulo: 'Corrediça no móvel: distância entre furos', padrao: 1280, min: 320, max: 6000 },
  { nome: 'cgf', rotulo: 'Corrediça na gaveta: do primeiro furo à frente da corrediça', padrao: 370, min: 0, max: 3000 },
  { nome: 'cgp', rotulo: 'Corrediça na gaveta: distância entre furos', padrao: 1280, min: 320, max: 6000 },
  { nome: 'crt', rotulo: 'Corrediça: sem furo nos últimos', padrao: 200, min: 0, max: 2000, ajuda: 'Distância mínima do último furo ao fim da corrediça.' },
  { nome: 'crd', rotulo: 'Corrediça: diâmetro do furo-guia', padrao: 25, min: 15, max: 50 },
  { nome: 'crq', rotulo: 'Corrediça: profundidade no móvel', padrao: 100, min: 30, max: 200 },
  { nome: 'cgq', rotulo: 'Corrediça: profundidade na gaveta', padrao: 80, min: 30, max: 200 },
  { nome: 'gfm', rotulo: 'Frente da gaveta: dos parafusos às bordas da contrafrente', padrao: 300, min: 150, max: 2000 },
  { nome: 'gfd', rotulo: 'Frente da gaveta: diâmetro do furo na contrafrente', padrao: 45, min: 20, max: 80 },
  { nome: 'gfg', rotulo: 'Frente da gaveta: diâmetro do furo-guia na frente', padrao: 30, min: 15, max: 60 },
  { nome: 'gfq', rotulo: 'Frente da gaveta: profundidade do furo-guia na frente', padrao: 100, min: 30, max: 200 },
  { nome: 'egm', rotulo: 'Borda engrossada: dos parafusos às pontas da faixa', padrao: 500, min: 150, max: 3000 },
  { nome: 'egp', rotulo: 'Borda engrossada: distância máxima entre parafusos', padrao: 2500, min: 640, max: 10000 },
  { nome: 'egd', rotulo: 'Borda engrossada: diâmetro do furo na faixa', padrao: 40, min: 20, max: 80 },
  { nome: 'egg', rotulo: 'Borda engrossada: diâmetro do furo-guia', padrao: 30, min: 15, max: 60 },
  { nome: 'egq', rotulo: 'Borda engrossada: profundidade do furo-guia', padrao: 100, min: 30, max: 200 },
];

/** Sobra mínima de material atrás de um furo cego (1,5 mm). */
const PAREDE_MINIMA = 15;
/** Peças que formam a caixa e recebem furação de junção. */
const ESTRUTURA: ReadonlySet<PapelComponente> = new Set(['lateral', 'tampo', 'base', 'travessa', 'divisoria', 'prateleira_fixa', 'pe', 'saia']);
/** Peças da caixa da gaveta. */
const CAIXA_GAVETA: ReadonlySet<PapelComponente> = new Set(['lateral_gaveta', 'contrafrente_gaveta', 'traseira_gaveta', 'fundo_gaveta']);

const TAM: Record<Eixo, 'dx' | 'dy' | 'dz'> = { x: 'dx', y: 'dy', z: 'dz' };
type Ponto = Record<Eixo, number>;

interface PecaOrientada {
  c: Componente;
  /** Eixos do comprimento, da largura e da espessura. */
  ec: Eixo;
  el: Eixo;
  ee: Eixo;
}

function orientar(c: Componente): PecaOrientada | null {
  const o = orientacaoDaPeca(c);
  return o ? { c, ec: o[0], el: o[1], ee: o[2] } : null;
}

/** Ponto do móvel em coordenadas da peça. */
const naPeca = (p: PecaOrientada, g: Ponto) => ({ u: dmm(g[p.ec] - p.c.caixa[p.ec]), v: dmm(g[p.el] - p.c.caixa[p.el]) });

function furar(p: PecaOrientada, f: Omit<Furo, 'centros'>, pontos: Ponto[]): void {
  if (pontos.length === 0) return;
  const centros = pontos.map((g) => naPeca(p, g));
  const igual = (p.c.furos ?? []).find(
    (x) => x.finalidade === f.finalidade && x.face === f.face && x.diametro === f.diametro && x.profundidade === f.profundidade && !!x.topo === !!f.topo && !!x.passante === !!f.passante,
  );
  if (igual) igual.centros.push(...centros);
  else p.c.furos = [...(p.c.furos ?? []), { ...f, centros }];
}

/** Uma junção: o topo de `a` encosta na face de `b`. */
export interface Juncao {
  /** Peça furada no topo. */
  a: string;
  /** Peça furada na face. */
  b: string;
  /** Pontos de fixação, em coordenadas do móvel (no plano de contato, no meio da espessura de `a`). */
  pontos: Ponto[];
}

/** Posições ao longo de um trecho [t0, t1]: jf da frente, jt do fundo, e pontos a mais se o vão passar de jp. */
export function posicoesDaJuncao(t0: number, t1: number, jf: number, jt: number, jp: number): number[] {
  const comprimento = t1 - t0;
  if (comprimento < 400) return [];
  const primeiro = t0 + jf;
  const ultimo = t1 - jt;
  // Curta demais para dois pontos afastados 32 mm: um só, no meio.
  if (ultimo - primeiro < 320) return [t0 + Math.floor(comprimento / 2)];
  const trechos = Math.max(1, Math.ceil((ultimo - primeiro) / jp));
  const r = [primeiro];
  for (const passo of distribuir(dmm(ultimo - primeiro), trechos)) r.push(r.at(-1)! + passo);
  return r;
}

interface Contato {
  a: PecaOrientada;
  b: PecaOrientada;
  /** Eixo perpendicular ao contato (espessura de b). */
  d: Eixo;
  /** Em que ponta de `a` (no eixo d) fica o contato. */
  ponta: 'min' | 'max';
  /** Eixo ao longo da junção. */
  t: Eixo;
  t0: number;
  t1: number;
}

function contatos(pecas: PecaOrientada[]): Contato[] {
  const r: Contato[] = [];
  for (const a of pecas) {
    for (const b of pecas) {
      if (a === b) continue;
      for (const d of [a.ec, a.el]) {
        if (d !== b.ee) continue;
        const t = d === a.ec ? a.el : a.ec;
        const ka = a.c.caixa;
        const kb = b.c.caixa;
        for (const ponta of ['min', 'max'] as const) {
          const plano = ponta === 'min' ? ka[d] : ka[d] + ka[TAM[d]];
          const faceB = ponta === 'min' ? kb[d] + kb[TAM[d]] : kb[d];
          if (plano !== faceB) continue;
          // O topo de `a` tem de assentar inteiro na face de `b`, na espessura.
          if (ka[a.ee] < kb[a.ee] || ka[a.ee] + ka[TAM[a.ee]] > kb[a.ee] + kb[TAM[a.ee]]) continue;
          const t0 = Math.max(ka[t], kb[t]);
          const t1 = Math.min(ka[t] + ka[TAM[t]], kb[t] + kb[TAM[t]]);
          if (t1 - t0 > 0) r.push({ a, b, d, ponta, t, t0, t1 });
        }
      }
    }
  }
  return r;
}

export interface ContextoFuracao {
  /** Parâmetros já validados (décimos de mm). */
  n: (nome: string) => number;
  componentes: Componente[];
  erros: Problema[];
  avisos: Problema[];
  ferragens: FerragemNecessaria[];
  /** Espessura da frente e modo, quando há portas. */
  frentes?: { espessura: Dmm; sobreposta: boolean; puxador: boolean };
}

/**
 * Aplica a furação de montagem nos componentes (acrescenta `furos`) e soma as
 * ferragens. Devolve as junções encontradas, para conferência e desenho.
 */
export function furarMontagem(f: EntradaFuracao, ctx: ContextoFuracao): Juncao[] {
  const { n, componentes, erros, avisos, ferragens } = ctx;
  const orientadas = new Map<string, PecaOrientada>();
  for (const c of componentes) {
    const o = orientar(c);
    if (o) orientadas.set(c.id, o);
  }
  const juncoes: Juncao[] = [];

  const profundo = (peca: Componente, profundidade: number, oque: string): boolean => {
    if (profundidade + PAREDE_MINIMA <= peca.espessura) return false;
    erros.push({
      codigo: 'furo_profundo',
      mensagem: `${oque}: furo de ${formatarMm(dmm(profundidade))} mm de profundidade não cabe em ${peca.nome}, de ${formatarMm(peca.espessura)} mm. Reduza a profundidade nos parâmetros de furação.`,
      componente: peca.id,
    });
    return true;
  };

  // ---- Junções: caixa do móvel e caixas de gaveta.
  const contagem = { minifix: 0, cavilha: 0, parafuso_montagem: 0, parafuso_gaveta: 0 };
  const curtas = new Set<string>();
  const juntar = (estrutura: PecaOrientada[], tipo: TipoJuncao, comCavilha: boolean, codigoParafuso: 'parafuso_montagem' | 'parafuso_gaveta') => {
    if (tipo === 'nenhuma' || estrutura.length < 2) return;
    // Centro da caixa, para saber qual face de cada peça olha para dentro.
    const centro: Ponto = { x: 0, y: 0, z: 0 };
    for (const eixo of ['x', 'y', 'z'] as const) {
      const min = Math.min(...estrutura.map((p) => p.c.caixa[eixo]));
      const max = Math.max(...estrutura.map((p) => p.c.caixa[eixo] + p.c.caixa[TAM[eixo]]));
      centro[eixo] = (min + max) / 2;
    }
    const [jf, jt, jp] = [n('jf'), n('jt'), n('jp')];

    for (const k of contatos(estrutura)) {
      const { a, b, d, ponta, t } = k;
      const posicoes = posicoesDaJuncao(k.t0, k.t1, jf, jt, jp);
      if (posicoes.length === 0) {
        curtas.add(`${a.c.nome} com ${b.c.nome}`);
        continue;
      }
      const ka = a.c.caixa;
      const plano = ponta === 'min' ? ka[d] : ka[d] + ka[TAM[d]];
      const meio = ka[a.ee] + Math.floor(a.c.espessura / 2);
      const ponto = (pos: number, recuo = 0): Ponto => {
        const g: Ponto = { x: 0, y: 0, z: 0 };
        g[d] = ponta === 'min' ? plano + recuo : plano - recuo;
        g[a.ee] = meio;
        g[t] = pos;
        return g;
      };
      const pontos = posicoes.map((p) => ponto(p));
      juncoes.push({ a: a.c.id, b: b.c.id, pontos });

      // Face de `b` que recebe o topo de `a`, a borda de `a` e a face de fora de `b`.
      const faceB = `${d}${ponta === 'min' ? '+' : '-'}` as DirecaoFace;
      const foraB = `${d}${ponta === 'min' ? '-' : '+'}` as DirecaoFace;
      const topoA = `${d}${ponta === 'min' ? '-' : '+'}` as DirecaoFace;
      const nome = `${a.c.nome} com ${b.c.nome}`;

      const cavilhar = (onde: Ponto[]) => {
        const [cvd, cvc, cvf] = [n('cvd'), n('cvc'), n('cvf')];
        if (cvf >= cvc) {
          erros.push({ codigo: 'cavilha_invalida', mensagem: 'Cavilha: a profundidade do furo na face precisa ser menor que o comprimento da cavilha.' });
          return;
        }
        if (profundo(b.c, cvf, `Cavilha (${nome})`)) return;
        furar(b, { finalidade: 'cavilha', diametro: dmm(cvd), profundidade: dmm(cvf), face: faceB }, onde);
        furar(a, { finalidade: 'cavilha', diametro: dmm(cvd), profundidade: dmm(cvc - cvf + 20), face: topoA, topo: true }, onde);
        contagem.cavilha += onde.length;
      };

      if (tipo === 'cavilha') {
        cavilhar(pontos);
      } else if (tipo === 'parafuso') {
        furar(b, { finalidade: 'parafuso', diametro: dmm(n('pfd')), profundidade: b.c.espessura, face: foraB, passante: true }, pontos);
        furar(a, { finalidade: 'parafuso_guia', diametro: dmm(n('pfg')), profundidade: dmm(n('pfp')), face: topoA, topo: true }, pontos);
        contagem[codigoParafuso] += pontos.length;
      } else {
        const [mfd, mft, mfp, mfh, mfb, mfq] = [n('mfd'), n('mft'), n('mfp'), n('mfh'), n('mfb'), n('mfq')];
        if (profundo(a.c, mfp, `Tambor do minifix (${nome})`) || profundo(b.c, mfq, `Pino do minifix (${nome})`)) continue;
        if (mfh + 2 * PAREDE_MINIMA > a.c.espessura) {
          erros.push({ codigo: 'furo_largo', mensagem: `Minifix (${nome}): o furo da haste, de ${formatarMm(dmm(mfh))} mm, não cabe no topo de ${a.c.nome}, de ${formatarMm(a.c.espessura)} mm.`, componente: a.c.id });
          continue;
        }
        // Tambor na face que olha para dentro da caixa; peça no meio: por baixo (ou pela direita).
        const centroA = ka[a.ee] + a.c.espessura / 2;
        const dentro = centroA < centro[a.ee] ? '+' : centroA > centro[a.ee] ? '-' : a.ee === 'y' ? '-' : '+';
        const sentido = a.c.papel === 'prateleira_fixa' ? '-' : a.c.papel === 'divisoria' ? '+' : dentro;
        furar(b, { finalidade: 'minifix_pino', diametro: dmm(mfb), profundidade: dmm(mfq), face: faceB }, pontos);
        furar(a, { finalidade: 'minifix_haste', diametro: dmm(mfh), profundidade: dmm(mfd), face: topoA, topo: true }, pontos);
        furar(a, { finalidade: 'minifix_tambor', diametro: dmm(mft), profundidade: dmm(mfp), face: `${a.ee}${sentido}` as DirecaoFace }, posicoes.map((p) => ponto(p, mfd)));
        contagem.minifix += pontos.length;
        // Cavilha a 32 mm do primeiro e do último minifix, para dentro.
        if (comCavilha && posicoes.length >= 2 && posicoes.at(-1)! - posicoes[0]! >= 1280) {
          cavilhar([ponto(posicoes[0]! + 320), ponto(posicoes.at(-1)! - 320)]);
        }
      }
    }
  };

  juntar([...orientadas.values()].filter((p) => ESTRUTURA.has(p.c.papel)), f.juncao, !!f.cavilhaComMinifix, 'parafuso_montagem');

  // Caixas de gaveta: cada gaveta é uma montagem separada. O fundo (embaixo das
  // laterais) só é parafusado; não há espessura para cavilha.
  const gavetas = new Map<string, PecaOrientada[]>();
  for (const p of orientadas.values()) {
    const m = /^(gaveta_v\d+_\d+)_/.exec(p.c.id);
    if (m && CAIXA_GAVETA.has(p.c.papel)) gavetas.set(m[1]!, [...(gavetas.get(m[1]!) ?? []), p]);
  }
  const tipoGaveta = f.juncaoGaveta ?? 'nenhuma';
  for (const pecas of gavetas.values()) {
    juntar(pecas.filter((p) => tipoGaveta === 'parafuso' || p.c.papel !== 'fundo_gaveta'), tipoGaveta, false, 'parafuso_gaveta');
  }

  for (const codigo of ['minifix', 'cavilha', 'parafuso_montagem', 'parafuso_gaveta'] as const) {
    if (contagem[codigo]) ferragens.push({ codigo, descricao: '', quantidade: contagem[codigo] });
  }
  for (const c of curtas) avisos.push({ codigo: 'juncao_curta', mensagem: `${c}: o encontro tem menos de 40 mm e ficou sem furação; fixe à mão.` });

  /** Contrafrente da mesma gaveta, encostada atrás da frente. */
  const contrafrenteDe = (frente: PecaOrientada): PecaOrientada | null => {
    const cf = orientadas.get(frente.c.id.replace(/_frente$/, '_contrafrente'));
    if (!cf || cf === frente) return null;
    return frente.c.caixa.z + frente.c.caixa.dz === cf.c.caixa.z ? cf : null;
  };

  // ---- Portas: calço da dobradiça e puxador.
  const paredes = [...orientadas.values()].filter((p) => (p.c.papel === 'lateral' || p.c.papel === 'divisoria') && p.ee === 'x');
  const comPuxador = ctx.frentes?.puxador !== false && f.puxadorEntreFuros !== undefined && f.puxadorEntreFuros !== null;
  const entre = f.puxadorEntreFuros ?? 0;
  if (comPuxador && (!Number.isSafeInteger(entre) || entre < 0 || entre > 10000)) {
    erros.push({ codigo: 'puxador_invalido', mensagem: 'Puxador: a distância entre furos precisa ficar entre 0 e 1000 mm.' });
    return juncoes;
  }

  for (const porta of orientadas.values()) {
    if (porta.c.papel !== 'porta') continue;
    const kp = porta.c.caixa;
    const copas = (porta.c.furos ?? []).find((x) => x.finalidade === 'dobradica');
    if (!copas || copas.centros.length === 0) continue;
    // Lado das dobradiças: onde estão as copas.
    const xCopa = kp.x + (porta.el === 'x' ? copas.centros[0]!.v : copas.centros[0]!.u);
    const esquerda = xCopa < kp.x + kp.dx / 2;

    if (f.calcoDobradica !== false && ctx.frentes) {
      const borda = esquerda ? kp.x : kp.x + kp.dx;
      const parede = paredes
        .map((p) => ({ p, dist: Math.abs(p.c.caixa.x + p.c.caixa.dx / 2 - borda) }))
        .sort((x, y) => x.dist - y.dist)[0]?.p;
      if (!parede) {
        avisos.push({ codigo: 'calco_sem_parede', mensagem: `${porta.c.nome}: não há lateral para o calço da dobradiça.`, componente: porta.c.id });
      } else if (!profundo(parede.c, n('czp'), `Calço da dobradiça (${porta.c.nome})`)) {
        const [czd, cze] = [n('czd'), n('cze')];
        const z = (ctx.frentes.sobreposta ? 0 : ctx.frentes.espessura) + czd;
        const kw = parede.c.caixa;
        if (z - kw.z < 100 || z > kw.z + kw.dz - 100) {
          avisos.push({ codigo: 'calco_fora', mensagem: `${porta.c.nome}: o calço da dobradiça cairia fora de ${parede.c.nome} (recuo da frente). Posicione à mão.`, componente: parede.c.id });
        } else {
          const paraDireita = kp.x + kp.dx / 2 > kw.x + kw.dx / 2;
          const xFace = paraDireita ? kw.x + kw.dx : kw.x;
          const pontos: Ponto[] = [];
          for (const c of copas.centros) {
            const y = kp.y + (porta.ec === 'y' ? c.u : c.v);
            pontos.push({ x: xFace, y: y - Math.floor(cze / 2), z }, { x: xFace, y: y - Math.floor(cze / 2) + cze, z });
          }
          const fora = pontos.filter((g) => g.y < kw.y + 50 || g.y > kw.y + kw.dy - 50);
          if (fora.length) avisos.push({ codigo: 'calco_fora', mensagem: `${porta.c.nome}: há furo de calço fora de ${parede.c.nome}. Confira a posição das dobradiças.`, componente: parede.c.id });
          furar(parede, { finalidade: 'calco_dobradica', diametro: dmm(n('czf')), profundidade: dmm(n('czp')), face: paraDireita ? 'x+' : 'x-' }, pontos.filter((g) => !fora.includes(g)));
        }
      }
    }

    if (comPuxador) {
      const [pxb, pxa] = [n('pxb'), n('pxa')];
      const x = esquerda ? kp.x + kp.dx - pxb : kp.x + pxb;
      const y = pxa === 0 ? kp.y + Math.floor(kp.dy / 2) : kp.y + kp.dy - pxa;
      const meia = Math.floor(entre / 2);
      const pontos: Ponto[] = entre === 0 ? [{ x, y, z: kp.z }] : [{ x, y: y - meia, z: kp.z }, { x, y: y - meia + entre, z: kp.z }];
      const cabe = pontos.every((g) => g.x >= kp.x + 100 && g.x <= kp.x + kp.dx - 100 && g.y >= kp.y + 100 && g.y <= kp.y + kp.dy - 100);
      if (!cabe) avisos.push({ codigo: 'puxador_fora', mensagem: `${porta.c.nome}: o puxador não cabe na posição configurada; fure à mão.`, componente: porta.c.id });
      else furar(porta, { finalidade: 'puxador', diametro: dmm(n('pxf')), profundidade: porta.c.espessura, face: 'z-', passante: true }, pontos);
    }
  }

  // ---- Frentes de gaveta: puxador no centro, deitado.
  if (comPuxador) {
    for (const frente of orientadas.values()) {
      if (frente.c.papel !== 'frente_gaveta') continue;
      const k = frente.c.caixa;
      const x = k.x + Math.floor(k.dx / 2);
      const y = k.y + Math.floor(k.dy / 2);
      const meia = Math.floor(entre / 2);
      const pontos: Ponto[] = entre === 0 ? [{ x, y, z: k.z }] : [{ x: x - meia, y, z: k.z }, { x: x - meia + entre, y, z: k.z }];
      if (!pontos.every((g) => g.x >= k.x + 100 && g.x <= k.x + k.dx - 100)) {
        avisos.push({ codigo: 'puxador_fora', mensagem: `${frente.c.nome}: o puxador é mais largo que a frente; fure à mão.`, componente: frente.c.id });
      } else {
        furar(frente, { finalidade: 'puxador', diametro: dmm(n('pxf')), profundidade: frente.c.espessura, face: 'z-', passante: true }, pontos);
        // O parafuso do puxador entra por dentro da gaveta: atravessa a contrafrente também.
        const cf = contrafrenteDe(frente);
        if (cf) {
          const kc = cf.c.caixa;
          const raio = n('pxf') / 2;
          if (pontos.every((g) => g.x - raio >= kc.x && g.x + raio <= kc.x + kc.dx && g.y - raio >= kc.y && g.y + raio <= kc.y + kc.dy)) {
            furar(cf, { finalidade: 'puxador', diametro: dmm(n('pxf')), profundidade: cf.c.espessura, face: 'z-', passante: true }, pontos);
          } else {
            avisos.push({ codigo: 'puxador_fora', mensagem: `${frente.c.nome}: o furo do puxador não cai na contrafrente; confira o parafuso do puxador.`, componente: frente.c.id });
          }
        }
      }
    }
  }

  // ---- Frente da gaveta presa pela contrafrente: passante na contrafrente, guia atrás da frente.
  if (f.frenteGaveta) {
    let parafusosFrente = 0;
    const [gfm, gfd, gfg, gfq] = [n('gfm'), n('gfd'), n('gfg'), n('gfq')];
    for (const frente of orientadas.values()) {
      if (frente.c.papel !== 'frente_gaveta') continue;
      const cf = contrafrenteDe(frente);
      if (!cf) continue;
      if (profundo(frente.c, gfq, `Fixação da frente (${frente.c.nome})`)) continue;
      const kc = cf.c.caixa;
      const xs = posicoesDaJuncao(kc.x, kc.x + kc.dx, gfm, gfm, 5000);
      const ys = posicoesDaJuncao(kc.y, kc.y + kc.dy, gfm, gfm, 1_000_000);
      if (xs.length === 0 || ys.length === 0) {
        avisos.push({ codigo: 'frente_sem_fixacao', mensagem: `${frente.c.nome}: a contrafrente é pequena demais para os furos de fixação; fixe à mão.`, componente: frente.c.id });
        continue;
      }
      const pontos = ys.flatMap((y) => xs.map((x) => ({ x, y, z: kc.z })));
      furar(cf, { finalidade: 'fixacao_frente', diametro: dmm(gfd), profundidade: cf.c.espessura, face: 'z+', passante: true }, pontos);
      furar(frente, { finalidade: 'fixacao_frente', diametro: dmm(gfg), profundidade: dmm(gfq), face: 'z+' }, pontos);
      parafusosFrente += pontos.length;
    }
    if (parafusosFrente) ferragens.push({ codigo: 'parafuso_frente', descricao: '', quantidade: parafusosFrente });
  }

  // ---- Corrediça: furos-guia na parede do móvel e na lateral da gaveta, na mesma altura.
  if (f.corredica) {
    let parafusosCorredica = 0;
    const [crh, crf, crp, cgf, cgp, crt, crd, crq, cgq] = ['crh', 'crf', 'crp', 'cgf', 'cgp', 'crt', 'crd', 'crq', 'cgq'].map(n) as [number, number, number, number, number, number, number, number, number];
    const paredesX = [...orientadas.values()].filter((p) => (p.c.papel === 'lateral' || p.c.papel === 'divisoria') && p.ee === 'x');
    for (const lat of orientadas.values()) {
      if (lat.c.papel !== 'lateral_gaveta') continue;
      const k = lat.c.caixa;
      const esquerda = lat.c.id.endsWith('_lateral_e');
      const comprimento = k.dz; // a lateral da gaveta tem o comprimento da corrediça
      const y = k.y + crh;
      const ao = (primeiro: number, passo: number) => {
        const r: number[] = [];
        for (let z = primeiro; z <= comprimento - crt; z += passo) r.push(k.z + z);
        return r;
      };
      if (y + crd / 2 > k.y + k.dy) {
        avisos.push({ codigo: 'corredica_alta', mensagem: `${lat.c.nome}: a altura dos furos da corrediça passa da lateral da gaveta; confira o parâmetro.`, componente: lat.c.id });
        continue;
      }
      if (profundo(lat.c, cgq, `Corrediça (${lat.c.nome})`)) continue;
      const naGaveta = ao(cgf, cgp);
      const noMovel = ao(crf, crp);
      if (naGaveta.length === 0 || noMovel.length === 0) {
        avisos.push({ codigo: 'corredica_sem_furo', mensagem: `${lat.c.nome}: com estes parâmetros não sobra furo na corrediça de ${formatarMm(dmm(comprimento))} mm.`, componente: lat.c.id });
        continue;
      }
      const xFora = esquerda ? k.x : k.x + k.dx;
      furar(lat, { finalidade: 'corredica', diametro: dmm(crd), profundidade: dmm(cgq), face: esquerda ? 'x-' : 'x+' }, naGaveta.map((z) => ({ x: xFora, y, z })));
      parafusosCorredica += naGaveta.length;

      // Parede do móvel do mesmo lado: a primeira cuja face fica de frente para a gaveta.
      const parede = paredesX
        .filter((p) => (esquerda ? p.c.caixa.x + p.c.caixa.dx <= k.x : p.c.caixa.x >= k.x + k.dx))
        .filter((p) => p.c.caixa.y <= y - crd && p.c.caixa.y + p.c.caixa.dy >= y + crd && p.c.caixa.z <= noMovel[0]! && p.c.caixa.z + p.c.caixa.dz >= noMovel.at(-1)!)
        .sort((a, b) => (esquerda ? b.c.caixa.x - a.c.caixa.x : a.c.caixa.x - b.c.caixa.x))[0];
      if (!parede) {
        avisos.push({ codigo: 'corredica_sem_parede', mensagem: `${lat.c.nome}: não há lateral do móvel para fixar a corrediça.`, componente: lat.c.id });
        continue;
      }
      if (profundo(parede.c, crq, `Corrediça (${parede.c.nome})`)) continue;
      const xFace = esquerda ? parede.c.caixa.x + parede.c.caixa.dx : parede.c.caixa.x;
      furar(parede, { finalidade: 'corredica', diametro: dmm(crd), profundidade: dmm(crq), face: esquerda ? 'x+' : 'x-' }, noMovel.map((z) => ({ x: xFace, y, z })));
      parafusosCorredica += noMovel.length;
    }
    if (parafusosCorredica) ferragens.push({ codigo: 'parafuso_corredica', descricao: '', quantidade: parafusosCorredica });
  }

  // ---- Mesa: faixas da borda engrossada parafusadas por baixo na peça de cima
  // (tampo ou outra faixa). Cada camada fura numa linha diferente da largura,
  // para o parafuso de baixo não cair no furo da faixa de cima.
  if (f.engrosso) {
    let parafusosEngrosso = 0;
    const faixas = [...orientadas.values()].filter((p) => p.c.papel === 'engrosso');
    const camadas = new Set(faixas.map((p) => p.c.caixa.y)).size;
    const ordem = [...new Set(faixas.map((p) => p.c.caixa.y))].sort((a, b) => b - a);
    for (const faixa of faixas) {
      const k = faixa.c.caixa;
      const acima = [...orientadas.values()].find(
        (p) => p !== faixa && p.c.caixa.y === k.y + k.dy && p.ee === 'y' && p.c.caixa.x <= k.x && p.c.caixa.x + p.c.caixa.dx >= k.x + k.dx && p.c.caixa.z <= k.z && p.c.caixa.z + p.c.caixa.dz >= k.z + k.dz,
      );
      if (!acima || profundo(acima.c, n('egq'), `Borda engrossada (${faixa.c.nome})`)) continue;
      const camada = ordem.indexOf(k.y) + 1;
      // Linha ao longo do comprimento, a 1/(camadas+1) da largura, a partir da borda de fora.
      const fora = faixa.ec === 'x' ? (k.z === 0 ? 'min' : 'max') : k.x === 0 ? 'min' : 'max';
      const lado = faixa.el;
      const pos = Math.floor((k[TAM[lado]] * camada) / (camadas + 1));
      const linha = fora === 'min' ? k[lado] + pos : k[lado] + k[TAM[lado]] - pos;
      const t = faixa.ec;
      const posicoes = posicoesDaJuncao(k[t], k[t] + k[TAM[t]], n('egm'), n('egm'), n('egp'));
      const pontos = posicoes.map((p) => {
        const g: Ponto = { x: 0, y: k.y, z: 0 };
        g[t] = p;
        g[lado] = linha;
        return g;
      });
      furar(faixa, { finalidade: 'engrosso', diametro: dmm(n('egd')), profundidade: faixa.c.espessura, face: 'y-', passante: true }, pontos);
      furar(acima, { finalidade: 'engrosso', diametro: dmm(n('egg')), profundidade: dmm(n('egq')), face: 'y-' }, pontos);
      parafusosEngrosso += pontos.length;
    }
    if (parafusosEngrosso) ferragens.push({ codigo: 'parafuso_engrosso', descricao: '', quantidade: parafusosEngrosso });
  }

  // ---- Dois furos na mesma superfície não podem se encostar.
  for (const c of componentes) {
    const lista = (c.furos ?? []).filter((x) => !x.topo).flatMap((x) => x.centros.map((p) => ({ face: x.face, raio: x.diametro / 2, u: p.u, v: p.v, passante: !!x.passante })));
    let achou = false;
    for (let i = 0; i < lista.length && !achou; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const [a, b] = [lista[i]!, lista[j]!];
        if (a.face !== b.face && !a.passante && !b.passante) continue;
        const soma = a.raio + b.raio;
        if ((a.u - b.u) ** 2 + (a.v - b.v) ** 2 < soma * soma) {
          achou = true;
          break;
        }
      }
    }
    if (achou) avisos.push({ codigo: 'furos_encostados', mensagem: `${c.nome}: há furos que se encostam. Confira a folha de furação e ajuste as distâncias nos parâmetros.`, componente: c.id });
  }
  return juncoes;
}

export const NOME_FURO: Record<FinalidadeFuro, readonly [string, string]> = {
  dobradica: ['copa de dobradiça', 'copas de dobradiça'],
  pino_prateleira: ['furo de pino', 'furos de pino'],
  calco_dobradica: ['furo de calço de dobradiça', 'furos de calço de dobradiça'],
  corredica: ['furo de corrediça', 'furos de corrediça'],
  fixacao_frente: ['furo de fixação da frente', 'furos de fixação da frente'],
  engrosso: ['furo da borda engrossada', 'furos da borda engrossada'],
  minifix_tambor: ['tambor de minifix', 'tambores de minifix'],
  minifix_haste: ['furo de haste de minifix', 'furos de haste de minifix'],
  minifix_pino: ['furo de pino de minifix', 'furos de pino de minifix'],
  cavilha: ['furo de cavilha', 'furos de cavilha'],
  parafuso: ['furo de parafuso', 'furos de parafuso'],
  parafuso_guia: ['furo-guia de parafuso', 'furos-guia de parafuso'],
  puxador: ['furo de puxador', 'furos de puxador'],
};
