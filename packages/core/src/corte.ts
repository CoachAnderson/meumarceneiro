/**
 * Plano de corte guilhotinado.
 *
 * Guilhotina: todo corte atravessa a chapa (ou o pedaço já cortado) de ponta
 * a ponta, como na seccionadora. O otimizador é heurístico (o problema é
 * NP-difícil): roda várias estratégias determinísticas e fica com a melhor.
 * Todo plano devolvido passa por `verificarPlano`, que não confia no
 * otimizador e confere peça por peça; se a verificação falhar, o otimizador
 * lança erro em vez de devolver um plano errado.
 *
 * Coordenadas na chapa: x ao longo do comprimento da chapa, y ao longo da
 * largura; origem num canto. Tudo em décimos de mm, inteiro.
 */
import type { Bordas } from './pecas';
import { area, dividir, dmm, formatarMm, type Dmm, type Dmm2 } from './unidades';

export type VeioChapa = 'sem_veio' | 'comprimento' | 'largura';

// ---------------------------------------------------------------------------
// Medida de corte (desconto da fita)
// ---------------------------------------------------------------------------

export interface OpcoesMedidaCorte {
  /** Espessura da fita, em centésimos de mm (0,45 mm = 45). */
  espessuraFitaCmm: number;
  /** Sobremedida por borda com fita, para a coladeira refilar (centésimos de mm). Padrão 0. */
  sobremedidaCmm?: number;
}

export interface MedidaCorte {
  comprimento: Dmm;
  largura: Dmm;
  /** Quanto a medida de corte ficou acima da conta exata, por causa do arredondamento para cima (em cmm, 0 a 9 por medida). */
  arredondamentoCmm: { comprimento: number; largura: number };
}

/**
 * Medida que vai para a serra: acabada − fita + sobremedida, nas bordas com
 * fita. A fita das bordas `frente`/`tras` reduz a largura; a das pontas, o
 * comprimento. Arredonda para cima (0,1 mm): peça um pouco maior pode ser
 * ajustada; menor é perdida.
 */
export function medidaDeCorte(peca: { comprimento: Dmm; largura: Dmm; bordas: Bordas }, opcoes: OpcoesMedidaCorte): MedidaCorte {
  const esp = opcoes.espessuraFitaCmm;
  const sobre = opcoes.sobremedidaCmm ?? 0;
  if (!Number.isSafeInteger(esp) || esp < 0 || esp > 1000) throw new ErroCorte('Espessura de fita inválida (0 a 10 mm).');
  if (!Number.isSafeInteger(sobre) || sobre < 0 || sobre > 500) throw new ErroCorte('Sobremedida de fita inválida (0 a 5 mm).');
  const b = peca.bordas;
  const nComp = (b.ext1 ? 1 : 0) + (b.ext2 ? 1 : 0);
  const nLarg = (b.frente ? 1 : 0) + (b.tras ? 1 : 0);
  const exatoComp = peca.comprimento * 10 - nComp * (esp - sobre);
  const exatoLarg = peca.largura * 10 - nLarg * (esp - sobre);
  const comprimento = dividir(dmm(exatoComp), 10, 'cima');
  const largura = dividir(dmm(exatoLarg), 10, 'cima');
  if (comprimento <= 0 || largura <= 0) throw new ErroCorte('A fita é mais grossa que a peça.');
  return {
    comprimento,
    largura,
    arredondamentoCmm: { comprimento: comprimento * 10 - exatoComp, largura: largura * 10 - exatoLarg },
  };
}

// ---------------------------------------------------------------------------
// Entrada e saída do otimizador
// ---------------------------------------------------------------------------

export interface PecaCorte {
  /** Identificador do item (por exemplo, o código P01). */
  id: string;
  nome: string;
  /** Medidas de corte. `comprimento` acompanha o veio da peça. */
  comprimento: Dmm;
  largura: Dmm;
  quantidade: number;
  /** A peça precisa seguir o veio da chapa (não pode girar à vontade). */
  veio: boolean;
}

export interface ChapaDisponivel {
  id: string;
  tipo: 'chapa' | 'retalho';
  nome: string;
  comprimento: Dmm;
  largura: Dmm;
  /** Quantas há. null = sem limite (chapa comprada conforme a necessidade). */
  quantidade: number | null;
}

