/**
 * Cálculo de um módulo: estrutura (pelas regras), vãos, divisórias e prateleiras.
 *
 * Função pura e determinística: mesma entrada, mesmo resultado. Nunca lança
 * erro por medida ruim; devolve a lista de problemas e marca o resultado como
 * inválido. Um módulo inválido não pode seguir para lista de peças e corte.
 */
import { avaliar, ErroExpressao, type Valor } from './expressao';
import {
  compilarModelo,
  type DefinicaoParametro,
  type DefinicaoRegra,
  type ExpressaoCompilada,
  type MaterialComponente,
  type ModeloCompilado,
  type PapelComponente,
} from './regra';
import { FUNDOS_PADRAO, MONTAGENS_PADRAO } from './regras-padrao';
import {
  DIAMETRO_COPA,
  PARAMETROS_FRENTES,
  SISTEMA_32,
  corredicaPara,
  dobradicasPorAltura,
  juntarFerragens,
  plural,
  type EntradaFrentes,
  type FerragemNecessaria,
  type FrenteDoVao,
  type Furo,
} from './frentes';
import { furarMontagem, PARAMETROS_FURACAO, type EntradaFuracao, type Juncao } from './furacao';
import { intersecao } from './geometria';
import { distribuir, dmm, formatarMm, type Dmm } from './unidades';

/**
 * Posição da peça no móvel: canto (x, y, z) e tamanho (dx, dy, dz).
 * x para a direita, y para cima, z para trás; origem no canto inferior
 * esquerdo da face da frente da caixa.
 */
export interface Caixa {
  x: Dmm;
  y: Dmm;
  z: Dmm;
  dx: Dmm;
  dy: Dmm;
  dz: Dmm;
}

export interface Componente {
  id: string;
  papel: PapelComponente;
  nome: string;
  material: MaterialComponente;
  /** Medida que acompanha o veio. */
  comprimento: Dmm;
  largura: Dmm;
  espessura: Dmm;
  /** De onde a medida saiu, em termos das medidas do módulo. */
  origem: string;
  caixa: Caixa;
  /** Furação (dobradiça, pino de prateleira), em coordenadas da peça. */
  furos?: Furo[];
}

export interface Vao {
  indice: number;
  /** Distância da face interna da lateral esquerda até o início do vão. */
  x: Dmm;
  largura: Dmm;
  fixo: boolean;
}

export interface Problema {
  codigo: string;
  mensagem: string;
  componente?: string;
}

export interface ResultadoModulo {
  valido: boolean;
  erros: Problema[];
  /** Entradas, parâmetros e medidas derivadas usados no cálculo. */
  medidas: Record<string, number>;
  vaos: Vao[];
  componentes: Componente[];
  /** Não impedem a produção, mas merecem atenção. */
  avisos: Problema[];
  /** Ferragens de um módulo. */
  ferragens: FerragemNecessaria[];
  /** Junções da caixa que receberam furação. */
  juncoes: Juncao[];
}

export type TipoPrateleira = 'fixa' | 'regulavel';

export interface PrateleirasDoVao {
  quantidade: number;
  tipo: TipoPrateleira;
}

export interface EntradaInterior {
  /** Quantidade de divisórias verticais (0 a 20). */
  divisorias: number;
  /** Largura fixa de cada vão (n + 1 itens); null = divide o que sobra. */
  largurasVaos?: ReadonlyArray<Dmm | null>;
  /** Uma configuração para todos os vãos, ou uma por vão (n + 1 itens). */
  prateleiras?: PrateleirasDoVao | ReadonlyArray<PrateleirasDoVao>;
}

export interface EntradaModulo {
  L: Dmm;
  A: Dmm;
  P: Dmm;
  espessuraEstrutura: Dmm;
  espessuraFundo: Dmm;
  /** Parâmetros das regras e do interior; ausentes usam o padrão. */
  parametros?: Readonly<Record<string, number>>;
  interior?: EntradaInterior;
  frentes?: EntradaFrentes;
  /** Furação de montagem (junções, calço da dobradiça, puxador). Ausente = só copas e pinos. */
  furacao?: EntradaFuracao;
}

/** Parâmetros do interior, comuns a todas as montagens. */
export const PARAMETROS_INTERIOR: readonly DefinicaoParametro[] = [
  { nome: 'fl', rotulo: 'Folga lateral da prateleira regulável (por lado)', padrao: 10, min: 0, max: 50 },
  { nome: 'ft', rotulo: 'Folga traseira da prateleira regulável', padrao: 20, min: 0, max: 200 },
  { nome: 'rfp', rotulo: 'Recuo frontal das prateleiras', padrao: 0, min: 0, max: 2000, ajuda: 'Use quando houver porta embutida ou puxador interno.' },
  { nome: 'rfd', rotulo: 'Recuo frontal das divisórias', padrao: 0, min: 0, max: 2000 },
];

