/**
 * Visão Inteligente IA: da foto de um móvel a um projeto do sistema.
 *
 * A IA NÃO calcula nada. Ela só descreve o que vê num formato fechado
 * (quantos vãos, que frente em cada um, medidas estimadas). Essa leitura é
 * validada aqui, campo por campo, e vira entradas do motor; todas as peças e
 * medidas técnicas continuam saindo do motor, como em qualquer projeto.
 *
 * Uma foto não tem escala: as medidas da IA são estimativas e saem marcadas
 * como tal. O usuário confirma com a trena antes de produzir.
 */
import type { LadoDobradica, TipoFrente } from './frentes';
import { dmm, type Dmm } from './unidades';

export const MONTAGENS_VISAO = ['tampo_base_entre_laterais', 'tampo_sobre_laterais', 'base_entre_laterais_travessas'] as const;
export type Confianca = 'alta' | 'media' | 'baixa';

/** Nome da ferramenta que a IA chama para responder. */
export const NOME_FERRAMENTA_VISAO = 'registrar_leitura_do_movel';

/**
 * Formato da resposta da IA (JSON Schema, modo estrito). Só tipos, listas
 * fechadas e campos obrigatórios: os limites numéricos são conferidos em
 * `validarLeitura`, que não confia na IA.
 */
export const FERRAMENTA_VISAO = {
  name: NOME_FERRAMENTA_VISAO,
  description:
    'Registra a leitura de UM móvel de marcenaria (armário, gabinete, roupeiro, estante, balcão, aéreo, cômoda) visto na imagem, como um módulo retangular. ' +
    'Use esta ferramenta sempre que a imagem mostrar um móvel desse tipo, mesmo que parte dele não possa ser representada (liste essas partes em nao_representado). ' +
    'Não use se a imagem não mostrar um móvel de caixa (por exemplo: pessoa, paisagem, cadeira, sofá, mesa sem caixa, documento); nesse caso responda em texto, em uma frase, dizendo o que a imagem mostra. ' +
    'Os vãos são contados da esquerda para a direita, separados por divisórias verticais de altura inteira.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['tipo_de_movel', 'montagem', 'modo_frente', 'largura_mm', 'altura_mm', 'profundidade_mm', 'origem_das_medidas', 'confianca', 'vaos', 'observacoes', 'nao_representado'],
    properties: {
      tipo_de_movel: { type: 'string', description: 'Nome curto do móvel em português, por exemplo "Gabinete de cozinha com 2 portas".' },
      montagem: {
        type: 'string',
        enum: [...MONTAGENS_VISAO],
        description:
          'tampo_base_entre_laterais: laterais inteiras, tampo e base entre elas (armários e roupeiros em geral). tampo_sobre_laterais: tampo por cima, cobrindo as laterais (cômodas, balcões com tampo aparente). base_entre_laterais_travessas: sem tampo, com travessas (gabinete que recebe pia ou bancada de pedra).',
      },
      modo_frente: { type: 'string', enum: ['sobreposta', 'embutida'], description: 'sobreposta: portas e gavetas cobrem a caixa. embutida: ficam dentro do vão, com a caixa aparente em volta.' },
      largura_mm: { type: 'integer', description: 'Largura externa total, em milímetros. Use a medida informada pelo usuário quando houver.' },
      altura_mm: { type: 'integer', description: 'Altura externa total da caixa, em milímetros, sem pés nem rodapé.' },
      profundidade_mm: { type: 'integer', description: 'Profundidade externa, em milímetros.' },
      origem_das_medidas: {
        type: 'string',
        enum: ['informadas', 'parciais', 'estimadas'],
        description: 'informadas: o usuário deu as três medidas. parciais: deu uma ou duas e as outras foram calculadas pela proporção na imagem. estimadas: nenhuma medida foi dada; valores típicos pela aparência.',
      },
      confianca: { type: 'string', enum: ['alta', 'media', 'baixa'], description: 'Confiança na leitura da estrutura (vãos e frentes), não nas medidas.' },
      vaos: {
        type: 'array',
        description: 'Um item por vão, da esquerda para a direita. Móvel sem divisória vertical tem um vão.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['proporcao_largura', 'frente', 'portas', 'lado_dobradicas', 'gavetas', 'prateleiras'],
          properties: {
            proporcao_largura: { type: 'integer', description: 'Largura deste vão em relação aos outros, em partes (por exemplo 1, 1, 2). Vãos iguais: todos 1.' },
            frente: { type: 'string', enum: ['aberto', 'porta', 'gavetas'], description: 'O que fecha o vão. Vão com porta em cima e gaveta embaixo: escolha o que ocupa mais altura e descreva o resto em nao_representado.' },
            portas: { type: 'integer', description: 'Com frente = porta: 1 ou 2. Nos outros casos: 0.' },
            lado_dobradicas: { type: 'string', enum: ['esquerda', 'direita', 'nao_se_aplica'], description: 'Com 1 porta: lado das dobradiças (oposto ao puxador).' },
            gavetas: { type: 'integer', description: 'Com frente = gavetas: quantas, empilhadas. Nos outros casos: 0.' },
            prateleiras: { type: 'integer', description: 'Prateleiras visíveis ou prováveis dentro do vão. Vão com gavetas: 0. Se a porta está fechada, estime pelo tipo de móvel e avise em observacoes.' },
          },
        },
      },
      observacoes: { type: 'array', items: { type: 'string' }, description: 'Frases curtas sobre o que foi suposto ou não deu para ver (até 6).' },
      nao_representado: {
        type: 'array',
        items: { type: 'string' },
        description: 'Partes do móvel que este formato não representa: portas de correr, vidro, nichos de alturas diferentes, pés, rodapé, tamponamento, puxadores especiais, cantos, curvas (até 8).',
      },
    },
  },
} as const;