export interface ParametrosCorte {
  /** Largura do corte da serra. */
  serra: Dmm;
  /** Faixa retirada em cada borda da chapa inteira (esquadrejamento). */
  refilo: Dmm;
  /** Faixa retirada em cada borda de um retalho. */
  refiloRetalho: Dmm;
  /** Menor sobra que vale guardar como retalho (as duas medidas). */
  sobraMinima: { comprimento: Dmm; largura: Dmm };
  /** Direção do veio da chapa. */
  veio: VeioChapa;
}

export interface PecaPosicionada {
  pecaId: string;
  /** Qual unidade da peça (0 … quantidade − 1). */
  unidade: number;
  x: Dmm;
  y: Dmm;
  /** Tamanho ocupado na chapa (eixo x, eixo y). */
  dx: Dmm;
  dy: Dmm;
  /** true = comprimento da peça ao longo da largura da chapa. */
  girada: boolean;
}

export interface Retangulo2D {
  x: Dmm;
  y: Dmm;
  dx: Dmm;
  dy: Dmm;
}

export interface LinhaCorte {
  x1: Dmm;
  y1: Dmm;
  x2: Dmm;
  y2: Dmm;
}

export interface ChapaCortada {
  chapaId: string;
  tipo: 'chapa' | 'retalho';
  nome: string;
  comprimento: Dmm;
  largura: Dmm;
  refilo: Dmm;
  pecas: PecaPosicionada[];
  /** Espaços livres no fim (disjuntos). */
  sobras: Retangulo2D[];
  /** Sobras com tamanho de retalho aproveitável. */
  retalhos: Retangulo2D[];
  cortes: LinhaCorte[];
  areaPecas: Dmm2;
  /** Área das peças / área da chapa, em décimos de % (inteiro, para baixo). */
  aproveitamentoMil: number;
}

export interface PlanoCorte {
  chapas: ChapaCortada[];
  /** Chapas e retalhos usados, por id de chapa disponível. */
  usoPorChapa: Array<{ chapaId: string; nome: string; tipo: 'chapa' | 'retalho'; quantidade: number }>;
  areaPecas: Dmm2;
  areaChapas: Dmm2;
  areaRetalhosAproveitaveis: Dmm2;
  /** (área das chapas − peças − retalhos aproveitáveis) / área das chapas, em décimos de %. */
  perdaMil: number;
  totalCortes: number;
  comprimentoCortes: Dmm;
  /** Menor número possível de chapas inteiras só pela área (limite inferior honesto). */
  minimoTeoricoChapas: number;
  /** Estratégia que venceu (para depuração e reprodutibilidade). */
  estrategia: string;
}

export class ErroCorte extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroCorte';
  }
}

// ---------------------------------------------------------------------------
// Orientação
// ---------------------------------------------------------------------------

/** Orientações permitidas: [dx, dy, girada]. */
export function orientacoes(peca: Pick<PecaCorte, 'comprimento' | 'largura' | 'veio'>, veioChapa: VeioChapa): Array<[Dmm, Dmm, boolean]> {
  const normal: [Dmm, Dmm, boolean] = [peca.comprimento, peca.largura, false];
  const girada: [Dmm, Dmm, boolean] = [peca.largura, peca.comprimento, true];
  if (!peca.veio || veioChapa === 'sem_veio') {
    return peca.comprimento === peca.largura ? [normal] : [normal, girada];
  }
  return veioChapa === 'comprimento' ? [normal] : [girada];
}

// ---------------------------------------------------------------------------
// Validação de entrada
// ---------------------------------------------------------------------------

const LIMITE_UNIDADES = 5000;