export const LIMITES_MODULO = {
  medidaMin: dmm(500), // 50 mm
  medidaMax: dmm(60000), // 6 m
  vaoMin: dmm(500), // 50 mm
  divisoriasMax: 20,
  prateleirasPorVaoMax: 20,
} as const;

const cacheModelos = new Map<string, ModeloCompilado>();

/** Modelo compilado de uma montagem e um fundo padrão, pelo código. */
export function modeloPadrao(montagem: string, fundo: string): ModeloCompilado {
  const chave = `${montagem}+${fundo}`;
  const existente = cacheModelos.get(chave);
  if (existente) return existente;
  const m = MONTAGENS_PADRAO.find((r) => r.codigo === montagem);
  const f = FUNDOS_PADRAO.find((r) => r.codigo === fundo);
  if (!m) throw new Error(`Montagem desconhecida: ${montagem}.`);
  if (!f) throw new Error(`Fundo desconhecido: ${fundo}.`);
  const modelo = compilarModelo(m as DefinicaoRegra, f as DefinicaoRegra);
  cacheModelos.set(chave, modelo);
  return modelo;
}

/** Substitui {nome} por "564 mm" na mensagem. */
function preencher(mensagem: string, ambiente: ReadonlyMap<string, Valor>): string {
  return mensagem.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (inteiro, nome: string) => {
    const v = ambiente.get(nome);
    return typeof v === 'number' ? `${formatarMm(dmm(v))} mm` : inteiro;
  });
}

function numero(exp: ExpressaoCompilada, ambiente: ReadonlyMap<string, Valor>): number {
  const v = avaliar(exp.no, ambiente);
  if (typeof v !== 'number') throw new ErroExpressao(`"${exp.texto}" deveria dar uma medida, deu verdadeiro/falso.`, 0);
  return v;
}

function conferirMedida(nome: string, valor: number, erros: Problema[]): void {
  if (!Number.isSafeInteger(valor)) {
    erros.push({ codigo: 'entrada_invalida', mensagem: `${nome}: valor inválido.` });
  } else if (valor < LIMITES_MODULO.medidaMin || valor > LIMITES_MODULO.medidaMax) {
    erros.push({ codigo: 'entrada_fora_limite', mensagem: `${nome} precisa ficar entre 50 e 6000 mm (recebido ${formatarMm(dmm(valor))} mm).` });
  }
}

function conferirEspessura(nome: string, valor: number, erros: Problema[]): void {
  if (!Number.isSafeInteger(valor) || valor <= 0 || valor > 1000) {
    erros.push({ codigo: 'entrada_fora_limite', mensagem: `${nome} precisa ficar entre 0,1 e 100 mm.` });
  }
}

