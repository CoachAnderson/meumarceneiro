/**
 * Medição no local: o que se mede na casa do cliente e o que isso diz sobre o
 * móvel. Parede raramente é reta: a largura muda com a altura (prumo), a
 * altura muda ao longo da parede (piso e teto desnivelados) e o canto pode
 * não ter 90°. Aqui ficam as contas; a tela só pergunta e mostra.
 *
 * Tudo em décimos de mm (Dmm). Medida não informada é null: o sistema nunca
 * inventa uma medida que ninguém tirou.
 */
import type { Problema } from './modulo';
import { dmm, formatarMm, type Dmm } from './unidades';

export type TipoPonto =
  | 'tomada'
  | 'interruptor'
  | 'agua'
  | 'esgoto'
  | 'gas'
  | 'janela'
  | 'porta'
  | 'ar_condicionado'
  | 'viga'
  | 'pilar'
  | 'rodape'
  | 'outro';

export const NOME_PONTO: Record<TipoPonto, string> = {
  tomada: 'Tomada',
  interruptor: 'Interruptor',
  agua: 'Ponto de água',
  esgoto: 'Esgoto',
  gas: 'Gás',
  janela: 'Janela',
  porta: 'Porta',
  ar_condicionado: 'Ar-condicionado',
  viga: 'Viga',
  pilar: 'Pilar',
  rodape: 'Rodapé',
  outro: 'Outro',
};

/** Pontos marcados pelo centro (caixinha, cano). Os outros, pela borda esquerda e de baixo, com largura e altura. */
export const PONTUAIS: ReadonlySet<TipoPonto> = new Set(['tomada', 'interruptor', 'agua', 'esgoto', 'gas']);

export interface PontoParede {
  id: string;
  tipo: TipoPonto;
  /** Da esquerda da parede (pontual: até o centro; os outros: até a borda esquerda). */
  x: Dmm | null;
  /** Do piso (pontual: até o centro; os outros: até a borda de baixo). Rodapé: sempre 0. */
  y: Dmm | null;
  largura: Dmm | null;
  altura: Dmm | null;
  /** Quanto sai da parede (viga, pilar, rodapé, cano aparente). */
  saliencia: Dmm | null;
  observacao: string;
}

/** Esquadro do canto pelo triângulo (o "3-4-5"): uma medida em cada parede, a partir do canto, e a diagonal entre as marcas. */
export interface CantoMedido {
  /** Na parede medida, a partir do canto. */
  naParede: Dmm | null;
  /** Na parede vizinha (do lado), a partir do canto. */
  naVizinha: Dmm | null;
  diagonal: Dmm | null;
}

export interface ParedeMedida {
  id: string;
  nome: string;
  /** Largura de canto a canto, perto do piso, no meio e perto do teto. */
  larguras: { baixo: Dmm | null; meio: Dmm | null; alto: Dmm | null };
  /** Do piso ao teto (ou até onde o móvel pode subir), na esquerda, no meio e na direita. */
  alturas: { esquerda: Dmm | null; meio: Dmm | null; direita: Dmm | null };
  cantoEsquerdo: CantoMedido;
  cantoDireito: CantoMedido;
  pontos: PontoParede[];
  observacao: string;
}

export interface FotoMedicao {
  id: string;
  /** Caminho no armazenamento depois de enviada; null enquanto só está no aparelho. */
  caminho: string | null;
  legenda: string;
  parede: string | null;
  ponto: string | null;
}

export interface DadosMedicao {
  versao: 1;
  /** Ambiente e o que o cliente quer ali. */
  ambiente: string;
  movel: string;
  /** Profundidade livre até a circulação, a porta ou a janela da frente. */
  profundidadeLivre: Dmm | null;
  paredes: ParedeMedida[];
  fotos: FotoMedicao[];
  observacoes: string;
}

export function novaParede(id: string, nome: string): ParedeMedida {
  const canto = (): CantoMedido => ({ naParede: null, naVizinha: null, diagonal: null });
  return {
    id,
    nome,
    larguras: { baixo: null, meio: null, alto: null },
    alturas: { esquerda: null, meio: null, direita: null },
    cantoEsquerdo: canto(),
    cantoDireito: canto(),
    pontos: [],
    observacao: '',
  };
}