function validar(pecas: readonly PecaCorte[], chapas: readonly ChapaDisponivel[], p: ParametrosCorte): void {
  const inteiro = (v: number, min: number, max: number) => Number.isSafeInteger(v) && v >= min && v <= max;
  if (!inteiro(p.serra, 0, 200)) throw new ErroCorte('Largura da serra inválida (0 a 20 mm).');
  if (!inteiro(p.refilo, 0, 1000) || !inteiro(p.refiloRetalho, 0, 1000)) throw new ErroCorte('Refilo inválido (0 a 100 mm).');
  if (!inteiro(p.sobraMinima.comprimento, 0, 60000) || !inteiro(p.sobraMinima.largura, 0, 60000)) throw new ErroCorte('Sobra mínima inválida.');
  if (chapas.length === 0) throw new ErroCorte('Nenhuma chapa disponível para o material.');
  const ids = new Set<string>();
  for (const c of chapas) {
    if (ids.has(c.id)) throw new ErroCorte(`Chapa repetida: ${c.id}.`);
    ids.add(c.id);
    if (!inteiro(c.comprimento, 1, 100000) || !inteiro(c.largura, 1, 100000)) throw new ErroCorte(`Medidas inválidas na chapa ${c.nome}.`);
    if (c.quantidade !== null && !inteiro(c.quantidade, 0, 100000)) throw new ErroCorte(`Quantidade inválida na chapa ${c.nome}.`);
  }
  let unidades = 0;
  const idsPecas = new Set<string>();
  for (const pc of pecas) {
    if (idsPecas.has(pc.id)) throw new ErroCorte(`Peça repetida: ${pc.id}.`);
    idsPecas.add(pc.id);
    if (!inteiro(pc.comprimento, 1, 100000) || !inteiro(pc.largura, 1, 100000)) throw new ErroCorte(`Medidas inválidas na peça ${pc.nome}.`);
    if (!inteiro(pc.quantidade, 1, LIMITE_UNIDADES)) throw new ErroCorte(`Quantidade inválida na peça ${pc.nome}.`);
    unidades += pc.quantidade;
  }
  if (unidades > LIMITE_UNIDADES) throw new ErroCorte(`São ${unidades} peças; o limite por plano é ${LIMITE_UNIDADES}.`);
}

// ---------------------------------------------------------------------------
// Empacotamento guilhotina (retângulos livres disjuntos)
// ---------------------------------------------------------------------------

type Ordem = 'area' | 'lado' | 'perimetro' | 'largura';
type Encaixe = 'area' | 'ladoCurto';
type Divisao = 'eixoCurto' | 'eixoLongo' | 'maiorSobra';
/** Preferência de orientação: livre (a de melhor encaixe), ou sempre a normal/girada quando couber. */
type Giro = 'livre' | 'normal' | 'girada';

interface Unidade {
  peca: PecaCorte;
  unidade: number;
  opcoes: Array<[Dmm, Dmm, boolean]>;
}

interface ChapaAberta {
  fonte: ChapaDisponivel;
  refilo: number;
  livres: Retangulo2D[];
  pecas: PecaPosicionada[];
  cortes: LinhaCorte[];
}

function ret(x: number, y: number, dx: number, dy: number): Retangulo2D {
  return { x: dmm(x), y: dmm(y), dx: dmm(dx), dy: dmm(dy) };
}

function abrir(fonte: ChapaDisponivel, p: ParametrosCorte): ChapaAberta {
  const r = fonte.tipo === 'chapa' ? p.refilo : p.refiloRetalho;
  const cortes: LinhaCorte[] = [];
  if (r > 0) {
    // Esquadrejamento: um corte em cada borda.
    const C = fonte.comprimento;
    const L = fonte.largura;
    cortes.push(
      { x1: dmm(0), y1: dmm(r), x2: dmm(C), y2: dmm(r) },
      { x1: dmm(0), y1: dmm(L - r), x2: dmm(C), y2: dmm(L - r) },
      { x1: dmm(r), y1: dmm(r), x2: dmm(r), y2: dmm(L - r) },
      { x1: dmm(C - r), y1: dmm(r), x2: dmm(C - r), y2: dmm(L - r) },
    );
  }
  const livres = fonte.comprimento - 2 * r > 0 && fonte.largura - 2 * r > 0 ? [ret(r, r, fonte.comprimento - 2 * r, fonte.largura - 2 * r)] : [];
  return { fonte, refilo: r, livres, pecas: [], cortes };
}

function pontuar(livre: Retangulo2D, dx: number, dy: number, encaixe: Encaixe): number {
  if (encaixe === 'area') return livre.dx * livre.dy - dx * dy;
  return Math.min(livre.dx - dx, livre.dy - dy);
}

