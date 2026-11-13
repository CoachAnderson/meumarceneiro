/**
 * Mesas e bancadas: um tampo (com borda engrossada opcional) e o que o segura.
 *
 *   pes_mdf          dois pés em painel de MDF, saia e travessa; sapatas niveladoras opcionais
 *   pes_comprados    quatro pés comprados prontos (madeira ou metal), com chapa parafusada no tampo
 *   suspensa         bancada presa na parede por mão-francesa, cantoneira ou suporte invisível
 *   sobre_gabinetes  tampo apoiado em gabinetes já projetados, informados pelas larguras
 *
 * Devolve o mesmo resultado do módulo de caixa (componentes com caixa 3D), então
 * lista de peças, plano de corte, furação, orçamento, CNC e 3D funcionam igual.
 * Itens comprados ou de referência (pés de metal, suportes, gabinetes) vêm com
 * `comprado: true`: aparecem no desenho, mas não viram peça a cortar.
 *
 * Eixos como no módulo: x da esquerda para a direita, y do chão para cima,
 * z da frente para trás. Tudo em décimos de mm, inteiro.
 */
import { DESCRICAO_FERRAGEM, juntarFerragens, type FerragemNecessaria, type Furo } from './frentes';
import { furarMontagem, PARAMETROS_FURACAO, posicoesDaJuncao, type EntradaFuracao } from './furacao';
import { intersecao, orientacaoDaPeca } from './geometria';
import type { Componente, Problema, ResultadoModulo } from './modulo';
import type { DefinicaoParametro } from './regra';
import { distribuir, dmm, formatarMm, lerMm, type Dmm } from './unidades';

export type ModeloMesa = 'pes_mdf' | 'pes_comprados' | 'suspensa' | 'sobre_gabinetes';
/** Onde vai a faixa que engrossa a borda do tampo. */
export type BordaEngrossada = 'nenhuma' | 'frente' | 'tres_lados' | 'todos';
export type TipoSuporte = 'mao_francesa' | 'cantoneira' | 'invisivel';

export interface EntradaMesa {
  /** Padrão: mesa com pés de MDF. */
  modelo?: ModeloMesa;
  /** Largura (comprimento do tampo), altura até o topo do tampo e profundidade. No tampo sobre gabinetes, a largura sai das larguras dos gabinetes. */
  L: Dmm;
  A: Dmm;
  P: Dmm;
  espessura: Dmm;
  /** Pés de MDF: saia (painel de fundo entre os pés). Padrão: sim. */
  saia?: boolean;
  /** Pés de MDF: travessa perto do chão. Padrão: não. */
  travessa?: boolean;
  /** Pés de MDF: sapatas niveladoras com bucha na base de cada pé. */
  sapatas?: boolean;
  /** Bancada suspensa: tipo de suporte. Padrão: mão-francesa. */
  suporte?: TipoSuporte;
  /** Tampo sobre gabinetes: largura de cada gabinete, da esquerda para a direita. */
  gabinetes?: readonly Dmm[];
  /** Borda engrossada: em quais bordas e quantas chapas de faixa (1 = tampo + 1 faixa). */
  engrosso?: { bordas: BordaEngrossada; camadas: 1 | 2 };
  parametros?: Readonly<Record<string, number>>;
  furacao?: EntradaFuracao;
}

type Grupo = ModeloMesa | 'engrosso';