export function novaMedicao(idParede: string): DadosMedicao {
  return { versao: 1, ambiente: '', movel: '', profundidadeLivre: null, paredes: [novaParede(idParede, 'Parede A')], fotos: [], observacoes: '' };
}

// ---------------------------------------------------------------------------
// Análise
// ---------------------------------------------------------------------------

export interface OpcoesAnalise {
  /** A partir de quanto uma diferença merece aviso. Padrão: 3 mm. */
  tolerancia?: Dmm;
  /** Folga de instalação de cada lado, entre o móvel e a parede. Padrão: 5 mm. */
  folgaLado?: Dmm;
  /** Folga até o teto. Padrão: 10 mm. */
  folgaTeto?: Dmm;
  /** Profundidade do móvel, para ver quanto o canto abre ou fecha na frente. Padrão: a profundidade livre, se medida. */
  profundidade?: Dmm | null;
}

export const PADRAO_ANALISE = { tolerancia: dmm(30), folgaLado: dmm(50), folgaTeto: dmm(100) } as const;

export interface AnaliseCanto {
  lado: 'esquerdo' | 'direito';
  /** Ângulo do canto, em graus. */
  angulo: number;
  /** Na profundidade do móvel: quanto o vão fica menor (positivo, canto fechado) ou maior (negativo, canto aberto) na frente do que no fundo. */
  diferencaNaFrente: Dmm | null;
}

export interface AnaliseParede {
  parede: string;
  /** A menor largura medida: é o que cabe. */
  larguraUtil: Dmm | null;
  variacaoLargura: Dmm | null;
  alturaUtil: Dmm | null;
  variacaoAltura: Dmm | null;
  cantos: AnaliseCanto[];
  /** Largura que cabe na frente do móvel, descontando os cantos que fecham. */
  larguraNaFrente: Dmm | null;
  /** Maior móvel que cabe, já com as folgas. */
  maximo: { L: Dmm | null; A: Dmm | null; P: Dmm | null };
  erros: Problema[];
  avisos: Problema[];
}

const valores = (o: Record<string, Dmm | null>) => Object.values(o).filter((v): v is Dmm => v !== null);
const mmTexto = (v: number) => formatarMm(dmm(Math.round(v)));
const graus = (rad: number) => (rad * 180) / Math.PI;

/** Ângulo do canto pela lei dos cossenos. null se as medidas não fecham um triângulo. */
export function anguloDoCanto(c: CantoMedido): number | null {
  const { naParede: a, naVizinha: b, diagonal: d } = c;
  if (a === null || b === null || d === null || a <= 0 || b <= 0 || d <= 0) return null;
  if (d >= a + b || a >= b + d || b >= a + d) return null;
  const cos = (a * a + b * b - d * d) / (2 * a * b);
  return graus(Math.acos(Math.max(-1, Math.min(1, cos))));
}

/** Diagonal que daria 90° com estas duas medidas (para mostrar ao medir). */
export function diagonalEsquadro(naParede: Dmm, naVizinha: Dmm): Dmm {
  return dmm(Math.round(Math.hypot(naParede, naVizinha)));
}

