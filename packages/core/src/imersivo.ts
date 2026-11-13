/**
 * Ver em óculos: a cena do móvel para óculos de realidade virtual e mista
 * (Meta Quest, Galaxy XR, Vision Pro) e para óculos de encaixar o celular.
 *
 * Além das peças (iguais às do "ver no ambiente"), a cena diz o que se mexe:
 * cada porta gira na linha das dobradiças e cada gaveta corre para a frente
 * com a caixa dela. Opcionalmente leva o cômodo medido na casa do cliente
 * (uma parede, os cantos e os pontos marcados), para o cliente "entrar" no
 * ambiente já planejado.
 *
 * Coordenadas em metros, como no "ver no ambiente": o móvel no chão (y = 0),
 * centrado na largura, costas em z = 0 e a frente para z positivo.
 *
 * A cena vai para um arquivo público (o mesmo link do "ver no ambiente"). Ela
 * leva só geometria: nenhum nome de cliente, de ambiente, observação ou foto.
 */
import { modeloParaAmbiente } from './ambiente';
import { envelope } from './geometria';
import { analisarParede, anguloDoCanto, PONTUAIS, type DadosMedicao, type TipoPonto } from './medicao';
import type { Componente, Problema } from './modulo';
import type { MaterialComponente, PapelComponente } from './regra';
import { dmm, formatarMm, type Dmm } from './unidades';

export interface PecaImersiva {
  id: string;
  papel: PapelComponente;
  material: MaterialComponente;
  /** Centro e tamanho em metros. */
  centro: [number, number, number];
  tamanho: [number, number, number];
}

export type MovimentoImersivo =
  | {
      tipo: 'porta';
      pecas: string[];
      /** Eixo das dobradiças (vertical), em x e z. */
      pivo: [number, number];
      /** +1: gira no sentido anti-horário visto de cima (dobradiça à direita); −1: dobradiça à esquerda. */
      sentido: 1 | -1;
      /** Abertura, em graus. */
      angulo: number;
    }
  | {
      tipo: 'gaveta';
      pecas: string[];
      /** Quanto a gaveta sai, em metros. */
      curso: number;
    };

export interface PontoComodo {
  tipo: TipoPonto;
  /** Pontual (tomada, cano): x e y são o centro e o tamanho é 0. Os outros: borda esquerda e de baixo. Metros. */
  x: number;
  y: number;
  largura: number;
  altura: number;
  saliencia: number;
}

export interface ComodoImersivo {
  /** A parede onde o móvel encosta, em metros. */
  largura: number;
  /** Altura medida (a menor); null se não foi medida. */
  altura: number | null;
  /** Ângulo de cada canto, em graus; null se o esquadro não foi medido. */
  anguloEsquerdo: number | null;
  anguloDireito: number | null;
  /** Profundidade livre medida até a circulação; null se não foi medida. */
  profundidade: number | null;
  /** Do canto esquerdo até a lateral esquerda do móvel. */
  posicaoMovel: number;
  pontos: PontoComodo[];
}

export interface CenaImersiva {
  versao: 1;
  /** Largura, altura e profundidade do móvel, em metros. */
  dimensoes: [number, number, number];
  pecas: PecaImersiva[];
  movimentos: MovimentoImersivo[];
  comodo: ComodoImersivo | null;
}

/** Décimos de mm → metros. */
const m = (v: number) => v / 10_000;

const PECAS_DA_GAVETA: ReadonlySet<PapelComponente> = new Set(['lateral_gaveta', 'contrafrente_gaveta', 'traseira_gaveta', 'fundo_gaveta']);
export const ABERTURA_PORTA = 95;

/** Lado das dobradiças pela posição das copas na porta (v mede a largura, a partir da esquerda). */
function ladoDasDobradicas(c: Componente): 'esquerda' | 'direita' {
  const copas = (c.furos ?? []).filter((f) => f.finalidade === 'dobradica').flatMap((f) => f.centros);
  if (copas.length === 0) return 'esquerda';
  const media = copas.reduce((s, p) => s + p.v, 0) / copas.length;
  return media > c.caixa.dx / 2 ? 'direita' : 'esquerda';
}

/** Distância de um valor até um intervalo (0 se está dentro). */
const fora = (v: number, a: number, b: number) => (v < a ? a - v : v > b ? v - b : 0);