/** Parâmetros e o modelo a que cada um pertence. */
const PARAMETROS: ReadonlyArray<DefinicaoParametro & { grupo: Grupo }> = [
  { grupo: 'pes_mdf', nome: 'mrl', rotulo: 'Pés: recuo nas pontas do tampo', padrao: 0, min: 0, max: 5000, ajuda: 'Com as pontas engrossadas, o pé fica no mínimo atrás da faixa.' },
  { grupo: 'pes_mdf', nome: 'mrf', rotulo: 'Pés: recuo da frente do tampo', padrao: 500, min: 0, max: 5000 },
  { grupo: 'pes_mdf', nome: 'mrt', rotulo: 'Pés: recuo de trás do tampo', padrao: 0, min: 0, max: 5000 },
  { grupo: 'pes_mdf', nome: 'msa', rotulo: 'Saia: altura', padrao: 3000, min: 500, max: 9000 },
  { grupo: 'pes_mdf', nome: 'msr', rotulo: 'Saia e travessa: recuo da traseira dos pés', padrao: 0, min: 0, max: 5000 },
  { grupo: 'pes_mdf', nome: 'mta', rotulo: 'Travessa: altura', padrao: 800, min: 300, max: 3000 },
  { grupo: 'pes_mdf', nome: 'mtp', rotulo: 'Travessa: distância do chão', padrao: 1000, min: 0, max: 6000 },
  { grupo: 'pes_mdf', nome: 'snf', rotulo: 'Sapata: furo a partir da frente e de trás do pé', padrao: 500, min: 200, max: 3000 },
  { grupo: 'pes_mdf', nome: 'snd', rotulo: 'Sapata: diâmetro do furo da bucha', padrao: 100, min: 50, max: 160, ajuda: 'Bucha para rosca M8: 10 mm. Confira com a sua sapata.' },
  { grupo: 'pes_mdf', nome: 'snp', rotulo: 'Sapata: profundidade do furo', padrao: 200, min: 80, max: 400 },
  { grupo: 'pes_comprados', nome: 'mpl', rotulo: 'Pé: lado da seção', padrao: 500, min: 200, max: 1500, ajuda: 'Pé quadrado; para pé redondo, use o diâmetro.' },
  { grupo: 'pes_comprados', nome: 'mpr', rotulo: 'Pé: da borda do tampo até a face do pé', padrao: 500, min: 0, max: 5000 },
  { grupo: 'pes_comprados', nome: 'mcf', rotulo: 'Chapa do pé: distância entre os furos', padrao: 600, min: 200, max: 1500, ajuda: 'Furos em quadrado, centrados no pé. Meça na chapa do seu pé.' },
  { grupo: 'pes_comprados', nome: 'mcd', rotulo: 'Chapa do pé: diâmetro do furo-guia', padrao: 30, min: 15, max: 60 },
  { grupo: 'pes_comprados', nome: 'mcq', rotulo: 'Chapa do pé: profundidade do furo-guia', padrao: 100, min: 30, max: 200 },
  { grupo: 'suspensa', nome: 'bsm', rotulo: 'Suportes: do primeiro suporte à ponta do tampo', padrao: 1000, min: 300, max: 6000 },
  { grupo: 'suspensa', nome: 'bsp', rotulo: 'Suportes: distância máxima entre suportes', padrao: 6000, min: 2000, max: 12000 },
  { grupo: 'suspensa', nome: 'bsa', rotulo: 'Mão-francesa ou cantoneira: altura', padrao: 2000, min: 300, max: 6000 },
  { grupo: 'suspensa', nome: 'bsf', rotulo: 'Suportes: do furo de trás até a parede', padrao: 300, min: 100, max: 3000 },
  { grupo: 'suspensa', nome: 'bsg', rotulo: 'Suportes: distância entre os dois furos', padrao: 1500, min: 200, max: 6000, ajuda: 'Medida do suporte que você usa.' },
  { grupo: 'suspensa', nome: 'bsd', rotulo: 'Suportes: diâmetro do furo-guia', padrao: 30, min: 15, max: 60 },
  { grupo: 'suspensa', nome: 'bsq', rotulo: 'Suportes: profundidade do furo-guia', padrao: 100, min: 30, max: 200 },
  { grupo: 'suspensa', nome: 'bid', rotulo: 'Suporte invisível: diâmetro da barra', padrao: 100, min: 60, max: 200 },
  { grupo: 'suspensa', nome: 'bip', rotulo: 'Suporte invisível: profundidade do furo no tampo', padrao: 1500, min: 500, max: 4000 },
  { grupo: 'sobre_gabinetes', nome: 'tbf', rotulo: 'Balanço do tampo na frente', padrao: 200, min: 0, max: 1500 },
  { grupo: 'sobre_gabinetes', nome: 'tbt', rotulo: 'Folga atrás (do gabinete até a parede)', padrao: 0, min: 0, max: 1000 },
  { grupo: 'sobre_gabinetes', nome: 'tbe', rotulo: 'Balanço na ponta esquerda', padrao: 0, min: 0, max: 3000 },
  { grupo: 'sobre_gabinetes', nome: 'tbd', rotulo: 'Balanço na ponta direita', padrao: 0, min: 0, max: 3000 },
  { grupo: 'sobre_gabinetes', nome: 'tfm', rotulo: 'Fixação: furo a partir da lateral de cada gabinete', padrao: 500, min: 150, max: 3000 },
  { grupo: 'sobre_gabinetes', nome: 'tfz', rotulo: 'Fixação: furo a partir da frente e do fundo do gabinete', padrao: 500, min: 150, max: 3000, ajuda: 'Sem borda engrossada. Com ela, o parafuso vai no meio do apoio da faixa.' },
  { grupo: 'sobre_gabinetes', nome: 'tfd', rotulo: 'Fixação: diâmetro do furo-guia', padrao: 30, min: 15, max: 60 },
  { grupo: 'sobre_gabinetes', nome: 'tfq', rotulo: 'Fixação: profundidade do furo-guia', padrao: 100, min: 30, max: 200 },
  { grupo: 'engrosso', nome: 'mel', rotulo: 'Borda engrossada: largura da faixa', padrao: 800, min: 300, max: 2000 },
];