export function analisarParede(p: ParedeMedida, profundidadeLivre: Dmm | null, opcoes: OpcoesAnalise = {}): AnaliseParede {
  const tol = opcoes.tolerancia ?? PADRAO_ANALISE.tolerancia;
  const folgaLado = opcoes.folgaLado ?? PADRAO_ANALISE.folgaLado;
  const folgaTeto = opcoes.folgaTeto ?? PADRAO_ANALISE.folgaTeto;
  const prof = opcoes.profundidade ?? profundidadeLivre;
  const erros: Problema[] = [];
  const avisos: Problema[] = [];

  const ls = valores(p.larguras);
  const as = valores(p.alturas);
  const larguraUtil = ls.length ? dmm(Math.min(...ls)) : null;
  const variacaoLargura = ls.length >= 2 ? dmm(Math.max(...ls) - Math.min(...ls)) : null;
  const alturaUtil = as.length ? dmm(Math.min(...as)) : null;
  const variacaoAltura = as.length >= 2 ? dmm(Math.max(...as) - Math.min(...as)) : null;

  if (ls.length === 0) erros.push({ codigo: 'sem_largura', mensagem: `${p.nome}: falta a largura.` });
  else if (ls.length < 3) avisos.push({ codigo: 'largura_incompleta', mensagem: `${p.nome}: meça a largura também ${['baixo', 'meio', 'alto'].filter((k) => p.larguras[k as keyof typeof p.larguras] === null).map((k) => ({ baixo: 'perto do piso', meio: 'no meio', alto: 'perto do teto' })[k]).join(' e ')}, para saber se a parede está no prumo.` });
  if (as.length === 0) avisos.push({ codigo: 'sem_altura', mensagem: `${p.nome}: falta a altura (piso ao teto).` });

  if (variacaoLargura !== null && variacaoLargura > tol) {
    const maior = (['baixo', 'meio', 'alto'] as const).find((k) => p.larguras[k] === Math.max(...ls))!;
    const menor = (['baixo', 'meio', 'alto'] as const).find((k) => p.larguras[k] === larguraUtil)!;
    const onde = { baixo: 'embaixo', meio: 'no meio', alto: 'em cima' };
    avisos.push({
      codigo: 'fora_de_prumo',
      mensagem: `${p.nome}: a largura varia ${mmTexto(variacaoLargura)} mm (${onde[menor]} é mais estreita que ${onde[maior]}). Parede fora de prumo ou ondulada: o móvel é feito pela menor largura e a diferença vira fresta ou acabamento.`,
    });
  }
  if (variacaoAltura !== null && variacaoAltura > tol) {
    avisos.push({
      codigo: 'desnivel',
      mensagem: `${p.nome}: a altura varia ${mmTexto(variacaoAltura)} mm ao longo da parede. Piso ou teto desnivelado: use pés reguláveis ou calço embaixo e deixe a folga do teto pela menor altura.`,
    });
  }

  const cantos: AnaliseCanto[] = [];
  let fechamento = 0;
  for (const [lado, c] of [['esquerdo', p.cantoEsquerdo], ['direito', p.cantoDireito]] as const) {
    const algum = c.naParede !== null || c.naVizinha !== null || c.diagonal !== null;
    if (!algum) continue;
    const ang = anguloDoCanto(c);
    if (ang === null) {
      if (c.naParede !== null && c.naVizinha !== null && c.diagonal !== null) {
        erros.push({ codigo: 'canto_invalido', mensagem: `${p.nome}, canto ${lado}: as três medidas não fecham um triângulo. Confira a diagonal.` });
      } else {
        avisos.push({ codigo: 'canto_incompleto', mensagem: `${p.nome}, canto ${lado}: faltam medidas do esquadro.` });
      }
      continue;
    }
    // Canto fechado (< 90°): a parede vizinha vem para dentro; na frente cabe menos.
    const diferenca = prof !== null && prof !== undefined ? Math.round(prof * Math.tan(((90 - ang) * Math.PI) / 180)) : null;
    cantos.push({ lado, angulo: ang, diferencaNaFrente: diferenca === null ? null : dmm(diferenca) });
    if (diferenca !== null && diferenca > 0) fechamento += diferenca;
    const fora = Math.abs(diferenca ?? 0);
    const desvio = Math.abs(90 - ang);
    if ((diferenca !== null && fora > tol) || (diferenca === null && desvio >= 0.3)) {
      const texto =
        diferenca === null
          ? `${p.nome}: o canto ${lado} tem ${ang.toFixed(1).replace('.', ',')}°. Meça a profundidade livre para saber quanto isso muda na frente do móvel.`
          : diferenca > 0
            ? `${p.nome}: o canto ${lado} está fechado (${ang.toFixed(1).replace('.', ',')}°). Na frente do móvel, a ${mmTexto(prof!)} mm da parede, cabem ${mmTexto(diferenca)} mm a menos que no fundo.`
            : `${p.nome}: o canto ${lado} está aberto (${ang.toFixed(1).replace('.', ',')}°). Na frente do móvel sobra uma fresta de ${mmTexto(-diferenca)} mm: preveja um acabamento (requadro) ou recorte a lateral.`;
      avisos.push({ codigo: 'fora_de_esquadro', mensagem: texto });
    }
  }

  const larguraNaFrente = larguraUtil === null ? null : dmm(larguraUtil - fechamento);
  // O móvel sai em milímetros inteiros, sempre para baixo (para caber).
  const inteiro = (v: number) => dmm(Math.max(0, Math.floor(v / 10) * 10));
  const L = larguraNaFrente === null ? null : inteiro(larguraNaFrente - 2 * folgaLado);
  const A = alturaUtil === null ? null : inteiro(alturaUtil - folgaTeto);

  // Ponto que passa da parede: medida trocada ou de outra parede.
  for (const q of p.pontos) {
    if (q.tipo === 'rodape' || q.x === null || q.y === null) continue;
    const direita = q.x + (PONTUAIS.has(q.tipo) ? 0 : (q.largura ?? 0));
    const topo = q.y + (PONTUAIS.has(q.tipo) ? 0 : (q.altura ?? 0));
    if ((larguraUtil !== null && direita > Math.max(...ls) + tol) || (alturaUtil !== null && topo > Math.max(...as) + tol)) {
      avisos.push({ codigo: 'ponto_fora', mensagem: `${p.nome}: ${NOME_PONTO[q.tipo].toLowerCase()} passa do tamanho da parede. Confira as medidas dele.` });
    }
  }
  const P = prof ?? null;

  return { parede: p.id, larguraUtil, variacaoLargura, alturaUtil, variacaoAltura, cantos, larguraNaFrente, maximo: { L, A, P }, erros, avisos };
}