/** O que se mexe no móvel: portas e gavetas (com a caixa de cada uma). */
export function movimentosDoMovel(componentes: readonly Componente[]): MovimentoImersivo[] {
  if (componentes.length === 0) return [];
  const env = envelope(componentes);
  const meioX = env.x + env.dx / 2;
  const fundo = env.z + env.dz;
  const movimentos: MovimentoImersivo[] = [];

  for (const c of componentes) {
    if (c.papel !== 'porta') continue;
    const k = c.caixa;
    const lado = ladoDasDobradicas(c);
    const x = lado === 'esquerda' ? k.x : k.x + k.dx;
    // Gira na face de trás da porta (a que encosta na caixa).
    movimentos.push({ tipo: 'porta', pecas: [c.id], pivo: [m(x - meioX), m(fundo - (k.z + k.dz))], sentido: lado === 'esquerda' ? -1 : 1, angulo: ABERTURA_PORTA });
  }

  const frentes = componentes.filter((c) => c.papel === 'frente_gaveta');
  const grupos = new Map<string, string[]>(frentes.map((f) => [f.id, [f.id]]));
  const profundidade = new Map<string, number>();
  // 1º as laterais da caixa (altas, ficam bem dentro da altura da frente); depois o resto
  // da caixa vai para o grupo cujas laterais estão mais perto (o fundo da gaveta fica
  // um pouco abaixo das laterais e às vezes abaixo da própria frente).
  const faixa = new Map<string, { x0: number; x1: number; y0: number; y1: number }>();
  const maisPerto = <T>(lista: readonly T[], cx: number, cy: number, area: (t: T) => { x0: number; x1: number; y0: number; y1: number }): T | null => {
    let melhor: T | null = null;
    let menor = Infinity;
    for (const t of lista) {
      const a = area(t);
      if (fora(cx, a.x0, a.x1) > 0) continue;
      const d = fora(cy, a.y0, a.y1);
      if (d < menor) {
        menor = d;
        melhor = t;
      }
    }
    return melhor;
  };
  const areaDaFrente = (f: Componente) => ({ x0: f.caixa.x, x1: f.caixa.x + f.caixa.dx, y0: f.caixa.y, y1: f.caixa.y + f.caixa.dy });
  const centro = (c: Componente) => [c.caixa.x + c.caixa.dx / 2, c.caixa.y + c.caixa.dy / 2] as const;
  for (const c of componentes) {
    if (c.papel !== 'lateral_gaveta') continue;
    const f = maisPerto(frentes, ...centro(c), areaDaFrente);
    if (!f) continue;
    grupos.get(f.id)!.push(c.id);
    profundidade.set(f.id, Math.max(profundidade.get(f.id) ?? 0, c.caixa.dz));
    const k = c.caixa;
    const a = faixa.get(f.id);
    faixa.set(f.id, a ? { x0: Math.min(a.x0, k.x), x1: Math.max(a.x1, k.x + k.dx), y0: Math.min(a.y0, k.y), y1: Math.max(a.y1, k.y + k.dy) } : { x0: k.x, x1: k.x + k.dx, y0: k.y, y1: k.y + k.dy });
  }
  for (const c of componentes) {
    if (!PECAS_DA_GAVETA.has(c.papel) || c.papel === 'lateral_gaveta') continue;
    const f = maisPerto(frentes, ...centro(c), (fr) => faixa.get(fr.id) ?? areaDaFrente(fr));
    if (f) grupos.get(f.id)!.push(c.id);
  }
  for (const f of frentes) {
    // A corrediça telescópica abre quase toda; 80% deixa a caixa à vista sem parecer solta.
    const caixa = profundidade.get(f.id) ?? Math.round(env.dz * 0.6);
    movimentos.push({ tipo: 'gaveta', pecas: grupos.get(f.id)!, curso: Math.round(m(caixa) * 0.8 * 1000) / 1000 });
  }
  return movimentos;
}

export interface EntradaComodo {
  medicao: DadosMedicao;
  paredeId: string;
  /** Do canto esquerdo da parede até a lateral esquerda do móvel; null = centralizado. */
  posicao: Dmm | null;
}

