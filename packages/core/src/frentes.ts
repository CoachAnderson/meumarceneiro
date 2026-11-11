/**
 * Frentes do módulo: portas de abrir, gavetas e as ferragens que elas pedem.
 *
 * Tudo sai das mesmas posições do resto do módulo (caixas 3D), então os
 * testes de colisão continuam valendo: uma frente embutida que bate numa
 * prateleira, por exemplo, vira erro do módulo.
 *
 * Valores de ferragem (quantidade de dobradiças por altura, distância da copa,
 * folga de corrediça, sistema 32) seguem a orientação mais comum dos
 * fabricantes e são todos parâmetros: confira com a ferragem que você usa.
 */
import type { DefinicaoParametro } from './regra';
import { dmm, type Dmm } from './unidades';

/**
 * Furo numa peça, em coordenadas da própria peça: u ao longo do comprimento
 * (a partir da ponta 1), v ao longo da largura (a partir da borda da frente).
 */
export type FinalidadeFuro =
  | 'dobradica'
  | 'pino_prateleira'
  | 'calco_dobradica'
  | 'minifix_tambor'
  | 'minifix_haste'
  | 'minifix_pino'
  | 'cavilha'
  | 'parafuso'
  | 'parafuso_guia'
  | 'puxador'
  | 'corredica'
  | 'fixacao_frente'
  | 'engrosso';

/** Lado do móvel para onde a superfície furada olha: x+ direita, x− esquerda, y+ cima, y− baixo, z+ trás, z− frente. */
export type DirecaoFace = 'x+' | 'x-' | 'y+' | 'y-' | 'z+' | 'z-';

export interface Furo {
  finalidade: FinalidadeFuro;
  diametro: Dmm;
  profundidade: Dmm;
  face: DirecaoFace;
  /** Furo de topo: feito na borda da peça, no meio da espessura. `u` ou `v` indica em que borda. */
  topo?: boolean;
  /** Atravessa a peça. */
  passante?: boolean;
  centros: Array<{ u: Dmm; v: Dmm }>;
}

export type TipoFrente = 'aberto' | 'porta' | 'gavetas';
export type LadoDobradica = 'esquerda' | 'direita';

export interface FrenteDoVao {
  tipo: TipoFrente;
  /** Portas no vão: 1 ou 2 (par, abrindo para os lados). */
  portas?: 1 | 2;
  /** Lado das dobradiças quando há uma porta só. */
  lado?: LadoDobradica;
  /** Quantidade de gavetas empilhadas (1 a 8). */
  gavetas?: number;
}

export interface EntradaFrentes {
  /** Sobreposta: a frente cobre a caixa. Embutida: a frente fica dentro do vão. */
  modo: 'sobreposta' | 'embutida';
  espessuraFrente: Dmm;
  /** Espessura das peças da caixa da gaveta. */
  espessuraGaveta: Dmm;
  /** Uma configuração para todos os vãos, ou uma por vão. */
  vaos: FrenteDoVao | readonly FrenteDoVao[];
  /** Conta um puxador por porta e por gaveta. Padrão: sim. */
  puxador?: boolean;
}

export const PARAMETROS_FRENTES: readonly DefinicaoParametro[] = [
  { nome: 'gp', rotulo: 'Folga entre frentes', padrao: 30, min: 0, max: 100, ajuda: 'Entre duas portas, duas gavetas ou porta e gaveta.' },
  { nome: 'gb', rotulo: 'Folga da frente sobreposta na borda do móvel', padrao: 15, min: 0, max: 100 },
  { nome: 'gi', rotulo: 'Folga da frente embutida (por lado)', padrao: 20, min: 0, max: 100 },
  { nome: 'fc', rotulo: 'Folga da corrediça (por lado)', padrao: 125, min: 0, max: 400, ajuda: 'Espaço entre a caixa da gaveta e a lateral, para a corrediça.' },
  { nome: 'fg', rotulo: 'Espaço acima da caixa da gaveta', padrao: 400, min: 50, max: 2000, ajuda: 'Para tirar e colocar a gaveta.' },
  { nome: 'ftc', rotulo: 'Folga atrás da corrediça', padrao: 100, min: 0, max: 1000 },
  { nome: 'kd', rotulo: 'Distância da copa à borda da porta (K)', padrao: 50, min: 20, max: 90 },
  { nome: 'dd', rotulo: 'Dobradiça: distância ao topo e ao pé da porta', padrao: 1000, min: 400, max: 3000 },
  { nome: 'pcd', rotulo: 'Profundidade da copa da dobradiça', padrao: 130, min: 80, max: 160 },
  { nome: 'cp', rotulo: 'Furos de pino: distância à frente e ao fundo da prateleira', padrao: 370, min: 100, max: 1000 },
  { nome: 'mp', rotulo: 'Furos de pino: margem no topo e na base do vão', padrao: 960, min: 320, max: 3000 },
];