export const INSTRUCOES_VISAO =
  'Você é um marceneiro experiente lendo a foto de um móvel para um sistema de projeto. ' +
  'Descreva só o que a imagem mostra; quando supuser algo, diga em observacoes. ' +
  'Se houver vários móveis, leia o principal (o maior ou mais central) e avise. ' +
  'Medidas: use as que o usuário informar; para as que faltarem, calcule pela proporção na imagem a partir das informadas; sem nenhuma, use medidas típicas do tipo de móvel e marque como estimadas. ' +
  'Não invente detalhes que não aparecem. Responda em português do Brasil.';

/** Medidas que o usuário já conhece (opcionais), em mm. */
export interface MedidasConhecidas {
  largura?: number;
  altura?: number;
  profundidade?: number;
}

/** Texto do pedido que acompanha a imagem. */
export function pedidoVisao(medidas: MedidasConhecidas, nota?: string): string {
  const partes: string[] = [];
  if (medidas.largura) partes.push(`largura ${medidas.largura} mm`);
  if (medidas.altura) partes.push(`altura ${medidas.altura} mm`);
  if (medidas.profundidade) partes.push(`profundidade ${medidas.profundidade} mm`);
  const m = partes.length ? `Medidas informadas pelo usuário: ${partes.join(', ')}.` : 'O usuário não informou medidas.';
  const n = nota?.trim() ? ` Observação do usuário: "${nota.trim().slice(0, 300)}".` : '';
  return `Leia o móvel desta imagem e registre a leitura. ${m}${n}`;
}

export interface VaoLido {
  proporcao: number;
  frente: TipoFrente;
  portas: 1 | 2;
  lado: LadoDobradica;
  gavetas: number;
  prateleiras: number;
}

export interface LeituraMovel {
  tipo: string;
  montagem: (typeof MONTAGENS_VISAO)[number];
  modoFrente: 'sobreposta' | 'embutida';
  largura: Dmm;
  altura: Dmm;
  profundidade: Dmm;
  origemMedidas: 'informadas' | 'parciais' | 'estimadas';
  confianca: Confianca;
  vaos: VaoLido[];
  observacoes: string[];
  naoRepresentado: string[];
  /** Ajustes que a validação fez na resposta da IA (para mostrar ao usuário). */
  ajustes: string[];
}

export type ResultadoLeitura = { ok: true; leitura: LeituraMovel } | { ok: false; motivo: string };

const LIMITES = { largura: [150, 6000], altura: [150, 3000], profundidade: [100, 1200] } as const;

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const inteiro = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

function textos(v: unknown, maximo: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.replace(/\s+/g, ' ').trim().slice(0, 240))
    .filter((x) => x.length > 0)
    .slice(0, maximo);
}

/**
 * Confere a resposta da IA sem confiar nela. Estrutura errada ou medida
 * absurda: recusa. Incoerência pequena (porta com 3 folhas, prateleira em vão
 * de gaveta): corrige e registra o ajuste, para o usuário ver.
 */