/** Coloca a peça no canto do retângulo livre e divide o resto com dois cortes retos. */
function colocar(ch: ChapaAberta, i: number, u: Unidade, dx: number, dy: number, girada: boolean, divisao: Divisao, serra: number): void {
  const f = ch.livres[i]!;
  ch.livres.splice(i, 1);
  ch.pecas.push({ pecaId: u.peca.id, unidade: u.unidade, x: f.x, y: f.y, dx: dmm(dx), dy: dmm(dy), girada });

  const sobraX = f.dx - dx - serra; // largura da faixa à direita
  const sobraY = f.dy - dy - serra; // altura da faixa acima
  let horizontalPrimeiro: boolean;
  switch (divisao) {
    case 'eixoCurto':
      horizontalPrimeiro = f.dx - dx < f.dy - dy;
      break;
    case 'eixoLongo':
      horizontalPrimeiro = f.dx - dx >= f.dy - dy;
      break;
    case 'maiorSobra':
      // Deixa inteira a maior faixa possível.
      horizontalPrimeiro = f.dx * Math.max(0, sobraY) >= f.dy * Math.max(0, sobraX);
      break;
  }

  const temX = f.dx > dx; // há material à direita da peça
  const temY = f.dy > dy; // há material acima da peça
  if (horizontalPrimeiro) {
    // 1º corte atravessa o retângulo inteiro na horizontal; 2º separa a peça da faixa à direita.
    if (temY) ch.cortes.push({ x1: f.x, y1: dmm(f.y + dy), x2: dmm(f.x + f.dx), y2: dmm(f.y + dy) });
    if (temX) ch.cortes.push({ x1: dmm(f.x + dx), y1: f.y, x2: dmm(f.x + dx), y2: dmm(f.y + dy) });
    if (sobraY > 0) ch.livres.push(ret(f.x, f.y + dy + serra, f.dx, sobraY));
    if (sobraX > 0) ch.livres.push(ret(f.x + dx + serra, f.y, sobraX, dy));
  } else {
    if (temX) ch.cortes.push({ x1: dmm(f.x + dx), y1: f.y, x2: dmm(f.x + dx), y2: dmm(f.y + f.dy) });
    if (temY) ch.cortes.push({ x1: f.x, y1: dmm(f.y + dy), x2: dmm(f.x + dx), y2: dmm(f.y + dy) });
    if (sobraX > 0) ch.livres.push(ret(f.x + dx + serra, f.y, sobraX, f.dy));
    if (sobraY > 0) ch.livres.push(ret(f.x, f.y + dy + serra, dx, sobraY));
  }
}

function ordenar(unidades: Unidade[], ordem: Ordem): Unidade[] {
  const chave = (u: Unidade): number[] => {
    const c = u.peca.comprimento;
    const l = u.peca.largura;
    switch (ordem) {
      case 'area':
        return [c * l, Math.max(c, l)];
      case 'lado':
        return [Math.max(c, l), Math.min(c, l)];
      case 'perimetro':
        return [c + l, Math.max(c, l)];
      case 'largura':
        return [Math.min(c, l), Math.max(c, l)];
    }
  };
  return unidades
    .map((u, i) => ({ u, i, k: chave(u) }))
    .sort((a, b) => b.k[0]! - a.k[0]! || b.k[1]! - a.k[1]! || a.u.peca.id.localeCompare(b.u.peca.id) || a.u.unidade - b.u.unidade || a.i - b.i)
    .map((x) => x.u);
}

interface Execucao {
  chapas: ChapaAberta[];
  estrategia: string;
}

function cabeEmAlguma(u: Unidade, fonte: ChapaDisponivel, p: ParametrosCorte): boolean {
  const r = fonte.tipo === 'chapa' ? p.refilo : p.refiloRetalho;
  return u.opcoes.some(([dx, dy]) => dx <= fonte.comprimento - 2 * r && dy <= fonte.largura - 2 * r);
}