/**
 * O cômodo a partir da medição: a parede escolhida, os cantos e os pontos.
 * Só usa o que foi medido; sem a largura da parede não dá para montar.
 */
export function comodoDaMedicao(e: EntradaComodo, larguraMovel: Dmm): { comodo: ComodoImersivo | null; erros: Problema[]; avisos: Problema[] } {
  const parede = e.medicao.paredes.find((p) => p.id === e.paredeId);
  if (!parede) return { comodo: null, erros: [{ codigo: 'sem_parede', mensagem: 'Escolha a parede onde o móvel vai ficar.' }], avisos: [] };
  const a = analisarParede(parede, e.medicao.profundidadeLivre);
  const largura = a.larguraUtil;
  if (largura === null) return { comodo: null, erros: [{ codigo: 'sem_largura', mensagem: `${parede.nome}: falta a largura da parede na medição.` }], avisos: [] };
  const avisos: Problema[] = [];
  const posicao = e.posicao ?? dmm(Math.max(0, Math.round((largura - larguraMovel) / 2)));
  if (posicao < 0) return { comodo: null, erros: [{ codigo: 'posicao', mensagem: 'A distância do canto não pode ser negativa.' }], avisos };
  if (posicao + larguraMovel > largura) {
    avisos.push({ codigo: 'nao_cabe', mensagem: `O móvel (${formatarMm(larguraMovel)} mm) passa da parede (${formatarMm(largura)} mm) nesta posição. Nos óculos ele vai aparecer entrando na parede.` });
  }
  const pontos: PontoComodo[] = [];
  for (const q of parede.pontos) {
    if (q.tipo !== 'rodape' && (q.x === null || q.y === null)) continue;
    const pontual = PONTUAIS.has(q.tipo);
    pontos.push({
      tipo: q.tipo,
      x: q.tipo === 'rodape' ? 0 : m(q.x!),
      y: q.tipo === 'rodape' ? 0 : m(q.y!),
      largura: pontual ? 0 : q.tipo === 'rodape' ? m(largura) : m(q.largura ?? 0),
      altura: pontual ? 0 : m(q.altura ?? 0),
      saliencia: m(q.saliencia ?? 0),
    });
  }
  const angulo = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
  return {
    comodo: {
      largura: m(largura),
      altura: a.alturaUtil === null ? null : m(a.alturaUtil),
      anguloEsquerdo: angulo(anguloDoCanto(parede.cantoEsquerdo)),
      anguloDireito: angulo(anguloDoCanto(parede.cantoDireito)),
      profundidade: e.medicao.profundidadeLivre === null ? null : m(e.medicao.profundidadeLivre),
      posicaoMovel: m(posicao),
      pontos,
    },
    erros: [],
    avisos,
  };
}

/** Monta a cena completa do móvel (e do cômodo, se houver). */
export function cenaImersiva(componentes: readonly Componente[], comodo: ComodoImersivo | null = null): CenaImersiva {
  const modelo = modeloParaAmbiente(componentes);
  const material = new Map(componentes.map((c) => [c.id, c.material]));
  return {
    versao: 1,
    dimensoes: modelo.dimensoes,
    pecas: modelo.caixas.map((c) => ({ id: c.id, papel: c.papel, material: material.get(c.id)!, centro: c.centro, tamanho: c.tamanho })),
    movimentos: movimentosDoMovel(componentes),
    comodo,
  };
}

// ---------------------------------------------------------------------------
// Leitura do arquivo publicado (vem da internet: confere tudo)
// ---------------------------------------------------------------------------

const PAPEIS: ReadonlySet<string> = new Set<PapelComponente>([
  'lateral', 'tampo', 'base', 'travessa', 'fundo', 'divisoria', 'prateleira_fixa', 'prateleira_regulavel', 'porta', 'frente_gaveta',
  'lateral_gaveta', 'contrafrente_gaveta', 'traseira_gaveta', 'fundo_gaveta', 'pe', 'saia', 'engrosso', 'pe_comprado', 'suporte', 'gabinete_ref',
]);
const MATERIAIS: ReadonlySet<string> = new Set<MaterialComponente>(['estrutura', 'fundo', 'frente', 'gaveta']);
const TIPOS_PONTO: ReadonlySet<string> = new Set<TipoPonto>(['tomada', 'interruptor', 'agua', 'esgoto', 'gas', 'janela', 'porta', 'ar_condicionado', 'viga', 'pilar', 'rodape', 'outro']);
const LIMITE_PECAS = 3000;
/** Nenhuma medida de móvel ou cômodo passa de 30 m. */
const LIMITE_M = 30;