/** Copa da dobradiça: Ø 35 mm. */
export const DIAMETRO_COPA = dmm(350);
/** Sistema 32: furos de Ø 5 mm, 10 mm de fundo, a cada 32 mm. */
export const SISTEMA_32 = { diametro: dmm(50), profundidade: dmm(100), passo: dmm(320) } as const;
/** Comprimentos comerciais de corrediça telescópica (mm). */
export const CORREDICAS_MM = [250, 300, 350, 400, 450, 500, 550, 600] as const;

/** Dobradiças por porta, pela altura (orientação comum de fabricantes). Null = alta demais. */
export function dobradicasPorAltura(altura: Dmm): number | null {
  if (altura <= 9000) return 2;
  if (altura <= 16000) return 3;
  if (altura <= 20000) return 4;
  if (altura <= 24000) return 5;
  return null;
}

/** Maior corrediça comercial que cabe na profundidade disponível. */
export function corredicaPara(profundidade: number): Dmm | null {
  let r: number | null = null;
  for (const c of CORREDICAS_MM) if (c * 10 <= profundidade) r = c * 10;
  return r === null ? null : dmm(r);
}

export type CodigoFerragem = 'dobradica_reta' | 'dobradica_curva' | 'dobradica_supercurva' | 'corredica' | 'puxador' | 'suporte_prateleira' | 'minifix' | 'cavilha' | 'parafuso_montagem' | 'parafuso_gaveta' | 'parafuso_corredica' | 'parafuso_frente' | 'parafuso_engrosso';

export interface FerragemNecessaria {
  codigo: CodigoFerragem;
  descricao: string;
  /** Unidades (corrediça: pares). */
  quantidade: number;
  /** Corrediça: comprimento. */
  comprimento?: Dmm;
}

export const DESCRICAO_FERRAGEM: Record<CodigoFerragem, string> = {
  dobradica_reta: 'Dobradiça de copa 35 mm, reta (sobreposição total)',
  dobradica_curva: 'Dobradiça de copa 35 mm, curva (meia-sobreposição)',
  dobradica_supercurva: 'Dobradiça de copa 35 mm, supercurva (embutida)',
  corredica: 'Corrediça telescópica (par)',
  puxador: 'Puxador',
  suporte_prateleira: 'Suporte de prateleira (pino)',
  minifix: 'Minifix (tambor + pino)',
  cavilha: 'Cavilha',
  parafuso_montagem: 'Parafuso de montagem',
  parafuso_gaveta: 'Parafuso de montagem da gaveta',
  parafuso_corredica: 'Parafuso de corrediça',
  parafuso_frente: 'Parafuso de fixação da frente de gaveta',
  parafuso_engrosso: 'Parafuso da borda engrossada',
};

/** Soma ferragens iguais (mesmo código e comprimento). */
export function juntarFerragens(lista: readonly FerragemNecessaria[], multiplicar = 1): FerragemNecessaria[] {
  const m = new Map<string, FerragemNecessaria>();
  for (const f of lista) {
    const k = `${f.codigo}/${f.comprimento ?? ''}`;
    const e = m.get(k);
    if (e) e.quantidade += f.quantidade * multiplicar;
    else m.set(k, { ...f, quantidade: f.quantidade * multiplicar });
  }
  const ordem: CodigoFerragem[] = ['dobradica_reta', 'dobradica_curva', 'dobradica_supercurva', 'corredica', 'puxador', 'suporte_prateleira', 'minifix', 'cavilha', 'parafuso_montagem', 'parafuso_gaveta', 'parafuso_corredica', 'parafuso_frente', 'parafuso_engrosso'];
  return [...m.values()].sort((a, b) => ordem.indexOf(a.codigo) - ordem.indexOf(b.codigo) || (a.comprimento ?? 0) - (b.comprimento ?? 0));
}

/** "2" → "2 portas"; usado nas mensagens. */
export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