function executar(
  unidades: Unidade[],
  retalhos: ChapaDisponivel[],
  chapa: ChapaDisponivel,
  p: ParametrosCorte,
  ordem: Ordem,
  encaixe: Encaixe,
  divisao: Divisao,
  giro: Giro,
): Execucao | null {
  const abertas: ChapaAberta[] = [];
  const restantes = new Map(retalhos.map((r) => [r.id, r.quantidade ?? 0]));
  let chapasInteiras = chapa.quantidade;

  for (const u of ordenar(unidades, ordem)) {
    // Melhor encaixe entre todas as chapas já abertas.
    let melhor: { ch: ChapaAberta; i: number; dx: number; dy: number; girada: boolean; nota: number } | null = null;
    for (const ch of abertas) {
      ch.livres.forEach((f, i) => {
        for (const [dx, dy, girada] of u.opcoes) {
          if (dx > f.dx || dy > f.dy) continue;
          // Com preferência, a orientação preferida ganha sempre que couber em algum lugar.
          const penalidade = giro === 'livre' || u.opcoes.length === 1 || girada === (giro === 'girada') ? 0 : 1e15;
          const nota = pontuar(f, dx, dy, encaixe) + penalidade;
          if (!melhor || nota < melhor.nota) melhor = { ch, i, dx, dy, girada, nota };
        }
      });
    }
    if (!melhor) {
      // Abre outra: primeiro o menor retalho em que a peça cabe; senão, chapa inteira.
      const retalho = retalhos
        .filter((r) => (restantes.get(r.id) ?? 0) > 0 && cabeEmAlguma(u, r, p))
        .sort((a, b) => a.comprimento * a.largura - b.comprimento * b.largura || a.id.localeCompare(b.id))[0];
      let fonte: ChapaDisponivel | undefined;
      if (retalho) {
        restantes.set(retalho.id, (restantes.get(retalho.id) ?? 0) - 1);
        fonte = retalho;
      } else if (cabeEmAlguma(u, chapa, p) && (chapasInteiras === null || chapasInteiras > 0)) {
        if (chapasInteiras !== null) chapasInteiras--;
        fonte = chapa;
      }
      if (!fonte) return null;
      const nova = abrir(fonte, p);
      abertas.push(nova);
      const opcoesNova = giro === 'girada' ? [...u.opcoes].reverse() : u.opcoes;
      for (const [dx, dy, girada] of opcoesNova) {
        const f = nova.livres[0];
        if (f && dx <= f.dx && dy <= f.dy) {
          melhor = { ch: nova, i: 0, dx, dy, girada, nota: 0 };
          break;
        }
      }
      if (!melhor) return null;
    }
    const m = melhor as { ch: ChapaAberta; i: number; dx: number; dy: number; girada: boolean };
    colocar(m.ch, m.i, u, m.dx, m.dy, m.girada, divisao, p.serra);
  }
  return { chapas: abertas, estrategia: `${chapa.nome}/${ordem}/${encaixe}/${divisao}/${giro}` };
}

/** Comparação: menos área de chapa inteira comprada; depois mais área de retalho aproveitável; depois menos cortes. */
function avaliar(e: Execucao, p: ParametrosCorte): number[] {
  let areaInteiras = 0;
  let areaRetalhosUsados = 0;
  let aproveitavel = 0;
  let cortes = 0;
  for (const ch of e.chapas) {
    const a = ch.fonte.comprimento * ch.fonte.largura;
    if (ch.fonte.tipo === 'chapa') areaInteiras += a;
    else areaRetalhosUsados += a;
    for (const s of ch.livres) if (ehAproveitavel(s, p)) aproveitavel += s.dx * s.dy;
    cortes += ch.cortes.length;
  }
  return [areaInteiras, areaRetalhosUsados, -aproveitavel, cortes];
}

function menor(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
}

export function ehAproveitavel(s: { dx: number; dy: number }, p: Pick<ParametrosCorte, 'sobraMinima'>): boolean {
  const { comprimento: c, largura: l } = p.sobraMinima;
  return (s.dx >= c && s.dy >= l) || (s.dx >= l && s.dy >= c);
}

export interface ResultadoOtimizacao {
  plano: PlanoCorte | null;
  /** Peças que não cabem em nenhuma chapa nem retalho, com o motivo. */
  naoCabem: Array<{ pecaId: string; nome: string; motivo: string }>;
  /** Faltou chapa (estoque limitado) para colocar tudo. */
  faltouChapa: boolean;
}