export const PARAMETROS_MESA: readonly DefinicaoParametro[] = PARAMETROS.map(({ grupo: _g, ...d }) => d);

/** Parâmetros que fazem sentido para o modelo escolhido (para a tela). */
export function parametrosDaMesa(modelo: ModeloMesa, comEngrosso: boolean): DefinicaoParametro[] {
  return PARAMETROS.filter((p) => p.grupo === modelo || (comEngrosso && p.grupo === 'engrosso')).map(({ grupo: _g, ...d }) => d);
}

const NOME_MODELO: Record<ModeloMesa, string> = {
  pes_mdf: 'Mesa com pés de MDF',
  pes_comprados: 'Mesa com pés comprados',
  suspensa: 'Bancada suspensa na parede',
  sobre_gabinetes: 'Tampo sobre gabinetes',
};
export const nomeModeloMesa = (m: ModeloMesa) => NOME_MODELO[m];

/** Sobra mínima de material atrás de um furo cego (1,5 mm), como na furação de montagem. */
const PAREDE = 15;

function falha(erros: Problema[], avisos: Problema[]): ResultadoModulo {
  return { valido: false, erros, medidas: {}, vaos: [], componentes: [], avisos, ferragens: [], juncoes: [] };
}

type Ponto = Record<'x' | 'y' | 'z', number>;

/** Acrescenta furos dados em coordenadas do móvel, convertendo para as da peça. */
function furarNoMovel(c: Componente, f: Omit<Furo, 'centros'>, pontos: readonly Ponto[]): void {
  if (pontos.length === 0) return;
  const [ec, el] = orientacaoDaPeca(c)!;
  const centros = pontos.map((g) => ({ u: dmm(g[ec] - c.caixa[ec]), v: dmm(g[el] - c.caixa[el]) }));
  c.furos = [...(c.furos ?? []), { ...f, centros }];
}