const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, min = -LIMITE_M, max = LIMITE_M): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const tripla = (v: unknown, min = -LIMITE_M): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every((x) => num(x, min));
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 80;
const numOuNulo = (v: unknown, min = 0, max = LIMITE_M) => v === null || num(v, min, max);

/** Confere a cena lida de um arquivo; null se não for uma cena válida. */
export function lerCenaImersiva(dado: unknown): CenaImersiva | null {
  if (!obj(dado) || dado.versao !== 1 || !tripla(dado.dimensoes, 0) || !Array.isArray(dado.pecas) || !Array.isArray(dado.movimentos)) return null;
  if (dado.pecas.length === 0 || dado.pecas.length > LIMITE_PECAS || dado.movimentos.length > LIMITE_PECAS) return null;
  const pecas: PecaImersiva[] = [];
  const ids = new Set<string>();
  for (const p of dado.pecas) {
    if (!obj(p) || !id(p.id) || ids.has(p.id) || typeof p.papel !== 'string' || !PAPEIS.has(p.papel) || typeof p.material !== 'string' || !MATERIAIS.has(p.material)) return null;
    if (!tripla(p.centro) || !tripla(p.tamanho, 0)) return null;
    ids.add(p.id);
    pecas.push({ id: p.id, papel: p.papel as PapelComponente, material: p.material as MaterialComponente, centro: p.centro, tamanho: p.tamanho });
  }
  const movimentos: MovimentoImersivo[] = [];
  for (const v of dado.movimentos) {
    if (!obj(v) || !Array.isArray(v.pecas) || v.pecas.length === 0 || !v.pecas.every((x) => typeof x === 'string' && ids.has(x))) return null;
    const lista = v.pecas as string[];
    if (v.tipo === 'porta') {
      if (!Array.isArray(v.pivo) || v.pivo.length !== 2 || !v.pivo.every((x) => num(x)) || (v.sentido !== 1 && v.sentido !== -1) || !num(v.angulo, 0, 180)) return null;
      movimentos.push({ tipo: 'porta', pecas: lista, pivo: [v.pivo[0] as number, v.pivo[1] as number], sentido: v.sentido, angulo: v.angulo });
    } else if (v.tipo === 'gaveta') {
      if (!num(v.curso, 0, 3)) return null;
      movimentos.push({ tipo: 'gaveta', pecas: lista, curso: v.curso });
    } else return null;
  }
  let comodo: ComodoImersivo | null = null;
  if (dado.comodo !== null && dado.comodo !== undefined) {
    const c = dado.comodo;
    if (!obj(c) || !num(c.largura, 0.1) || !numOuNulo(c.altura, 0.1) || !numOuNulo(c.anguloEsquerdo, 1, 179) || !numOuNulo(c.anguloDireito, 1, 179) || !numOuNulo(c.profundidade, 0) || !num(c.posicaoMovel, 0)) return null;
    if (!Array.isArray(c.pontos) || c.pontos.length > 200) return null;
    const pontos: PontoComodo[] = [];
    for (const q of c.pontos) {
      if (!obj(q) || typeof q.tipo !== 'string' || !TIPOS_PONTO.has(q.tipo) || !num(q.x, 0) || !num(q.y, 0) || !num(q.largura, 0) || !num(q.altura, 0) || !num(q.saliencia, 0, 5)) return null;
      pontos.push({ tipo: q.tipo as TipoPonto, x: q.x, y: q.y, largura: q.largura, altura: q.altura, saliencia: q.saliencia });
    }
    comodo = {
      largura: c.largura,
      altura: c.altura as number | null,
      anguloEsquerdo: c.anguloEsquerdo as number | null,
      anguloDireito: c.anguloDireito as number | null,
      profundidade: c.profundidade as number | null,
      posicaoMovel: c.posicaoMovel,
      pontos,
    };
  }
  return { versao: 1, dimensoes: dado.dimensoes, pecas, movimentos, comodo };
}