const ORDENS: Ordem[] = ['area', 'lado', 'perimetro', 'largura'];
const ENCAIXES: Encaixe[] = ['area', 'ladoCurto'];
const DIVISOES: Divisao[] = ['maiorSobra', 'eixoCurto', 'eixoLongo'];
const GIROS: Giro[] = ['livre', 'normal', 'girada'];

/**
 * Gera o plano de corte de um material. Testa cada formato de chapa inteira
 * (com os retalhos disponíveis antes) e cada combinação de estratégia;
 * devolve o melhor plano, já verificado.
 */
export function otimizarCorte(pecas: readonly PecaCorte[], chapas: readonly ChapaDisponivel[], p: ParametrosCorte): ResultadoOtimizacao {
  validar(pecas, chapas, p);

  const inteiras = chapas.filter((c) => c.tipo === 'chapa');
  const retalhos = chapas.filter((c) => c.tipo === 'retalho' && (c.quantidade ?? 0) > 0);
  const unidades: Unidade[] = [];
  for (const pc of pecas) {
    const opcoes = orientacoes(pc, p.veio);
    for (let k = 0; k < pc.quantidade; k++) unidades.push({ peca: pc, unidade: k, opcoes });
  }

  // Peça que não cabe em nada não tem como entrar no plano.
  const naoCabem: ResultadoOtimizacao['naoCabem'] = [];
  for (const pc of pecas) {
    const u: Unidade = { peca: pc, unidade: 0, opcoes: orientacoes(pc, p.veio) };
    if (!chapas.some((c) => cabeEmAlguma(u, c, p))) {
      naoCabem.push({
        pecaId: pc.id,
        nome: pc.nome,
        motivo: `${formatarMm(pc.comprimento)} × ${formatarMm(pc.largura)} mm não cabe em nenhuma chapa, descontado o refilo${pc.veio && p.veio !== 'sem_veio' ? ' e respeitando o veio' : ''}.`,
      });
    }
  }
  if (naoCabem.length > 0) return { plano: null, naoCabem, faltouChapa: false };
  if (unidades.length === 0) return { plano: null, naoCabem, faltouChapa: false };

  let melhor: { e: Execucao; nota: number[] } | null = null;
  const fontes = inteiras.length > 0 ? inteiras : [{ id: '__nenhuma', tipo: 'chapa' as const, nome: 'sem chapa', comprimento: dmm(1), largura: dmm(1), quantidade: 0 }];
  for (const chapa of fontes) {
    for (const ordem of ORDENS) {
      for (const encaixe of ENCAIXES) {
        for (const divisao of DIVISOES) {
          for (const giro of GIROS) {
            const e = executar(unidades, retalhos, chapa, p, ordem, encaixe, divisao, giro);
            if (!e) continue;
            const nota = avaliar(e, p);
            if (!melhor || menor(nota, melhor.nota)) melhor = { e, nota };
          }
        }
      }
    }
  }
  if (!melhor) return { plano: null, naoCabem, faltouChapa: true };

  const plano = montarPlano(melhor.e, pecas, p);
  const problemas = verificarPlano(plano, pecas, chapas, p);
  if (problemas.length > 0) {
    // Nunca devolve plano que não passou na verificação.
    throw new ErroCorte(`Plano gerado não passou na verificação: ${problemas.slice(0, 3).join(' ')}`);
  }
  return { plano, naoCabem, faltouChapa: false };
}

