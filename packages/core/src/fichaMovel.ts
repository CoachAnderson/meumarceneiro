/**
 * Monta a ficha do marceneiro virtual a partir do cálculo do móvel.
 *
 * Tudo aqui sai do motor (medidas, peças, ferragens) ou do que a marcenaria
 * digitou (preço, prazo, observações). A IA recebe só esta ficha.
 */
import { DESCRICAO_FERRAGEM, juntarFerragens, type FerragemNecessaria } from './frentes';
import { envelope } from './geometria';
import { LIMITES_FICHA, type FichaMovel } from './marceneiro';
import type { Componente } from './modulo';
import type { MaterialComponente, PapelComponente } from './regra';
import { formatarMm } from './unidades';

export interface EntradaFicha {
  marcenaria: string;
  titulo: string;
  tipo: string;
  componentes: readonly Componente[];
  ferragens: readonly FerragemNecessaria[];
  /** Nome de cada material usado, já com a espessura ("MDF Branco TX 18 mm"). */
  materiais: Partial<Record<MaterialComponente, string>>;
  /** Peças de MDF da lista (todas as unidades). Sem lista: conta as peças de um módulo. */
  totalPecas?: number;
  quantidadeModulos?: number;
  precoCentavos?: number | null;
  prazoDias?: number | null;
  observacoes?: string;
}

const NOME_MATERIAL: Record<MaterialComponente, string> = {
  estrutura: 'estrutura',
  frente: 'portas e frentes',
  fundo: 'fundos',
  gaveta: 'caixas das gavetas',
};

/** Singular e plural de cada parte que vale citar ao cliente. */
const PARTES: [PapelComponente, string, string][] = [
  ['porta', 'porta', 'portas'],
  ['frente_gaveta', 'gaveta', 'gavetas'],
  ['prateleira_regulavel', 'prateleira regulável', 'prateleiras reguláveis'],
  ['prateleira_fixa', 'prateleira fixa', 'prateleiras fixas'],
  ['divisoria', 'divisória', 'divisórias'],
  ['pe', 'pé de MDF', 'pés de MDF'],
  ['saia', 'saia (travessa sob o tampo)', 'saias (travessas sob o tampo)'],
  ['pe_comprado', 'pé comprado pronto', 'pés comprados prontos'],
  ['suporte', 'suporte de parede', 'suportes de parede'],
  ['gabinete_ref', 'gabinete embaixo do tampo (calculado à parte)', 'gabinetes embaixo do tampo (calculados à parte)'],
];

const cortar = (t: string, max: number) => {
  const limpo = t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  return limpo.length > max ? `${limpo.slice(0, max - 1).trimEnd()}…` : limpo;
};
const mm = (dmm: number) => Math.round(dmm) / 10;

export function montarFicha(e: EntradaFicha): FichaMovel {
  const caixa = envelope(e.componentes);
  const cortadas = e.componentes.filter((c) => !c.comprado);
  const modulos = e.quantidadeModulos ?? 1;

  const usados = new Set(cortadas.map((c) => c.material));
  const materiais = (Object.keys(NOME_MATERIAL) as MaterialComponente[])
    .filter((m) => usados.has(m) && e.materiais[m])
    .map((m) => cortar(`${e.materiais[m]} (${NOME_MATERIAL[m]})`, LIMITES_FICHA.item));

  const composicao: string[] = [];
  if (modulos > 1) composicao.push(`${modulos} módulos iguais`);
  for (const [papel, um, varios] of PARTES) {
    const n = e.componentes.filter((c) => c.papel === papel).length;
    if (n > 0) composicao.push(`${n} ${n === 1 ? um : varios}${modulos > 1 ? ' por módulo' : ''}`);
  }
  if (e.componentes.some((c) => c.papel === 'engrosso')) composicao.push('borda engrossada (faixa de MDF embaixo do tampo)');

  const ferragens = juntarFerragens([...e.ferragens], modulos)
    .slice(0, LIMITES_FICHA.ferragens)
    .map((f) => cortar(`${f.quantidade} × ${f.descricao || DESCRICAO_FERRAGEM[f.codigo]}${f.comprimento ? ` ${formatarMm(f.comprimento)} mm` : ''}`, LIMITES_FICHA.item));

  return {
    versao: 1,
    marcenaria: cortar(e.marcenaria.trim() || 'marcenaria', LIMITES_FICHA.texto),
    titulo: cortar(e.titulo.trim(), LIMITES_FICHA.texto),
    tipo: cortar(e.tipo.trim() || 'Móvel', LIMITES_FICHA.texto),
    largura: mm(caixa.dx),
    altura: mm(caixa.dy),
    profundidade: mm(caixa.dz),
    materiais: materiais.slice(0, LIMITES_FICHA.materiais),
    totalPecas: Math.min(e.totalPecas ?? cortadas.length * modulos, LIMITES_FICHA.pecasMax),
    composicao: composicao.slice(0, LIMITES_FICHA.composicao),
    ferragens,
    precoCentavos: e.precoCentavos ?? null,
    prazoDias: e.prazoDias ?? null,
    observacoes: cortar((e.observacoes ?? '').trim(), LIMITES_FICHA.observacoes),
  };
}