export function calcularMesa(entrada: EntradaMesa): ResultadoModulo {
  const erros: Problema[] = [];
  const avisos: Problema[] = [];
  const modelo: ModeloMesa = entrada.modelo ?? 'pes_mdf';
  const { A, P, espessura: e } = entrada;
  const naParede = modelo === 'suspensa' || modelo === 'sobre_gabinetes';

  const faixa = (v: number, min: number, max: number, nome: string) => {
    if (!Number.isSafeInteger(v) || v < min || v > max) {
      erros.push({ codigo: 'entrada_fora_limite', mensagem: `${nome} precisa ficar entre ${formatarMm(dmm(min))} e ${formatarMm(dmm(max))} mm.` });
    }
  };

  // Parâmetros da mesa e da furação, com os padrões.
  const valores = new Map<string, number>();
  for (const d of [...PARAMETROS_MESA, ...PARAMETROS_FURACAO]) {
    const v = entrada.parametros?.[d.nome] ?? d.padrao;
    if (!Number.isSafeInteger(v) || v < d.min || v > d.max) {
      erros.push({ codigo: 'parametro_fora_limite', mensagem: `${d.rotulo}: use de ${formatarMm(dmm(d.min))} a ${formatarMm(dmm(d.max))} mm.` });
    }
    valores.set(d.nome, v);
  }
  const n = (nome: string) => valores.get(nome)!;

  // Tampo sobre gabinetes: a largura sai dos gabinetes e dos balanços.
  let L = entrada.L;
  const gabinetes = entrada.gabinetes ?? [];
  if (modelo === 'sobre_gabinetes') {
    if (gabinetes.length < 1 || gabinetes.length > 12) {
      erros.push({ codigo: 'gabinetes_invalidos', mensagem: 'Informe de 1 a 12 larguras de gabinete.' });
    }
    gabinetes.forEach((g, i) => faixa(g, 1500, 15000, `Gabinete ${i + 1}`));
    if (erros.length) return falha(erros, avisos);
    L = dmm(n('tbe') + gabinetes.reduce((s, g) => s + g, 0) + n('tbd'));
  }

  faixa(L, 3000, 30000, modelo === 'sobre_gabinetes' ? 'O comprimento do tampo (gabinetes + balanços)' : 'Largura');
  faixa(A, 3000, naParede ? 25000 : 12000, 'Altura');
  faixa(P, 2500, 12000, 'Profundidade');
  faixa(e, 90, 500, 'Espessura');
  if (erros.length) return falha(erros, avisos);

  const bordas = entrada.engrosso?.bordas ?? 'nenhuma';
  const camadas = bordas === 'nenhuma' ? 0 : (entrada.engrosso?.camadas ?? 1);
  if (camadas !== 0 && camadas !== 1 && camadas !== 2) return falha([{ codigo: 'entrada_fora_limite', mensagem: 'Borda engrossada: use 1 ou 2 faixas.' }], avisos);
  if (naParede && bordas === 'todos') {
    return falha([{ codigo: 'borda_na_parede', mensagem: 'A borda de trás encosta na parede: escolha a borda engrossada só na frente, ou na frente e nas pontas.' }], avisos);
  }
  const engFrente = camadas > 0;
  const engPontas = camadas > 0 && (bordas === 'tres_lados' || bordas === 'todos');
  // Sobre gabinetes, com borda engrossada, uma régua atrás apoia o tampo na mesma altura da faixa da frente.
  const reguaApoio = camadas > 0 && modelo === 'sobre_gabinetes';
  const engTras = camadas > 0 && (bordas === 'todos' || reguaApoio);
  const w = n('mel');

  const yTampo = A - e;
  const yBaixoFaixas = yTampo - camadas * e;
  if (camadas > 0 && (2 * w >= P || (engPontas && 2 * w >= L))) erros.push({ codigo: 'faixa_larga', mensagem: 'A faixa da borda engrossada é larga demais para este tampo.' });
  if (yBaixoFaixas < 2000) erros.push({ codigo: 'mesa_baixa', mensagem: 'Sobra pouca altura embaixo do tampo (mínimo 200 mm).' });
  if (erros.length) return falha(erros, avisos);

  const componentes: Componente[] = [];
  const peca = (x: Omit<Componente, 'caixa'> & Ponto & { dx: number; dy: number; dz: number }): Componente => {
    const { x: cx, y, z, dx, dy, dz, ...resto } = x;
    const c: Componente = { ...resto, caixa: { x: dmm(cx), y: dmm(y), z: dmm(z), dx: dmm(dx), dy: dmm(dy), dz: dmm(dz) } };
    componentes.push(c);
    return c;
  };
  const exigir = (c: Componente, profundidade: number, oque: string) => {
    if (profundidade + PAREDE <= c.espessura) return true;
    erros.push({ codigo: 'furo_profundo', mensagem: `${oque}: furo de ${formatarMm(dmm(profundidade))} mm não cabe em ${c.nome}, de ${formatarMm(c.espessura)} mm. Reduza a profundidade.`, componente: c.id });
    return false;
  };
  const ferragens: FerragemNecessaria[] = [];
  const contar = (codigo: FerragemNecessaria['codigo'], quantidade: number, comprimento?: Dmm) => {
    if (quantidade > 0) ferragens.push({ codigo, descricao: DESCRICAO_FERRAGEM[codigo], quantidade, ...(comprimento ? { comprimento } : {}) });
  };

  const tampo = peca({ id: 'tampo', papel: 'tampo', nome: 'Tampo', material: 'estrutura', comprimento: L, largura: P, espessura: e, origem: 'L × P', x: 0, y: yTampo, z: 0, dx: L, dy: e, dz: P });

  // Faixas da borda engrossada, empilhadas embaixo do tampo (a 1ª encosta no tampo).
  const faixas = { frente: [] as Componente[], tras: [] as Componente[] };
  for (let k = 1; k <= camadas; k++) {
    const y = yTampo - k * e;
    const sufixo = camadas > 1 ? ` (${k}ª camada)` : '';
    const zIni = engFrente ? w : 0;
    const zFim = engTras ? P - w : P;
    faixas.frente.push(peca({ id: `engrosso_frente_${k}`, papel: 'engrosso', nome: `Faixa da borda, frente${sufixo}`, material: 'estrutura', comprimento: L, largura: dmm(w), espessura: e, origem: 'L × faixa', x: 0, y, z: 0, dx: L, dy: e, dz: w }));
    if (engTras) {
      faixas.tras.push(peca({ id: `engrosso_tras_${k}`, papel: 'engrosso', nome: reguaApoio && bordas !== 'todos' ? `Régua de apoio, trás${sufixo}` : `Faixa da borda, trás${sufixo}`, material: 'estrutura', comprimento: L, largura: dmm(w), espessura: e, origem: 'L × faixa', x: 0, y, z: P - w, dx: L, dy: e, dz: w }));
    }
    if (engPontas) {
      for (const [lado, x] of [['esquerda', 0], ['direita', L - w]] as const) {
        peca({ id: `engrosso_${lado}_${k}`, papel: 'engrosso', nome: `Faixa da borda, ponta ${lado}${sufixo}`, material: 'estrutura', comprimento: dmm(zFim - zIni), largura: dmm(w), espessura: e, origem: 'P − faixas × faixa', x, y, z: zIni, dx: w, dy: e, dz: zFim - zIni });
      }
    }
  }

  const medidas: Record<string, number> = { L, A, P, e };

  // ---------------------------------------------------------------- pés de MDF
  if (modelo === 'pes_mdf') {
    const ajustar = (param: string, engrossado: boolean, lado: string) => {
      const v = n(param);
      if (engrossado && v < w) {
        avisos.push({ codigo: 'recuo_ajustado', mensagem: `Pés: o recuo ${lado} passou de ${formatarMm(dmm(v))} para ${formatarMm(dmm(w))} mm, para o pé ficar atrás da faixa da borda engrossada.` });
        return w;
      }
      return v;
    };
    const rl = ajustar('mrl', engPontas, 'nas pontas');
    const rf = ajustar('mrf', engFrente, 'da frente');
    const rt = ajustar('mrt', engTras, 'de trás');
    const alturaPe = yTampo;
    const profPe = P - rf - rt;
    const vaoEntrePes = L - 2 * rl - 2 * e;
    if (alturaPe < 2000) erros.push({ codigo: 'mesa_baixa', mensagem: `Os pés ficam com ${formatarMm(dmm(alturaPe))} mm de altura; o mínimo é 200 mm.` });
    if (profPe < 1000) erros.push({ codigo: 'pe_raso', mensagem: `Os pés ficam com ${formatarMm(dmm(profPe))} mm de profundidade (mínimo 100 mm). Diminua os recuos.` });
    if (vaoEntrePes < 2000) erros.push({ codigo: 'mesa_estreita', mensagem: `Sobram ${formatarMm(dmm(vaoEntrePes))} mm entre os pés; o mínimo é 200 mm.` });
    if (erros.length) return falha(erros, avisos);
    Object.assign(medidas, { rl, rf, rt, alturaPe, profPe, vaoEntrePes });

    const pes = (['esquerdo', 'direito'] as const).map((lado) =>
      peca({ id: `pe_${lado}`, papel: 'pe', nome: `Pé ${lado}`, material: 'estrutura', comprimento: dmm(alturaPe), largura: dmm(profPe), espessura: e, origem: 'A − tampo × P − recuos', x: lado === 'esquerdo' ? rl : L - rl - e, y: 0, z: rf, dx: e, dy: alturaPe, dz: profPe }),
    );

    const zTrasPe = P - rt;
    const zPainel = zTrasPe - n('msr') - e;
    if (((entrada.saia ?? true) || entrada.travessa) && zPainel < rf) {
      return falha([{ codigo: 'saia_fora', mensagem: 'O recuo da saia passa da frente dos pés.' }], avisos);
    }
    if (entrada.saia ?? true) {
      const hs = n('msa');
      if (hs > alturaPe - 1000) erros.push({ codigo: 'saia_alta', mensagem: `A saia de ${formatarMm(dmm(hs))} mm não cabe: os pés têm ${formatarMm(dmm(alturaPe))} mm.` });
      else peca({ id: 'saia', papel: 'saia', nome: 'Saia', material: 'estrutura', comprimento: dmm(vaoEntrePes), largura: dmm(hs), espessura: e, origem: 'vão entre os pés × altura da saia', x: rl + e, y: yTampo - hs, z: zPainel, dx: vaoEntrePes, dy: hs, dz: e });
    }
    if (entrada.travessa) {
      const ht = n('mta');
      const yt = n('mtp');
      if (yt + ht > alturaPe) erros.push({ codigo: 'travessa_alta', mensagem: 'A travessa passa da altura dos pés.' });
      else peca({ id: 'travessa', papel: 'travessa', nome: 'Travessa', material: 'estrutura', comprimento: dmm(vaoEntrePes), largura: dmm(ht), espessura: e, origem: 'vão entre os pés × altura da travessa', x: rl + e, y: yt, z: zPainel, dx: vaoEntrePes, dy: ht, dz: e });
    }
    if (!(entrada.saia ?? true) && !entrada.travessa) {
      avisos.push({ codigo: 'mesa_sem_travamento', mensagem: 'Sem saia nem travessa, nada trava os pés um no outro; a mesa pode balançar.' });
    }

    // Sapatas: furo de topo na base de cada pé, para a bucha da rosca.
    if (entrada.sapatas) {
      const [snf, snd, snp] = [n('snf'), n('snd'), n('snp')];
      if (snd + 2 * PAREDE > e) {
        erros.push({ codigo: 'furo_largo', mensagem: `Sapata: o furo de ${formatarMm(dmm(snd))} mm não cabe na base do pé, de ${formatarMm(dmm(e))} mm.` });
      } else {
        let total = 0;
        for (const pe of pes) {
          const k = pe.caixa;
          const pontos = posicoesDaJuncao(k.z, k.z + k.dz, snf, snf, 1_000_000).map((z) => ({ x: k.x + Math.floor(e / 2), y: 0, z }));
          furarNoMovel(pe, { finalidade: 'sapata', diametro: dmm(snd), profundidade: dmm(snp), face: 'y-', topo: true }, pontos);
          total += pontos.length;
        }
        contar('sapata_niveladora', total);
      }
    }
  }

  // ---------------------------------------------------------- pés comprados
  if (modelo === 'pes_comprados') {
    const [lp, mcf] = [n('mpl'), n('mcf')];
    // A chapa (furos + 10 mm de margem) tem de caber no tampo, fora das faixas.
    const minimo = (engrossado: boolean) => (engrossado ? w : 0) + Math.max(0, Math.ceil(mcf / 2) + 100 - Math.floor(lp / 2));
    const recuo = (engrossado: boolean, lado: string) => {
      const v = n('mpr');
      const m = minimo(engrossado);
      if (v >= m) return v;
      avisos.push({ codigo: 'recuo_ajustado', mensagem: `Pés: o recuo ${lado} passou de ${formatarMm(dmm(v))} para ${formatarMm(dmm(m))} mm, para a chapa do pé ficar inteira no tampo${engrossado ? ', atrás da faixa' : ''}.` });
      return m;
    };
    const rl = recuo(engPontas, 'nas pontas');
    const rf = recuo(engFrente, 'da frente');
    const rt = recuo(engTras, 'de trás');
    // O pé encosta no tampo, por dentro das faixas.
    const alturaPe = yTampo;
    if (L - 2 * rl - 2 * lp < 1000 || P - rf - rt - 2 * lp < 1000) {
      return falha([{ codigo: 'pes_juntos', mensagem: 'Os pés ficam encostados um no outro: diminua o recuo ou a seção do pé.' }], avisos);
    }
    Object.assign(medidas, { alturaPe, recuoPe: rf, rl, rf, rt });
    const pontosChapa: Ponto[] = [];
    let i = 0;
    for (const z of [rf, P - rt - lp]) {
      for (const x of [rl, L - rl - lp]) {
        i++;
        peca({ id: `pe_comprado_${i}`, papel: 'pe_comprado', nome: `Pé ${i} (comprado)`, material: 'estrutura', comprimento: dmm(alturaPe), largura: dmm(lp), espessura: dmm(lp), origem: 'comprado', comprado: true, x, y: 0, z, dx: lp, dy: alturaPe, dz: lp });
        const cx = x + Math.floor(lp / 2);
        const cz = z + Math.floor(lp / 2);
        const meio = Math.floor(mcf / 2);
        for (const [dx, dz] of [[-meio, -meio], [mcf - meio, -meio], [-meio, mcf - meio], [mcf - meio, mcf - meio]] as const) pontosChapa.push({ x: cx + dx, y: yTampo, z: cz + dz });
      }
    }
    if (exigir(tampo, n('mcq'), 'Chapa do pé')) {
      furarNoMovel(tampo, { finalidade: 'fixacao_pe', diametro: dmm(n('mcd')), profundidade: dmm(n('mcq')), face: 'y-' }, pontosChapa);
    }
    contar('pe_mesa', 4, dmm(alturaPe));
    contar('parafuso_pe', pontosChapa.length);
    if (L > 16000 && camadas === 0) avisos.push({ codigo: 'tampo_sem_reforco', mensagem: 'Tampo longo apoiado só nos cantos pode empenar com o tempo; considere a borda engrossada.' });
  }

  // ---------------------------------------------------------- bancada suspensa
  if (modelo === 'suspensa') {
    const suporte = entrada.suporte ?? 'mao_francesa';
    const bsm = Math.max(n('bsm'), engPontas ? w + 300 : 0);
    if (L - 2 * bsm < 0) return falha([{ codigo: 'bancada_curta', mensagem: 'A bancada é curta demais para os suportes com esses recuos.' }], avisos);
    const trechos = Math.max(1, Math.ceil((L - 2 * bsm) / n('bsp')));
    const xs = [bsm];
    for (const passo of distribuir(dmm(L - 2 * bsm), trechos)) xs.push(xs.at(-1)! + passo);
    Object.assign(medidas, { suportes: xs.length, passoSuportes: xs.length > 1 ? xs[1]! - xs[0]! : 0 });

    if (suporte === 'invisivel') {
      const [bid, bip] = [n('bid'), n('bip')];
      if (bid + 2 * 30 > e) {
        erros.push({ codigo: 'tampo_fino', mensagem: `O suporte invisível de ${formatarMm(dmm(bid))} mm precisa de tampo com pelo menos ${formatarMm(dmm(bid + 60))} mm.` });
      } else if (bip > P - (engFrente ? w : 0) - 500) {
        erros.push({ codigo: 'suporte_fundo', mensagem: 'O furo do suporte invisível chegaria perto demais da frente do tampo: diminua a profundidade.' });
      } else {
        furarNoMovel(tampo, { finalidade: 'suporte', diametro: dmm(bid), profundidade: dmm(bip), face: 'z+', topo: true }, xs.map((x) => ({ x, y: yTampo + Math.floor(e / 2), z: P })));
        contar('suporte_invisivel', xs.length);
      }
    } else {
      const [bsf, bsg] = [n('bsf'), n('bsg')];
      const zTras = P - bsf;
      const zFrente = zTras - bsg;
      const limite = (engFrente ? w : 0) + 500;
      if (zFrente < limite) {
        erros.push({ codigo: 'suporte_fora', mensagem: `O furo da frente do suporte cairia a ${formatarMm(dmm(zFrente))} mm da frente do tampo${engFrente ? ', em cima da faixa' : ''}. Diminua a distância entre os furos.` });
      } else {
        const altura = suporte === 'mao_francesa' ? n('bsa') : Math.min(n('bsa'), 600);
        const fundo = bsf + bsg + 300;
        xs.forEach((x, i) => {
          peca({ id: `suporte_${i + 1}`, papel: 'suporte', nome: `${suporte === 'mao_francesa' ? 'Mão-francesa' : 'Cantoneira'} ${i + 1}`, material: 'estrutura', comprimento: dmm(altura), largura: dmm(fundo), espessura: dmm(300), origem: 'comprado', comprado: true, x: x - 150, y: yTampo - altura, z: P - fundo, dx: 300, dy: altura, dz: fundo });
        });
        if (exigir(tampo, n('bsq'), 'Suporte')) {
          furarNoMovel(tampo, { finalidade: 'suporte', diametro: dmm(n('bsd')), profundidade: dmm(n('bsq')), face: 'y-' }, xs.flatMap((x) => [zFrente, zTras].map((z) => ({ x, y: yTampo, z }))));
        }
        contar(suporte === 'mao_francesa' ? 'mao_francesa' : 'cantoneira', xs.length);
        contar('parafuso_suporte', xs.length * 2);
      }
    }
    avisos.push({ codigo: 'fixacao_parede', mensagem: 'Parafusos e buchas da parede não entram na lista: dependem da parede (alvenaria, drywall). Confira a carga do suporte.' });
  }

  // ---------------------------------------------------------- sobre gabinetes
  if (modelo === 'sobre_gabinetes') {
    const [tbf, tbt, tbe] = [n('tbf'), n('tbt'), n('tbe')];
    const profGabinete = P - tbf - tbt;
    if (profGabinete < 2000) return falha([{ codigo: 'gabinete_raso', mensagem: 'Com esses balanços, sobra menos de 200 mm de gabinete embaixo do tampo.' }], avisos);
    if (camadas > 0 && w <= tbf) return falha([{ codigo: 'faixa_sem_apoio', mensagem: 'A faixa da frente não chega a apoiar no gabinete: aumente a largura da faixa ou diminua o balanço da frente.' }], avisos);
    if (camadas > 0 && w <= tbt) return falha([{ codigo: 'faixa_sem_apoio', mensagem: 'A régua de apoio de trás não chega ao gabinete: aumente a largura da faixa ou diminua a folga de trás.' }], avisos);
    Object.assign(medidas, { comprimentoTampo: L, gabinetes: gabinetes.length, profGabinete, alturaGabinete: yBaixoFaixas });

    // Parafuso de baixo para cima: no tampo ou, com borda engrossada, na faixa que encosta no gabinete.
    const [tfm, tfz] = [n('tfm'), n('tfz')];
    const alvoFrente = faixas.frente.at(-1) ?? tampo;
    const alvoTras = faixas.tras.at(-1) ?? tampo;
    // Com faixa: dentro do trecho em que a faixa apoia no gabinete, o ponto mais
    // longe das linhas de parafuso da própria faixa (para não cair no mesmo furo).
    const linhasDaFaixa = (externa: number, sentido: 1 | -1) => Array.from({ length: camadas }, (_, k) => externa + sentido * Math.floor((w * (k + 1)) / (camadas + 1)));
    const melhorPonto = (a: number, b: number, linhas: number[]) =>
      [1, 2, 3].map((q) => a + Math.floor(((b - a) * q) / 4)).reduce((m, z) => (Math.min(...linhas.map((l) => Math.abs(l - z))) > Math.min(...linhas.map((l) => Math.abs(l - m))) ? z : m));
    const zFrente = camadas > 0 ? melhorPonto(tbf, w, linhasDaFaixa(0, 1)) : tbf + tfz;
    const zTras = camadas > 0 ? melhorPonto(P - w, P - tbt, linhasDaFaixa(P, -1)) : P - tbt - tfz;
    const pontos = { frente: [] as Ponto[], tras: [] as Ponto[] };
    let x0 = tbe;
    gabinetes.forEach((g, i) => {
      peca({ id: `gabinete_${i + 1}`, papel: 'gabinete_ref', nome: `Gabinete ${i + 1} (referência)`, material: 'estrutura', comprimento: dmm(yBaixoFaixas), largura: dmm(profGabinete), espessura: dmm(g), origem: 'referência', comprado: true, x: x0, y: 0, z: tbf, dx: g, dy: yBaixoFaixas, dz: profGabinete });
      for (const x of posicoesDaJuncao(x0, x0 + g, tfm, tfm, 1_000_000)) {
        pontos.frente.push({ x, y: yBaixoFaixas, z: zFrente });
        pontos.tras.push({ x, y: yBaixoFaixas, z: zTras });
      }
      x0 += g;
    });
    const [tfd, tfq] = [n('tfd'), n('tfq')];
    if (exigir(alvoFrente, tfq, 'Fixação do tampo') && (alvoTras === alvoFrente || exigir(alvoTras, tfq, 'Fixação do tampo'))) {
      furarNoMovel(alvoFrente, { finalidade: 'fixacao_tampo', diametro: dmm(tfd), profundidade: dmm(tfq), face: 'y-' }, pontos.frente);
      furarNoMovel(alvoTras, { finalidade: 'fixacao_tampo', diametro: dmm(tfd), profundidade: dmm(tfq), face: 'y-' }, pontos.tras);
      contar('parafuso_tampo', pontos.frente.length + pontos.tras.length);
    }
    avisos.push({ codigo: 'furar_gabinete', mensagem: 'Os parafusos sobem de dentro dos gabinetes: fure o tampo (ou as travessas) de cada gabinete nas mesmas posições da folha de furação.' });
  }

  if (erros.length) return falha(erros, avisos);

  // Nenhuma peça pode ocupar o espaço de outra.
  for (let i = 0; i < componentes.length; i++) {
    for (let j = i + 1; j < componentes.length; j++) {
      if (intersecao(componentes[i]!.caixa, componentes[j]!.caixa)) {
        erros.push({ codigo: 'pecas_colidem', mensagem: `${componentes[j]!.nome} ocupa o mesmo espaço que ${componentes[i]!.nome}. Revise as medidas e os recuos.`, componente: componentes[j]!.id });
      }
    }
  }
  if (erros.length) return falha(erros, avisos);

  if (camadas > 0) {
    avisos.push({ codigo: 'fita_larga', mensagem: `Borda engrossada de ${formatarMm(dmm((camadas + 1) * e))} mm: use fita de pelo menos ${formatarMm(dmm((camadas + 1) * e + 40))} mm de largura nas bordas engrossadas. A lista conta essa fita na borda do tampo.` });
  }

  const juncoes = entrada.furacao ? furarMontagem(entrada.furacao, { n, componentes, erros, avisos, ferragens }) : [];

  return {
    valido: erros.length === 0,
    erros,
    medidas: { ...medidas, ...Object.fromEntries(valores) },
    vaos: [],
    componentes,
    avisos,
    ferragens: juntarFerragens(ferragens),
    juncoes,
  };
}

/** Larguras dos gabinetes: '600 + 400 + 800' (separadas por +, ; ou espaço; vírgula é decimal). */
export function lerLargurasGabinetes(texto: string): { valores: Dmm[]; erro: string | null } {
  const partes = texto
    .replace(/mm/gi, ' ')
    .split(/[+;\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (partes.length === 0) return { valores: [], erro: 'Informe a largura de cada gabinete, por exemplo 600 + 400 + 800.' };
  if (partes.length > 20) return { valores: [], erro: 'Informe no máximo 20 gabinetes.' };
  const valores: Dmm[] = [];
  for (const [i, t] of partes.entries()) {
    // lerMm lança erro em texto inválido; aqui o erro vira mensagem no campo, sem derrubar a tela.
    let v: Dmm;
    try {
      v = lerMm(t);
    } catch (e) {
      const motivo = e instanceof Error ? e.message : `"${t}" não é uma medida em mm.`;
      return { valores: [], erro: `Gabinete ${i + 1}: ${motivo}` };
    }
    if (v <= 0) return { valores: [], erro: `Gabinete ${i + 1}: a largura precisa ser maior que zero.` };
    valores.push(v);
  }
  return { valores, erro: null };
}