function montarPlano(e: Execucao, pecas: readonly PecaCorte[], p: ParametrosCorte): PlanoCorte {
  const chapas: ChapaCortada[] = e.chapas.map((ch) => {
    const areaPecas = ch.pecas.reduce((s, x) => s + x.dx * x.dy, 0);
    const areaChapa = ch.fonte.comprimento * ch.fonte.largura;
    const sobras = [...ch.livres].sort((a, b) => a.x - b.x || a.y - b.y);
    return {
      chapaId: ch.fonte.id,
      tipo: ch.fonte.tipo,
      nome: ch.fonte.nome,
      comprimento: ch.fonte.comprimento,
      largura: ch.fonte.largura,
      refilo: dmm(ch.refilo),
      pecas: ch.pecas,
      sobras,
      retalhos: sobras.filter((s) => ehAproveitavel(s, p)),
      cortes: ch.cortes,
      areaPecas: areaPecas as Dmm2,
      aproveitamentoMil: Math.floor((areaPecas * 1000) / areaChapa),
    };
  });
  // Chapas inteiras primeiro, depois retalhos; mais cheias antes.
  chapas.sort((a, b) => (a.tipo === b.tipo ? b.aproveitamentoMil - a.aproveitamentoMil : a.tipo === 'chapa' ? -1 : 1));

  const uso = new Map<string, { chapaId: string; nome: string; tipo: 'chapa' | 'retalho'; quantidade: number }>();
  for (const c of chapas) {
    const u = uso.get(c.chapaId) ?? { chapaId: c.chapaId, nome: c.nome, tipo: c.tipo, quantidade: 0 };
    u.quantidade++;
    uso.set(c.chapaId, u);
  }

  const areaPecas = pecas.reduce((s, pc) => s + area(pc.comprimento, pc.largura) * pc.quantidade, 0);
  const areaChapas = chapas.reduce((s, c) => s + c.comprimento * c.largura, 0);
  const areaRetalhos = chapas.reduce((s, c) => s + c.retalhos.reduce((t, r) => t + r.dx * r.dy, 0), 0);
  const comprimentoCortes = chapas.reduce((s, c) => s + c.cortes.reduce((t, l) => t + Math.abs(l.x2 - l.x1) + Math.abs(l.y2 - l.y1), 0), 0);

  // Limite inferior: área das peças que não coube nos retalhos usados, sobre a área útil de uma chapa inteira.
  const inteira = chapas.find((c) => c.tipo === 'chapa');
  let minimo = 0;
  if (inteira) {
    const util = (inteira.comprimento - 2 * p.refilo) * (inteira.largura - 2 * p.refilo);
    const emRetalhos = chapas.filter((c) => c.tipo === 'retalho').reduce((s, c) => s + (c.comprimento - 2 * p.refiloRetalho) * (c.largura - 2 * p.refiloRetalho), 0);
    minimo = Math.max(1, Math.ceil(Math.max(0, areaPecas - emRetalhos) / util));
  }

  return {
    chapas,
    usoPorChapa: [...uso.values()],
    areaPecas: areaPecas as Dmm2,
    areaChapas: areaChapas as Dmm2,
    areaRetalhosAproveitaveis: areaRetalhos as Dmm2,
    perdaMil: areaChapas === 0 ? 0 : Math.floor(((areaChapas - areaPecas - areaRetalhos) * 1000) / areaChapas),
    totalCortes: chapas.reduce((s, c) => s + c.cortes.length, 0),
    comprimentoCortes: dmm(comprimentoCortes),
    minimoTeoricoChapas: minimo,
    estrategia: e.estrategia,
  };
}

// ---------------------------------------------------------------------------
// Verificação independente
// ---------------------------------------------------------------------------

/** Os retângulos podem ser separados só com cortes de guilhotina de largura `serra`? */
export function ehGuilhotina(rets: readonly Retangulo2D[], serra: number): boolean {
  if (rets.length <= 1) return true;
  for (const eixo of ['x', 'y'] as const) {
    const d = eixo === 'x' ? 'dx' : 'dy';
    const ord = [...rets].sort((a, b) => a[eixo] - b[eixo]);
    let fimPrefixo = -Infinity;
    for (let i = 1; i < ord.length; i++) {
      fimPrefixo = Math.max(fimPrefixo, ord[i - 1]![eixo] + ord[i - 1]![d]);
      if (fimPrefixo + serra <= ord[i]![eixo]) {
        return ehGuilhotina(ord.slice(0, i), serra) && ehGuilhotina(ord.slice(i), serra);
      }
    }
  }
  return false;
}

/**
 * Confere o plano sem confiar em quem o fez: cada unidade de peça aparece uma
 * vez, com a medida certa e orientação permitida; tudo dentro da área útil;
 * nada se sobrepõe; os cortes são de guilhotina com a largura da serra; as
 * chapas usadas existem e não passam da quantidade disponível; os totais batem.
 * Devolve a lista de problemas (vazia = plano correto).
 */