export function calcularModulo(modelo: ModeloCompilado, entrada: EntradaModulo): ResultadoModulo {
  const erros: Problema[] = [];
  const avisos: Problema[] = [];
  const falhar = (): ResultadoModulo => ({ valido: false, erros, medidas: {}, vaos: [], componentes: [], avisos, ferragens: [], juncoes: [] });

  conferirMedida('Largura', entrada.L, erros);
  conferirMedida('Altura', entrada.A, erros);
  conferirMedida('Profundidade', entrada.P, erros);
  conferirEspessura('Espessura da estrutura', entrada.espessuraEstrutura, erros);
  conferirEspessura('Espessura do fundo', entrada.espessuraFundo, erros);
  if (entrada.frentes) {
    conferirEspessura('Espessura da frente', entrada.frentes.espessuraFrente, erros);
    conferirEspessura('Espessura da caixa da gaveta', entrada.frentes.espessuraGaveta, erros);
  }

  // Parâmetros: padrão + informados, com limites.
  const definicoes = [...modelo.parametros, ...PARAMETROS_INTERIOR, ...PARAMETROS_FRENTES, ...PARAMETROS_FURACAO];
  const informados = entrada.parametros ?? {};
  for (const nome of Object.keys(informados)) {
    if (!definicoes.some((d) => d.nome === nome)) {
      erros.push({ codigo: 'parametro_desconhecido', mensagem: `Parâmetro "${nome}" não existe nesta combinação de montagem e fundo.` });
    }
  }
  const ambiente = new Map<string, Valor>([
    ['L', entrada.L],
    ['A', entrada.A],
    ['P', entrada.P],
    ['e', entrada.espessuraEstrutura],
    ['ef', entrada.espessuraFundo],
  ]);
  for (const d of definicoes) {
    const v = informados[d.nome] ?? d.padrao;
    if (!Number.isSafeInteger(v) || v < d.min || v > d.max) {
      erros.push({
        codigo: 'parametro_fora_limite',
        mensagem: `${d.rotulo}: use entre ${formatarMm(dmm(d.min))} e ${formatarMm(dmm(d.max))} mm.`,
      });
    }
    ambiente.set(d.nome, v);
  }
  if (erros.length > 0) return falhar();

  // Medidas derivadas, em ordem topológica.
  try {
    for (const d of modelo.derivados) ambiente.set(d.nome, numero(d, ambiente));
  } catch (e) {
    if (!(e instanceof ErroExpressao)) throw e;
    erros.push({ codigo: 'erro_regra', mensagem: `Erro na regra: ${e.message}` });
    return falhar();
  }

  for (const v of modelo.validacoes) {
    try {
      if (avaliar(v.condicao.no, ambiente) !== true) {
        erros.push({ codigo: 'validacao', mensagem: preencher(v.mensagem, ambiente) });
      }
    } catch (e) {
      if (!(e instanceof ErroExpressao)) throw e;
      erros.push({ codigo: 'erro_regra', mensagem: `Erro na validação de "${v.regra}": ${e.message}` });
    }
  }

  // Componentes da estrutura e do fundo.
  const componentes: Componente[] = [];
  for (const c of modelo.componentes) {
    try {
      if (c.quando && avaliar(c.quando.no, ambiente) !== true) continue;
      const espessura = c.material === 'estrutura' ? entrada.espessuraEstrutura : entrada.espessuraFundo;
      componentes.push({
        id: c.id,
        papel: c.papel,
        nome: c.nome,
        material: c.material,
        comprimento: dmm(numero(c.comprimento, ambiente)),
        largura: dmm(numero(c.largura, ambiente)),
        espessura,
        origem: c.origem,
        caixa: {
          x: dmm(numero(c.caixa.x, ambiente)),
          y: dmm(numero(c.caixa.y, ambiente)),
          z: dmm(numero(c.caixa.z, ambiente)),
          dx: dmm(numero(c.caixa.dx, ambiente)),
          dy: dmm(numero(c.caixa.dy, ambiente)),
          dz: dmm(numero(c.caixa.dz, ambiente)),
        },
      });
    } catch (e) {
      if (!(e instanceof ErroExpressao)) throw e;
      erros.push({ codigo: 'erro_regra', mensagem: `Erro no componente ${c.nome}: ${e.message}`, componente: c.id });
    }
  }

  // Interior.
  const vaos = calcularInterior(entrada, ambiente, componentes, erros);
  const ferragens: FerragemNecessaria[] = [];
  if (erros.length === 0) {
    furarPinos(ambiente, vaos, componentes, ferragens, avisos);
    if (entrada.frentes) calcularFrentes(entrada.frentes, entrada.espessuraFundo, ambiente, vaos, componentes, erros, avisos, ferragens);
  }
  let juncoes: Juncao[] = [];
  if (erros.length === 0 && entrada.furacao) {
    juncoes = furarMontagem(entrada.furacao, {
      n: (nome) => ambiente.get(nome) as number,
      componentes,
      erros,
      avisos,
      ferragens,
      frentes: entrada.frentes && { espessura: entrada.frentes.espessuraFrente, sobreposta: entrada.frentes.modo === 'sobreposta', puxador: entrada.frentes.puxador ?? true },
    });
  }

  // Nenhuma peça pode ter medida nula ou negativa.
  for (const c of componentes) {
    if (c.comprimento <= 0 || c.largura <= 0) {
      erros.push({
        codigo: 'peca_invalida',
        mensagem: `${c.nome} ficou com ${formatarMm(c.comprimento)} × ${formatarMm(c.largura)} mm. Revise as medidas e folgas.`,
        componente: c.id,
      });
    } else if (!caixaConfere(c)) {
      // Erro de quem escreveu a regra: a posição não bate com o tamanho da peça.
      erros.push({
        codigo: 'geometria_inconsistente',
        mensagem: `${c.nome}: a posição no móvel (${formatarMm(c.caixa.dx)} × ${formatarMm(c.caixa.dy)} × ${formatarMm(c.caixa.dz)}) não bate com a peça (${formatarMm(c.comprimento)} × ${formatarMm(c.largura)} × ${formatarMm(c.espessura)}). Revise a regra.`,
        componente: c.id,
      });
    }
  }

  const medidas: Record<string, number> = {};
  for (const [k, v] of ambiente) if (typeof v === 'number') medidas[k] = v;

  return { valido: erros.length === 0, erros, medidas, vaos, componentes, avisos, ferragens: juntarFerragens(ferragens), juncoes };
}

/** O tamanho da caixa é o da peça, em alguma orientação. */
export function caixaConfere(c: Pick<Componente, 'comprimento' | 'largura' | 'espessura' | 'caixa'>): boolean {
  const ordenar = (v: number[]) => [...v].sort((a, b) => a - b).join(',');
  return ordenar([c.caixa.dx, c.caixa.dy, c.caixa.dz]) === ordenar([c.comprimento, c.largura, c.espessura]);
}