// ---------------------------------------------------------------------------
// O móvel na parede: o que fica atrás ou no caminho dele
// ---------------------------------------------------------------------------

export interface PosicaoMovel {
  /** Da esquerda da parede até a lateral esquerda do móvel. */
  x: Dmm;
  /** Do piso até a base do móvel (0 no chão; armário aéreo, a altura de instalação). */
  y: Dmm;
  L: Dmm;
  A: Dmm;
  P: Dmm;
}

export interface Interferencia {
  ponto: string;
  tipo: TipoPonto;
  /** Posição no fundo do móvel (pontual: centro; outros: borda esquerda e de baixo), a partir da lateral esquerda e da base. */
  noMovel: { x: Dmm; y: Dmm } | null;
  mensagem: string;
}

/** Retângulo do ponto na parede; null se faltam medidas. */
function retangulo(p: PontoParede, alturaParede: Dmm | null): { x0: number; x1: number; y0: number; y1: number } | null {
  if (p.tipo === 'rodape') {
    if (p.altura === null) return null;
    return { x0: -Infinity, x1: Infinity, y0: 0, y1: p.altura };
  }
  if (p.x === null || p.y === null) return null;
  if (PONTUAIS.has(p.tipo)) return { x0: p.x, x1: p.x, y0: p.y, y1: p.y };
  if (p.largura === null) return null;
  const alto = p.altura ?? (p.tipo === 'pilar' ? alturaParede : null);
  if (alto === null) return null;
  return { x0: p.x, x1: p.x + p.largura, y0: p.y, y1: p.y + alto };
}