export function verificarPlano(plano: PlanoCorte, pecas: readonly PecaCorte[], chapas: readonly ChapaDisponivel[], p: ParametrosCorte): string[] {
  const problemas: string[] = [];
  const porId = new Map(pecas.map((x) => [x.id, x]));
  const vistas = new Set<string>();
  const usadas = new Map<string, number>();

  for (const [n, ch] of plano.chapas.entries()) {
    const rotulo = `Chapa ${n + 1}`;
    const fonte = chapas.find((c) => c.id === ch.chapaId);
    if (!fonte) {
      problemas.push(`${rotulo}: chapa desconhecida.`);
      continue;
    }
    if (fonte.comprimento !== ch.comprimento || fonte.largura !== ch.largura || fonte.tipo !== ch.tipo) problemas.push(`${rotulo}: medidas não batem com a chapa.`);
    usadas.set(fonte.id, (usadas.get(fonte.id) ?? 0) + 1);
    const r = fonte.tipo === 'chapa' ? p.refilo : p.refiloRetalho;
    if (ch.refilo !== r) problemas.push(`${rotulo}: refilo diferente do pedido.`);

    for (const pp of ch.pecas) {
      const pc = porId.get(pp.pecaId);
      const nome = pc ? `${pc.nome} #${pp.unidade + 1}` : pp.pecaId;
      if (!pc) {
        problemas.push(`${rotulo}: peça desconhecida ${pp.pecaId}.`);
        continue;
      }
      const chave = `${pp.pecaId}#${pp.unidade}`;
      if (vistas.has(chave)) problemas.push(`${nome} aparece mais de uma vez.`);
      vistas.add(chave);
      if (!Number.isSafeInteger(pp.unidade) || pp.unidade < 0 || pp.unidade >= pc.quantidade) problemas.push(`${nome}: unidade inexistente.`);
      const ok = orientacoes(pc, p.veio).some(([dx, dy, g]) => dx === pp.dx && dy === pp.dy && g === pp.girada);
      if (!ok) problemas.push(`${nome}: medida ou orientação errada (veio).`);
      if (pp.x < r || pp.y < r || pp.x + pp.dx > ch.comprimento - r || pp.y + pp.dy > ch.largura - r) problemas.push(`${nome}: fora da área útil da chapa.`);
    }

    // Sobreposição e guilhotina (a guilhotina com folga = serra já impede sobreposição).
    if (!ehGuilhotina(ch.pecas, p.serra)) problemas.push(`${rotulo}: as peças não saem só com cortes de ponta a ponta, ou ficam a menos de uma serra umas das outras.`);

    // Sobras: dentro da área útil, sem tocar peças.
    for (const s of ch.sobras) {
      if (s.dx <= 0 || s.dy <= 0 || s.x < r || s.y < r || s.x + s.dx > ch.comprimento - r || s.y + s.dy > ch.largura - r) problemas.push(`${rotulo}: sobra fora da chapa.`);
      for (const pp of ch.pecas) {
        if (s.x < pp.x + pp.dx && pp.x < s.x + s.dx && s.y < pp.y + pp.dy && pp.y < s.y + s.dy) problemas.push(`${rotulo}: sobra em cima de peça.`);
      }
    }
    const areaPecas = ch.pecas.reduce((s, x) => s + x.dx * x.dy, 0);
    if (areaPecas !== ch.areaPecas) problemas.push(`${rotulo}: área de peças não bate.`);
  }

  for (const pc of pecas) {
    for (let k = 0; k < pc.quantidade; k++) if (!vistas.has(`${pc.id}#${k}`)) problemas.push(`${pc.nome} #${k + 1} ficou fora do plano.`);
  }
  for (const [id, n] of usadas) {
    const q = chapas.find((c) => c.id === id)?.quantidade;
    if (q !== null && q !== undefined && n > q) problemas.push(`Usou ${n} unidades de uma chapa que só tem ${q}.`);
  }
  const total = pecas.reduce((s, pc) => s + pc.comprimento * pc.largura * pc.quantidade, 0);
  if (total !== plano.areaPecas) problemas.push('Área total das peças não bate.');
  const totalChapas = plano.chapas.reduce((s, c) => s + c.comprimento * c.largura, 0);
  if (totalChapas !== plano.areaChapas) problemas.push('Área total das chapas não bate.');
  return problemas;
}