function calcularInterior(
  entrada: EntradaModulo,
  ambiente: Map<string, Valor>,
  componentes: Componente[],
  erros: Problema[],
): Vao[] {
  const interior = entrada.interior ?? { divisorias: 0 };
  const n = interior.divisorias;
  const e = entrada.espessuraEstrutura;
  const Li = ambiente.get('Li') as number;
  const Hi = ambiente.get('Hi') as number;
  const Pint = ambiente.get('Pint') as number;
  const xi = ambiente.get('xi') as number;
  const yi = ambiente.get('yi') as number;
  const fl = ambiente.get('fl') as number;
  const ft = ambiente.get('ft') as number;
  const rfp = ambiente.get('rfp') as number;
  const rfd = ambiente.get('rfd') as number;

  if (!Number.isSafeInteger(n) || n < 0 || n > LIMITES_MODULO.divisoriasMax) {
    erros.push({ codigo: 'divisorias_invalidas', mensagem: `Use de 0 a ${LIMITES_MODULO.divisoriasMax} divisórias.` });
    return [];
  }
  if (Li <= 0 || Hi <= 0) return [];

  // Larguras dos vãos.
  const fixas = interior.largurasVaos ?? [];
  if (fixas.length > 0 && fixas.length !== n + 1) {
    erros.push({ codigo: 'vaos_invalidos', mensagem: `Informe a largura de ${n + 1} vão(s), ou de nenhum.` });
    return [];
  }
  const fixasDe = (i: number): Dmm | null => fixas[i] ?? null;
  let somaFixas = 0;
  for (let i = 0; i <= n; i++) {
    const f = fixasDe(i);
    if (f === null) continue;
    if (!Number.isSafeInteger(f) || f <= 0) {
      erros.push({ codigo: 'vaos_invalidos', mensagem: `A largura do vão ${i + 1} precisa ser maior que zero.` });
      return [];
    }
    somaFixas += f;
  }
  const livres = Array.from({ length: n + 1 }, (_, i) => i).filter((i) => fixasDe(i) === null);
  const sobra = Li - n * e - somaFixas;
  if (sobra < 0 || (livres.length === 0 && sobra !== 0)) {
    erros.push({
      codigo: 'vaos_nao_fecham',
      mensagem:
        livres.length === 0
          ? `Os vãos (${formatarMm(dmm(somaFixas))} mm) mais as divisórias (${formatarMm(dmm(n * e))} mm) precisam somar a largura interna (${formatarMm(dmm(Li))} mm). Deixe pelo menos um vão livre.`
          : `Os vãos fixos (${formatarMm(dmm(somaFixas))} mm) e as divisórias (${formatarMm(dmm(n * e))} mm) passam da largura interna (${formatarMm(dmm(Li))} mm).`,
    });
    return [];
  }
  const partes = livres.length > 0 ? distribuir(dmm(sobra), livres.length) : [];
  const vaos: Vao[] = [];
  let x = 0;
  for (let i = 0; i <= n; i++) {
    const f = fixasDe(i);
    const largura = f ?? (partes[livres.indexOf(i)] as Dmm);
    vaos.push({ indice: i + 1, x: dmm(x), largura: dmm(largura), fixo: f !== null });
    ambiente.set(`V${i + 1}`, largura);
    x += largura + e;
  }
  for (const v of vaos) {
    if (v.largura < LIMITES_MODULO.vaoMin) {
      erros.push({ codigo: 'vao_estreito', mensagem: `O vão ${v.indice} ficou com ${formatarMm(v.largura)} mm; o mínimo é 50 mm.` });
    }
  }

  // Divisórias.
  for (let k = 1; k <= n; k++) {
    const anterior = vaos[k - 1] as Vao;
    componentes.push({
      id: `divisoria_${k}`,
      papel: 'divisoria',
      nome: n === 1 ? 'Divisória' : `Divisória ${k}`,
      material: 'estrutura',
      comprimento: dmm(Hi),
      largura: dmm(Pint - rfd),
      espessura: e,
      origem: rfd > 0 ? 'Hi × (Pint - rfd)' : 'Hi × Pint',
      caixa: { x: dmm(xi + anterior.x + anterior.largura), y: dmm(yi), z: dmm(rfd), dx: e, dy: dmm(Hi), dz: dmm(Pint - rfd) },
    });
  }

  // Prateleiras.
  const config = interior.prateleiras;
  if (Array.isArray(config) && config.length !== n + 1) {
    erros.push({ codigo: 'prateleiras_invalidas', mensagem: `Informe as prateleiras de ${n + 1} vão(s), ou uma configuração para todos.` });
    return vaos;
  }
  for (const v of vaos) {
    const p: PrateleirasDoVao = (Array.isArray(config) ? config[v.indice - 1] : config) ?? { quantidade: 0, tipo: 'fixa' };
    if (!Number.isSafeInteger(p.quantidade) || p.quantidade < 0 || p.quantidade > LIMITES_MODULO.prateleirasPorVaoMax) {
      erros.push({ codigo: 'prateleiras_invalidas', mensagem: `Vão ${v.indice}: use de 0 a ${LIMITES_MODULO.prateleirasPorVaoMax} prateleiras.` });
      continue;
    }
    if (p.quantidade === 0) continue;
    // Posição de desenho: espaçamento igual. Não altera as medidas da peça.
    const espacos = Hi - p.quantidade * e;
    if (espacos < 0) {
      erros.push({ codigo: 'prateleiras_demais', mensagem: `Vão ${v.indice}: ${p.quantidade} prateleiras não cabem na altura interna.` });
      continue;
    }
    const intervalos = distribuir(dmm(espacos), p.quantidade + 1);
    let y = yi;
    const regulavel = p.tipo === 'regulavel';
    for (let j = 1; j <= p.quantidade; j++) {
      y += intervalos[j - 1] as number;
      const sufixo = vaos.length > 1 ? ` (vão ${v.indice})` : '';
      componentes.push({
        id: `prateleira_v${v.indice}_${j}`,
        papel: regulavel ? 'prateleira_regulavel' : 'prateleira_fixa',
        nome: `${regulavel ? 'Prateleira regulável' : 'Prateleira fixa'}${p.quantidade > 1 ? ` ${j}` : ''}${sufixo}`,
        material: 'estrutura',
        comprimento: dmm(regulavel ? v.largura - 2 * fl : v.largura),
        largura: dmm(regulavel ? Pint - ft - rfp : Pint - rfp),
        espessura: e,
        origem: regulavel ? `(V${v.indice} - 2*fl) × (Pint - ft - rfp)` : `V${v.indice} × (Pint - rfp)`,
        caixa: {
          x: dmm(xi + v.x + (regulavel ? fl : 0)),
          y: dmm(y),
          z: dmm(rfp),
          dx: dmm(regulavel ? v.largura - 2 * fl : v.largura),
          dy: e,
          dz: dmm(regulavel ? Pint - ft - rfp : Pint - rfp),
        },
      });
      y += e;
    }
  }
  return vaos;
}