/** O que fica atrás do móvel ou invade o espaço dele, com o que fazer. */
export function interferencias(parede: ParedeMedida, movel: PosicaoMovel, alturaParede: Dmm | null = null): Interferencia[] {
  const r: Interferencia[] = [];
  const m = { x0: movel.x, x1: movel.x + movel.L, y0: movel.y, y1: movel.y + movel.A };
  for (const p of parede.pontos) {
    const k = retangulo(p, alturaParede);
    if (!k) continue;
    const pontual = PONTUAIS.has(p.tipo);
    const dentro = pontual ? k.x0 >= m.x0 && k.x0 <= m.x1 && k.y0 >= m.y0 && k.y0 <= m.y1 : k.x0 < m.x1 && k.x1 > m.x0 && k.y0 < m.y1 && k.y1 > m.y0;
    if (!dentro) continue;
    const noMovel = pontual || p.tipo !== 'rodape' ? { x: dmm(Math.max(0, k.x0 - m.x0)), y: dmm(Math.max(0, k.y0 - m.y0)) } : null;
    const onde = noMovel ? ` a ${mmTexto(noMovel.x)} mm da lateral esquerda e ${mmTexto(noMovel.y)} mm da base do móvel` : '';
    const nome = NOME_PONTO[p.tipo];
    let mensagem: string;
    switch (p.tipo) {
      case 'tomada':
      case 'interruptor':
        mensagem = `${nome}${onde} fica atrás do móvel: recorte o fundo nesse ponto ou peça para mudar o ponto antes da instalação.`;
        break;
      case 'agua':
      case 'esgoto':
      case 'gas':
        mensagem = `${nome}${onde} fica atrás do móvel: recorte o fundo (e a base ou prateleira, se passar por ela) e deixe acesso ao registro.`;
        break;
      case 'janela':
      case 'porta':
        mensagem = `${nome} fica na frente do móvel: ele cobre parte da ${p.tipo}. Mude a posição ou a altura do móvel.`;
        break;
      case 'rodape':
        mensagem =
          p.saliencia !== null && p.saliencia > 0
            ? `Rodapé de ${mmTexto(p.altura ?? 0)} mm de altura e ${mmTexto(p.saliencia)} mm de espessura: recorte a parte de trás das laterais e da base nessa medida, ou desconte ${mmTexto(p.saliencia)} mm da profundidade.`
            : `Rodapé de ${mmTexto(p.altura ?? 0)} mm: meça a espessura dele para saber quanto recortar atrás das laterais.`;
        break;
      default:
        mensagem =
          p.saliencia !== null && p.saliencia > 0
            ? `${nome}${onde} entra ${mmTexto(p.saliencia)} mm no espaço do móvel${p.saliencia >= movel.P ? ', mais que a profundidade dele' : ''}: recorte o móvel nesse ponto ou mude a posição.`
            : `${nome}${onde} fica no espaço do móvel: meça quanto ele sai da parede.`;
    }
    r.push({ ponto: p.id, tipo: p.tipo, noMovel, mensagem });
  }
  return r;
}

// ---------------------------------------------------------------------------
// Para a Visão IA e para o projeto
// ---------------------------------------------------------------------------

/** Observação curta (até 300 caracteres) que vai junto com a foto para a Visão IA. */
export function notaParaVisao(d: DadosMedicao, parede: ParedeMedida, a: AnaliseParede): string {
  const partes: string[] = [];
  if (d.movel.trim()) partes.push(d.movel.trim());
  if (a.larguraUtil !== null) partes.push(`parede de ${mmTexto(a.larguraUtil)} mm${a.variacaoLargura ? ` (varia ${mmTexto(a.variacaoLargura)} mm)` : ''}`);
  if (a.alturaUtil !== null) partes.push(`altura livre ${mmTexto(a.alturaUtil)} mm`);
  if (d.profundidadeLivre !== null) partes.push(`profundidade livre ${mmTexto(d.profundidadeLivre)} mm`);
  const contagem = new Map<TipoPonto, number>();
  for (const p of parede.pontos) contagem.set(p.tipo, (contagem.get(p.tipo) ?? 0) + 1);
  if (contagem.size) partes.push([...contagem].map(([t, n]) => `${n} ${NOME_PONTO[t].toLowerCase()}`).join(', ') + ' na parede');
  let texto = partes.join('; ');
  if (texto.length > 300) texto = `${texto.slice(0, 297)}...`;
  return texto;
}

/** Medida numa parede para texto: "2.430" ou "–". */
export const textoMedida = (v: Dmm | null) => (v === null ? '–' : formatarMm(v));