export function validarLeitura(bruto: unknown): ResultadoLeitura {
  if (!ehObjeto(bruto)) return { ok: false, motivo: 'A resposta da IA não veio no formato esperado.' };
  const ajustes: string[] = [];

  const montagem = MONTAGENS_VISAO.find((m) => m === bruto.montagem);
  if (!montagem) return { ok: false, motivo: 'A IA não identificou o tipo de montagem do móvel.' };
  if (bruto.modo_frente !== 'sobreposta' && bruto.modo_frente !== 'embutida') return { ok: false, motivo: 'A IA não identificou o tipo de frente.' };

  const medidas = {} as Record<keyof typeof LIMITES, number>;
  for (const [campo, chave] of [
    ['largura', 'largura_mm'],
    ['altura', 'altura_mm'],
    ['profundidade', 'profundidade_mm'],
  ] as const) {
    const v = bruto[chave];
    const [min, max] = LIMITES[campo];
    if (!inteiro(v) || v < min || v > max) {
      return { ok: false, motivo: `A IA devolveu uma ${campo} fora do possível (${String(v)} mm). Informe as medidas e tente de novo.` };
    }
    medidas[campo] = v;
  }

  if (!Array.isArray(bruto.vaos) || bruto.vaos.length < 1 || bruto.vaos.length > 7) {
    return { ok: false, motivo: 'A IA não conseguiu contar os vãos do móvel (o sistema aceita de 1 a 7).' };
  }
  const vaos: VaoLido[] = [];
  for (const [i, v] of bruto.vaos.entries()) {
    if (!ehObjeto(v)) return { ok: false, motivo: 'A resposta da IA não veio no formato esperado.' };
    const n = i + 1;
    const frente: TipoFrente = v.frente === 'porta' || v.frente === 'gavetas' ? v.frente : 'aberto';
    if (v.frente !== 'porta' && v.frente !== 'gavetas' && v.frente !== 'aberto') ajustes.push(`Vão ${n}: frente não reconhecida; ficou aberto.`);

    let proporcao = inteiro(v.proporcao_largura) ? v.proporcao_largura : 1;
    if (proporcao < 1 || proporcao > 100) {
      proporcao = 1;
      ajustes.push(`Vão ${n}: proporção de largura inválida; tratado como igual aos outros.`);
    }

    let portas: 1 | 2 = 1;
    if (frente === 'porta') {
      if (v.portas === 2) portas = 2;
      else if (v.portas !== 1) ajustes.push(`Vão ${n}: quantidade de portas inválida; ficou 1 porta.`);
    }

    let gavetas = 3;
    if (frente === 'gavetas') {
      if (inteiro(v.gavetas) && v.gavetas >= 1 && v.gavetas <= 8) gavetas = v.gavetas;
      else {
        gavetas = inteiro(v.gavetas) && v.gavetas > 8 ? 8 : 1;
        ajustes.push(`Vão ${n}: quantidade de gavetas inválida; ficou ${gavetas}.`);
      }
    }

    let prateleiras = inteiro(v.prateleiras) && v.prateleiras >= 0 ? v.prateleiras : 0;
    if (prateleiras > 10) {
      prateleiras = 10;
      ajustes.push(`Vão ${n}: prateleiras limitadas a 10.`);
    }
    if (frente === 'gavetas' && prateleiras > 0) {
      prateleiras = 0;
      ajustes.push(`Vão ${n}: vão com gavetas não leva prateleira; prateleiras retiradas.`);
    }

    vaos.push({ proporcao, frente, portas, lado: v.lado_dobradicas === 'direita' ? 'direita' : 'esquerda', gavetas, prateleiras });
  }

  const origem = bruto.origem_das_medidas === 'informadas' || bruto.origem_das_medidas === 'parciais' ? bruto.origem_das_medidas : 'estimadas';
  const confianca: Confianca = bruto.confianca === 'alta' || bruto.confianca === 'media' ? bruto.confianca : 'baixa';
  const tipo = typeof bruto.tipo_de_movel === 'string' && bruto.tipo_de_movel.trim() ? bruto.tipo_de_movel.replace(/\s+/g, ' ').trim().slice(0, 120) : 'Móvel';

  return {
    ok: true,
    leitura: {
      tipo,
      montagem,
      modoFrente: bruto.modo_frente,
      largura: dmm(medidas.largura * 10),
      altura: dmm(medidas.altura * 10),
      profundidade: dmm(medidas.profundidade * 10),
      origemMedidas: origem,
      confianca,
      vaos,
      observacoes: textos(bruto.observacoes, 6),
      naoRepresentado: textos(bruto.nao_representado, 8),
      ajustes,
    },
  };
}

/**
 * Larguras dos vãos (menos o último, que fica com o resto) a partir das
 * proporções lidas. Devolve null quando os vãos são iguais: aí o motor
 * divide sozinho. Inteiro, em décimos de mm.
 */
export function largurasPorProporcao(larguraExterna: Dmm, espessura: Dmm, proporcoes: readonly number[]): Array<Dmm | null> | null {
  const n = proporcoes.length;
  if (n <= 1 || proporcoes.every((p) => p === proporcoes[0])) return null;
  // Largura interna menos as divisórias, na montagem com laterais inteiras.
  const livre = larguraExterna - 2 * espessura - (n - 1) * espessura;
  if (livre <= 0) return null;
  const total = proporcoes.reduce((s, p) => s + p, 0);
  return proporcoes.map((p, i) => (i === n - 1 ? null : dmm(Math.floor((livre * p) / total))));
}