// ---------------------------------------------------------------------------
// Furos de pino (sistema 32) para prateleiras reguláveis
// ---------------------------------------------------------------------------

/** Peças que formam as paredes esquerda e direita de cada vão. */
function paredesDosVaos(vaos: Vao[], componentes: Componente[]): Array<{ esquerda?: Componente; direita?: Componente }> {
  const lateralE = componentes.find((c) => c.id === 'lateral_esquerda');
  const lateralD = componentes.find((c) => c.id === 'lateral_direita');
  return vaos.map((v, i) => ({
    esquerda: i === 0 ? lateralE : componentes.find((c) => c.id === `divisoria_${i}`),
    direita: i === vaos.length - 1 ? lateralD : componentes.find((c) => c.id === `divisoria_${i + 1}`),
  }));
}

function furarPinos(ambiente: Map<string, Valor>, vaos: Vao[], componentes: Componente[], ferragens: FerragemNecessaria[], avisos: Problema[]): void {
  const n = (k: string) => ambiente.get(k) as number;
  const [yi, Hi, Pint, ft, rfp, cp, mp] = [n('yi'), n('Hi'), n('Pint'), n('ft'), n('rfp'), n('cp'), n('mp')];
  const paredes = paredesDosVaos(vaos, componentes);
  for (const [i, v] of vaos.entries()) {
    const reg = componentes.filter((c) => c.papel === 'prateleira_regulavel' && c.id.startsWith(`prateleira_v${v.indice}_`));
    if (reg.length === 0) continue;
    ferragens.push({ codigo: 'suporte_prateleira', descricao: 'Suporte de prateleira (pino)', quantidade: 4 * reg.length });
    // Colunas: a cp da frente e do fundo da prateleira (profundidade z).
    const zFrente = rfp + cp;
    const zFundo = Pint - ft - cp;
    // Linhas: de yi + mp até yi + Hi − mp, a cada 32 mm.
    const linhas: number[] = [];
    for (let y = yi + mp; y <= yi + Hi - mp; y += SISTEMA_32.passo) linhas.push(y);
    if (linhas.length === 0 || zFundo <= zFrente) {
      avisos.push({ codigo: 'sem_furos_pino', mensagem: `Vão ${v.indice}: o vão é pequeno demais para a fileira de furos de pino; posicione os suportes à mão.` });
      continue;
    }
    for (const [parede, face] of [
      [paredes[i]!.esquerda, 'x+'],
      [paredes[i]!.direita, 'x-'],
    ] as const) {
      if (!parede) continue;
      const k = parede.caixa;
      const furo: Furo = {
        finalidade: 'pino_prateleira',
        diametro: SISTEMA_32.diametro,
        profundidade: SISTEMA_32.profundidade,
        face,
        centros: linhas.flatMap((y) => [zFrente, zFundo].map((z) => ({ u: dmm(y - k.y), v: dmm(z - k.z) }))),
      };
      parede.furos = [...(parede.furos ?? []), furo];
    }
  }
}

// ---------------------------------------------------------------------------
// Portas e gavetas
// ---------------------------------------------------------------------------

function calcularFrentes(
  fr: EntradaFrentes,
  espessuraFundo: Dmm,
  ambiente: Map<string, Valor>,
  vaos: Vao[],
  componentes: Componente[],
  erros: Problema[],
  avisos: Problema[],
  ferragens: FerragemNecessaria[],
): void {
  const n = (k: string) => ambiente.get(k) as number;
  const [L, e, xi, yi, Hi, Pint] = [n('L'), n('e'), n('xi'), n('yi'), n('Hi'), n('Pint')];
  const [gp, gb, gi, fc, fg, ftc, kd, dd, pcd] = [n('gp'), n('gb'), n('gi'), n('fc'), n('fg'), n('ftc'), n('kd'), n('dd'), n('pcd')];
  const ep = fr.espessuraFrente;
  const ec = fr.espessuraGaveta;
  const sobreposta = fr.modo === 'sobreposta';
  const puxador = fr.puxador ?? true;

  const config = fr.vaos;
  if (Array.isArray(config) && config.length !== vaos.length) {
    erros.push({ codigo: 'frentes_invalidas', mensagem: `Informe a frente de ${vaos.length} vão(s), ou uma configuração para todos.` });
    return;
  }
  const frenteDe = (i: number): FrenteDoVao => (Array.isArray(config) ? config[i] : (config as FrenteDoVao)) ?? { tipo: 'aberto' };

  // Altura que as frentes sobrepostas cobrem: das laterais (o tampo sobre as laterais fica de fora).
  const laterais = componentes.filter((c) => c.papel === 'lateral');
  const topo = laterais.length ? Math.max(...laterais.map((c) => c.caixa.y + c.caixa.dy)) : n('A');
  const novos: Componente[] = [];

  for (const [i, v] of vaos.entries()) {
    const f = frenteDe(i);
    if (f.tipo === 'aberto') continue;
    const sufixo = vaos.length > 1 ? ` (vão ${v.indice})` : '';

    // Região que as frentes deste vão ocupam, já descontadas as folgas de borda.
    let x0: number, x1: number, y0: number, y1: number, z: number;
    const bordaEsq = i === 0; // encosta na lateral esquerda
    const bordaDir = i === vaos.length - 1;
    if (sobreposta) {
      // Na divisória, cada lado fica com metade dela menos meia folga (meia-sobreposição).
      const divEsq = xi + v.x - e; // face esquerda da divisória à esquerda
      const divDir = xi + v.x + v.largura; // face esquerda da divisória à direita
      x0 = bordaEsq ? gb : divEsq + e - Math.floor((e - gp) / 2);
      x1 = bordaDir ? L - gb : divDir + Math.floor((e - gp) / 2);
      y0 = gb;
      y1 = topo - gb;
      z = -ep;
    } else {
      x0 = xi + v.x + gi;
      x1 = xi + v.x + v.largura - gi;
      y0 = yi + gi;
      y1 = yi + Hi - gi;
      z = 0;
      // A frente embutida ocupa a boca do vão: prateleiras e divisórias precisam estar recuadas.
      const rfp = n('rfp');
      const temPrat = componentes.some((c) => c.id.startsWith(`prateleira_v${v.indice}_`));
      if (temPrat && rfp < ep) {
        erros.push({ codigo: 'frente_embutida_recuo', mensagem: `Vão ${v.indice}: com frente embutida de ${formatarMm(dmm(ep))} mm, o recuo frontal das prateleiras precisa ser de pelo menos ${formatarMm(dmm(ep))} mm.` });
        continue;
      }
    }
    if (x1 - x0 <= 0 || y1 - y0 <= 0) {
      erros.push({ codigo: 'frente_invalida', mensagem: `Vão ${v.indice}: não sobra espaço para a frente com essas folgas.` });
      continue;
    }

    if (f.tipo === 'porta') {
      const qtd = f.portas === 2 ? 2 : 1;
      const larguras = qtd === 2 ? distribuir(dmm(x1 - x0 - gp), 2) : [dmm(x1 - x0)];
      const altura = y1 - y0;
      const nDob = dobradicasPorAltura(dmm(altura));
      if (nDob === null) {
        erros.push({ codigo: 'porta_alta', mensagem: `Vão ${v.indice}: porta de ${formatarMm(dmm(altura))} mm é alta demais para dobradiça de copa (até 2400 mm). Divida em duas portas na altura.` });
        continue;
      }
      if (altura < 2 * dd + DIAMETRO_COPA) {
        erros.push({ codigo: 'porta_baixa', mensagem: `Vão ${v.indice}: porta de ${formatarMm(dmm(altura))} mm é baixa demais para as dobradiças a ${formatarMm(dmm(dd))} mm do topo e do pé.` });
        continue;
      }
      let x = x0;
      for (let k = 0; k < qtd; k++) {
        const larg = larguras[k]!;
        const lado = qtd === 2 ? (k === 0 ? 'esquerda' : 'direita') : (f.lado ?? 'esquerda');
        if (larg > 6000) avisos.push({ codigo: 'porta_larga', mensagem: `Vão ${v.indice}: porta de ${formatarMm(larg)} mm de largura; acima de 600 mm a porta tende a empenar e pesar nas dobradiças.` });
        // Tipo de dobradiça pelo que a porta cobre do lado das dobradiças.
        const naBordaDoMovel = lado === 'esquerda' ? bordaEsq && k === 0 : bordaDir && k === qtd - 1;
        const codigo = !sobreposta ? 'dobradica_supercurva' : naBordaDoMovel ? 'dobradica_reta' : 'dobradica_curva';
        ferragens.push({ codigo, descricao: '', quantidade: nDob });
        if (puxador) ferragens.push({ codigo: 'puxador', descricao: '', quantidade: 1 });
        // Copas: a kd + raio da borda do lado das dobradiças; a dd do topo e do pé, as do meio distribuídas.
        const vCopa = kd + DIAMETRO_COPA / 2;
        const passos = distribuir(dmm(altura - 2 * dd), nDob - 1);
        const us: number[] = [dd];
        for (const p of passos) us.push(us.at(-1)! + p);
        const id = qtd === 2 ? `porta_v${v.indice}_${k + 1}` : `porta_v${v.indice}`;
        novos.push({
          id,
          papel: 'porta',
          nome: `Porta${qtd === 2 ? (k === 0 ? ' esquerda' : ' direita') : ''}${sufixo}`,
          material: 'frente',
          comprimento: dmm(altura),
          largura: larg,
          espessura: ep,
          origem: sobreposta ? 'sobreposta: cobre a caixa − folgas' : 'embutida: boca do vão − folgas',
          caixa: { x: dmm(x), y: dmm(y0), z: dmm(z), dx: larg, dy: dmm(altura), dz: ep },
          furos: [
            {
              finalidade: 'dobradica',
              diametro: DIAMETRO_COPA,
              profundidade: dmm(pcd),
              face: 'z+',
              centros: us.map((u) => ({ u: dmm(u), v: dmm(lado === 'esquerda' ? vCopa : larg - vCopa) })),
            },
          ],
        });
        x += larg + gp;
      }
      continue;
    }

    // Gavetas.
    const nG = f.gavetas ?? 1;
    if (!Number.isSafeInteger(nG) || nG < 1 || nG > 8) {
      erros.push({ codigo: 'gavetas_invalidas', mensagem: `Vão ${v.indice}: use de 1 a 8 gavetas.` });
      continue;
    }
    if (componentes.some((c) => c.id.startsWith(`prateleira_v${v.indice}_`))) {
      erros.push({ codigo: 'gaveta_com_prateleira', mensagem: `Vão ${v.indice}: tire as prateleiras do vão para colocar gavetas.` });
      continue;
    }
    const zCaixa = sobreposta ? 0 : ep;
    const comprimento = corredicaPara(Pint - zCaixa - ftc);
    if (comprimento === null) {
      erros.push({ codigo: 'gaveta_rasa', mensagem: `Vão ${v.indice}: sobram ${formatarMm(dmm(Pint - zCaixa - ftc))} mm de profundidade; a menor corrediça comercial tem 250 mm.` });
      continue;
    }
    const larguraCaixa = v.largura - 2 * fc;
    if (larguraCaixa - 2 * ec <= 0) {
      erros.push({ codigo: 'gaveta_estreita', mensagem: `Vão ${v.indice}: estreito demais para gaveta com corrediça.` });
      continue;
    }
    // Frentes e caixas todas iguais (peças repetidas na produção). O resto da
    // divisão (menos de 0,1 mm × gavetas) fica na folga de cima.
    const hFrente = Math.floor((y1 - y0 - (nG - 1) * gp) / nG);
    const alturasFrente = Array.from({ length: nG }, () => dmm(hFrente));
    const faixas = Array.from({ length: nG }, () => dmm(Math.floor(Hi / nG)));
    let yF = y0;
    let yC = yi;
    for (let k = 0; k < nG; k++) {
      const hF = alturasFrente[k]!;
      const faixa = faixas[k]!;
      const hC = faixa - fg - espessuraFundo;
      const nome = (p: string) => `${p}${nG > 1 ? ` ${k + 1}` : ''}${sufixo}`;
      const base = `gaveta_v${v.indice}_${k + 1}`;
      if (hC < 600) {
        erros.push({ codigo: 'gaveta_baixa', mensagem: `Vão ${v.indice}: com ${nG} gavetas, a caixa fica com ${formatarMm(dmm(hC))} mm de altura (mínimo 60 mm).` });
        break;
      }
      const xC = xi + v.x + fc;
      const yL = yC + espessuraFundo;
      novos.push(
        {
          id: `${base}_frente`,
          papel: 'frente_gaveta',
          nome: nome('Frente de gaveta'),
          material: 'frente',
          comprimento: dmm(x1 - x0),
          largura: hF,
          espessura: ep,
          origem: sobreposta ? 'sobreposta: cobre a caixa − folgas' : 'embutida: boca do vão − folgas',
          caixa: { x: dmm(x0), y: dmm(yF), z: dmm(z), dx: dmm(x1 - x0), dy: hF, dz: ep },
        },
        {
          id: `${base}_lateral_e`,
          papel: 'lateral_gaveta',
          nome: nome('Lateral de gaveta'),
          material: 'gaveta',
          comprimento,
          largura: dmm(hC),
          espessura: ec,
          origem: 'corrediça × (faixa − fg − fundo)',
          caixa: { x: dmm(xC), y: dmm(yL), z: dmm(zCaixa), dx: ec, dy: dmm(hC), dz: comprimento },
        },
        {
          id: `${base}_lateral_d`,
          papel: 'lateral_gaveta',
          nome: nome('Lateral de gaveta'),
          material: 'gaveta',
          comprimento,
          largura: dmm(hC),
          espessura: ec,
          origem: 'corrediça × (faixa − fg − fundo)',
          caixa: { x: dmm(xC + larguraCaixa - ec), y: dmm(yL), z: dmm(zCaixa), dx: ec, dy: dmm(hC), dz: comprimento },
        },
        {
          id: `${base}_contrafrente`,
          papel: 'contrafrente_gaveta',
          nome: nome('Contrafrente de gaveta'),
          material: 'gaveta',
          comprimento: dmm(larguraCaixa - 2 * ec),
          largura: dmm(hC),
          espessura: ec,
          origem: '(vão − 2·fc − 2·espessura) × altura da caixa',
          caixa: { x: dmm(xC + ec), y: dmm(yL), z: dmm(zCaixa), dx: dmm(larguraCaixa - 2 * ec), dy: dmm(hC), dz: ec },
        },
        {
          id: `${base}_traseira`,
          papel: 'traseira_gaveta',
          nome: nome('Traseira de gaveta'),
          material: 'gaveta',
          comprimento: dmm(larguraCaixa - 2 * ec),
          largura: dmm(hC),
          espessura: ec,
          origem: '(vão − 2·fc − 2·espessura) × altura da caixa',
          caixa: { x: dmm(xC + ec), y: dmm(yL), z: dmm(zCaixa + comprimento - ec), dx: dmm(larguraCaixa - 2 * ec), dy: dmm(hC), dz: ec },
        },
        {
          id: `${base}_fundo`,
          papel: 'fundo_gaveta',
          nome: nome('Fundo de gaveta'),
          material: 'fundo',
          comprimento: dmm(larguraCaixa),
          largura: comprimento,
          espessura: espessuraFundo,
          origem: '(vão − 2·fc) × corrediça',
          caixa: { x: dmm(xC), y: dmm(yC), z: dmm(zCaixa), dx: dmm(larguraCaixa), dy: espessuraFundo, dz: comprimento },
        },
      );
      ferragens.push({ codigo: 'corredica', descricao: '', quantidade: 1, comprimento });
      if (puxador) ferragens.push({ codigo: 'puxador', descricao: '', quantidade: 1 });
      yF += hF + gp;
      yC += faixa;
    }
    if (nG > 1) avisos.push({ codigo: 'gavetas_info', mensagem: `Vão ${v.indice}: ${plural(nG, 'gaveta', 'gavetas')} com corrediça de ${formatarMm(comprimento)} mm.` });
  }

  // Nenhuma frente ou gaveta pode ocupar o espaço de outra peça.
  for (const novo of novos) {
    for (const outro of [...componentes, ...novos]) {
      if (outro === novo) continue;
      if (intersecao(novo.caixa, outro.caixa)) {
        if (novos.includes(outro) && novos.indexOf(outro) < novos.indexOf(novo)) continue; // par já visto
        erros.push({ codigo: 'frente_colide', mensagem: `${novo.nome} ocupa o mesmo espaço que ${outro.nome}. Revise folgas e recuos.`, componente: novo.id });
      }
    }
  }
  componentes.push(...novos);
}

export type DirecaoVeioChapa = 'sem_veio' | 'comprimento' | 'largura';

/**
 * A peça cabe na chapa? O comprimento da peça segue o veio; se a chapa tem
 * veio, a peça não pode girar. Sem margem de esquadrejamento: isso entra no
 * plano de corte.
 */
export function cabeNaChapa(
  peca: { comprimento: number; largura: number },
  chapa: { comprimento: number; largura: number },
  veio: DirecaoVeioChapa,
): boolean {
  const direto = peca.comprimento <= chapa.comprimento && peca.largura <= chapa.largura;
  const girado = peca.comprimento <= chapa.largura && peca.largura <= chapa.comprimento;
  if (veio === 'comprimento') return direto;
  if (veio === 'largura') return girado;
  return direto || girado;
}
