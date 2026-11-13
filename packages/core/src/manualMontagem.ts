/**
 * Manual de montagem gerado do próprio projeto: a ordem em que as peças
 * entram, as junções de cada passo (com os pontos de minifix, cavilha e
 * parafuso) e as ferragens que cada passo usa.
 *
 * Nada aqui é inventado: as peças, a furação e as junções vêm do cálculo
 * (calcularModulo ou calcularMesa). O manual só decide a ordem e escreve o
 * texto. A soma das ferragens dos passos é exatamente a lista do móvel.
 */
import { DESCRICAO_FERRAGEM, juntarFerragens, type CodigoFerragem, type FerragemNecessaria, type FinalidadeFuro, type Furo } from './frentes';
import type { Juncao } from './furacao';
import { orientacaoDaPeca, type Eixo } from './geometria';
import type { Componente, ResultadoModulo } from './modulo';
import type { ItemLista } from './pecas';
import type { PapelComponente } from './regra';

export type PontoMovel = Record<Eixo, number>;

/** O que a marca no 3D mostra. */
export type TipoMarca =
  | 'minifix'
  | 'cavilha'
  | 'parafuso'
  | 'dobradica'
  | 'corredica'
  | 'suporte_prateleira'
  | 'puxador'
  | 'fixacao';

export interface MarcaMontagem {
  tipo: TipoMarca;
  /** Em coordenadas do móvel (décimos de mm). */
  ponto: PontoMovel;
}

export interface PecaNoPasso {
  id: string;
  /** Nome comum às peças de mesmo código ("Lateral de gaveta"). */
  nome: string;
  /** Código da lista de peças (P01…); null para item comprado ou de referência. */
  codigo: string | null;
}

export interface PassoMontagem {
  numero: number;
  titulo: string;
  instrucoes: string[];
  /** Peças que entram neste passo. */
  novas: PecaNoPasso[];
  /** Ids de todas as peças já no lugar ao fim do passo (inclui as novas). */
  montadas: string[];
  juncoes: Juncao[];
  ferragens: FerragemNecessaria[];
  marcas: MarcaMontagem[];
}

export interface ManualMontagem {
  /** Conferência antes de começar. */
  antes: string[];
  pecas: PecaNoPasso[];
  /** Total do móvel (igual a resultado.ferragens). */
  ferragens: FerragemNecessaria[];
  passos: PassoMontagem[];
}

/** Código da lista de peças de cada componente. */
export function codigosDasPecas(itens: readonly ItemLista[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const item of itens) for (const id of item.ids) if (!m.has(id)) m.set(id, item.codigo);
  return m;
}

const TAM: Record<Eixo, 'dx' | 'dy' | 'dz'> = { x: 'dx', y: 'dy', z: 'dz' };

/** Centros de um furo da peça em coordenadas do móvel, na superfície furada (furo de topo: no meio da espessura). */
export function furoNoMovel(c: Componente, f: Furo): PontoMovel[] {
  const o = orientacaoDaPeca(c);
  if (!o) return [];
  const [ec, el, ee] = o;
  const k = c.caixa;
  return f.centros.map((p) => {
    const g: PontoMovel = { x: 0, y: 0, z: 0 };
    g[ec] = k[ec] + p.u;
    g[el] = k[el] + p.v;
    g[ee] = f.topo ? k[ee] + Math.floor(c.espessura / 2) : f.face.endsWith('+') ? k[ee] + k[TAM[ee]] : k[ee];
    return g;
  });
}

const JUNCAO: ReadonlySet<CodigoFerragem> = new Set(['minifix', 'cavilha', 'parafuso_montagem', 'parafuso_gaveta']);

/** Ferragens de uma junção, contadas pelos pontos (o mesmo que o cálculo conta). */
function ferragensDaJuncao(j: Juncao): FerragemNecessaria[] {
  const n = j.pontos.length;
  const gaveta = j.a.startsWith('gaveta_');
  const f = (codigo: CodigoFerragem, quantidade: number): FerragemNecessaria => ({ codigo, descricao: DESCRICAO_FERRAGEM[codigo], quantidade });
  if (j.tipo === 'minifix') return [f('minifix', n), ...(j.cavilhas?.length ? [f('cavilha', j.cavilhas.length)] : [])];
  if (j.tipo === 'cavilha') return [f('cavilha', n)];
  if (j.tipo === 'parafuso') return [f(gaveta ? 'parafuso_gaveta' : 'parafuso_montagem', n)];
  return [];
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function textoFerragensJuncao(j: Juncao): string {
  const n = j.pontos.length;
  if (j.tipo === 'minifix') {
    const c = j.cavilhas?.length ?? 0;
    return `${n} minifix${c ? ` e ${plural(c, 'cavilha', 'cavilhas')}` : ''}`;
  }
  if (j.tipo === 'cavilha') return plural(n, 'cavilha', 'cavilhas');
  if (j.tipo === 'parafuso') return plural(n, 'parafuso', 'parafusos');
  return '';
}

const DICA: Record<'minifix' | 'cavilha' | 'parafuso', string> = {
  minifix:
    'Minifix: rosqueie os pinos nos furos da face da peça que recebe; ponha o tambor no furo grande da outra peça, encaixe as duas e gire o tambor no sentido horário até travar. Não aperte demais.',
  cavilha: 'Cavilha: um pouco de cola no furo, cavilha batida até o fundo; encaixe a outra peça e bata com martelo de borracha.',
  parafuso: 'Parafuso: entra pelo furo passante, de fora para dentro, até o furo-guia no topo da outra peça. Aperte sem espanar.',
};

/** Fase de cada ferragem que não é de junção: em que passo ela entra. */
const FASE_DA_FERRAGEM: Partial<Record<CodigoFerragem, Fase>> = {
  dobradica_reta: 'portas',
  dobradica_curva: 'portas',
  dobradica_supercurva: 'portas',
  puxador: 'puxadores',
  suporte_prateleira: 'regulaveis',
  corredica: 'corredicas',
  parafuso_corredica: 'corredicas',
  parafuso_frente: 'frentes_gaveta',
  parafuso_engrosso: 'engrosso',
  pe_mesa: 'pes',
  parafuso_pe: 'pes',
  sapata_niveladora: 'pes',
  mao_francesa: 'suportes',
  cantoneira: 'suportes',
  suporte_invisivel: 'suportes',
  parafuso_suporte: 'assentar',
  parafuso_tampo: 'assentar',
};

type Fase =
  | 'estrutura'
  | 'fundo'
  | 'regulaveis'
  | 'gavetas'
  | 'corredicas'
  | 'frentes_gaveta'
  | 'portas'
  | 'puxadores'
  | 'engrosso'
  | 'pes'
  | 'suportes'
  | 'assentar'
  | 'ajustes'
  | 'outras';

/** Furos que viram marca no 3D em cada fase. */
const MARCAS_DA_FASE: Partial<Record<Fase, Partial<Record<FinalidadeFuro, TipoMarca>>>> = {
  portas: { dobradica: 'dobradica', calco_dobradica: 'dobradica' },
  corredicas: { corredica: 'corredica' },
  frentes_gaveta: { fixacao_frente: 'fixacao' },
  puxadores: { puxador: 'puxador' },
  engrosso: { engrosso: 'fixacao' },
  pes: { fixacao_pe: 'fixacao', sapata: 'fixacao' },
  assentar: { suporte: 'fixacao', fixacao_tampo: 'fixacao' },
};

const UM_PARAFUSO_DOIS_FUROS: ReadonlySet<FinalidadeFuro> = new Set(['fixacao_frente', 'engrosso']);

interface Rascunho {
  fase: Fase;
  titulo: string;
  instrucoes: string[];
  ids: string[];
  /** Só os furos destas peças viram marca (padrão: de qualquer peça). */
  marcasEm?: string[];
}

const ESTRUTURA_ARMARIO: ReadonlySet<PapelComponente> = new Set(['base', 'tampo', 'travessa']);
const CAIXA_GAVETA: ReadonlySet<PapelComponente> = new Set(['lateral_gaveta', 'contrafrente_gaveta', 'traseira_gaveta', 'fundo_gaveta']);

const sobrepoe = (a: Componente, b: Componente) =>
  (['x', 'y', 'z'] as const).every((e) => a.caixa[e] < b.caixa[e] + b.caixa[TAM[e]] && b.caixa[e] < a.caixa[e] + a.caixa[TAM[e]]);

const lista = (nomes: string[]) => (nomes.length <= 1 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`);

/**
 * Gera o manual de um móvel calculado. `codigos` liga o id de cada peça ao
 * código da lista (codigosDasPecas). Devolve null se o cálculo tem erros.
 */
export function gerarManual(r: ResultadoModulo, codigos: ReadonlyMap<string, string> = new Map()): ManualMontagem | null {
  if (!r.valido) return null;
  const porId = new Map(r.componentes.map((c) => [c.id, c]));
  // Peças iguais têm o mesmo código: o nome comum a todas ("Lateral de gaveta 1 (vão 2)" e
  // "Lateral de gaveta 2 (vão 2)" viram "Lateral de gaveta").
  const nomesDoCodigo = new Map<string, string[]>();
  for (const c of r.componentes) {
    const cod = codigos.get(c.id);
    if (cod) nomesDoCodigo.set(cod, [...(nomesDoCodigo.get(cod) ?? []), c.nome]);
  }
  const nomeComum = (todos: string[]) => {
    const palavras = todos.map((n) => n.split(' '));
    const comuns: string[] = [];
    for (let i = 0; palavras.every((p) => p[i] !== undefined && p[i] === palavras[0]![i]); i++) comuns.push(palavras[0]![i]!);
    // Sem parêntese aberto ou vírgula no fim ("Prateleira fixa (vão" vira "Prateleira fixa").
    const aberto = () => (comuns.join(' ').match(/\(/g)?.length ?? 0) > (comuns.join(' ').match(/\)/g)?.length ?? 0);
    while (comuns.length && (aberto() || /[,(]$/.test(comuns.at(-1)!))) comuns.pop();
    return comuns.length ? comuns.join(' ').replace(/,$/, '') : todos[0]!;
  };
  /** Peças com o mesmo código levam o nome comum a todas. */
  const peca = (c: Componente): PecaNoPasso => {
    const codigo = codigos.get(c.id) ?? null;
    return { id: c.id, nome: codigo ? nomeComum(nomesDoCodigo.get(codigo) ?? [c.nome]) : c.nome, codigo };
  };
  const rot = (id: string) => {
    const c = porId.get(id);
    if (!c) return id;
    const cod = codigos.get(id);
    return cod ? `${nomeComum(nomesDoCodigo.get(cod) ?? [c.nome])} (${cod})` : c.nome;
  };
  const de = (...papeis: PapelComponente[]) => r.componentes.filter((c) => papeis.includes(c.papel));
  const ids = (cs: Componente[]) => cs.map((c) => c.id);
  const nomes = (cs: Componente[]) => {
    // "Prateleira fixa (P05)" uma vez só, com a quantidade.
    // Itens comprados (sem código): agrupados pelo papel ("3× Mão-francesa").
    const grupos = new Map<string, Componente[]>();
    for (const c of cs) {
      const chave = codigos.has(c.id) || !c.comprado ? rot(c.id) : `papel:${c.papel}`;
      grupos.set(chave, [...(grupos.get(chave) ?? []), c]);
    }
    return [...grupos].map(([chave, g]) => {
      const t = chave.startsWith('papel:') ? (g.length > 1 ? nomeComum(g.map((c) => c.nome)) : g[0]!.nome) : chave;
      return g.length > 1 ? `${g.length}× ${t}` : t;
    });
  };
  const tem = (codigo: CodigoFerragem) => r.ferragens.some((f) => f.codigo === codigo);

  const rascunhos: Rascunho[] = [];
  const laterais = de('lateral').sort((a, b) => a.caixa.x - b.caixa.x);

  if (laterais.length > 0) {
    // ---- Armário: deitado sobre a lateral esquerda, fecha com a direita.
    const primeira = laterais[0]!;
    const ultima = laterais.length > 1 ? laterais.at(-1)! : null;
    rascunhos.push({
      fase: 'estrutura',
      titulo: `Comece pela ${primeira.nome.toLowerCase()}`,
      instrucoes: [`Deite a ${rot(primeira.id)} no chão forrado (papelão ou manta), com a face furada para cima e a frente virada para você.`],
      ids: [primeira.id],
    });
    const meio = laterais.slice(1, ultima ? -1 : undefined);
    const caixa = [...de(...ESTRUTURA_ARMARIO)].sort((a, b) => a.caixa.y - b.caixa.y || a.caixa.z - b.caixa.z);
    if (caixa.length) {
      rascunhos.push({
        fase: 'estrutura',
        titulo: lista(caixa.map((c) => c.nome.toLowerCase())).replace(/^./, (l) => l.toUpperCase()),
        instrucoes: [`Encaixe na ${primeira.nome.toLowerCase()}: ${lista(nomes(caixa))}. Deixe a frente das peças alinhada com a frente da lateral.`],
        ids: ids(caixa),
      });
    }
    const divisorias = [...de('divisoria'), ...meio].sort((a, b) => a.caixa.x - b.caixa.x);
    if (divisorias.length) {
      rascunhos.push({
        fase: 'estrutura',
        titulo: divisorias.length > 1 ? 'Divisórias' : 'Divisória',
        instrucoes: [`Encaixe ${lista(nomes(divisorias))} entre a base e o tampo, da esquerda para a direita.`],
        ids: ids(divisorias),
      });
    }
    const fixas = de('prateleira_fixa').sort((a, b) => a.caixa.x - b.caixa.x || a.caixa.y - b.caixa.y);
    if (fixas.length) {
      rascunhos.push({
        fase: 'estrutura',
        titulo: fixas.length > 1 ? 'Prateleiras fixas' : 'Prateleira fixa',
        instrucoes: [`Encaixe ${lista(nomes(fixas))}. Elas também travam a caixa: confira se ficam na horizontal.`],
        ids: ids(fixas),
      });
    }
    const fundos = de('fundo');
    const emCanal = fundos.filter((f) => r.componentes.some((c) => c.id !== f.id && c.papel !== 'fundo' && !CAIXA_GAVETA.has(c.papel) && sobrepoe(f, c)));
    if (emCanal.length) {
      rascunhos.push({
        fase: 'fundo',
        titulo: 'Fundo nos canais',
        instrucoes: [`Antes de fechar, deslize ${lista(nomes(emCanal))} pelos canais da base, do tampo e da lateral, com a face boa para dentro do móvel.`],
        ids: ids(emCanal),
      });
    }
    if (ultima) {
      rascunhos.push({
        fase: 'estrutura',
        titulo: `Feche com a ${ultima.nome.toLowerCase()}`,
        instrucoes: [`Ponha a ${rot(ultima.id)} por cima, encaixando todas as peças de uma vez (comece pelos cantos).`],
        ids: [ultima.id],
      });
    }
    const restoEstrutura = de('pe', 'saia');
    if (restoEstrutura.length) {
      rascunhos.push({
        fase: 'estrutura',
        titulo: 'Pés e saia',
        instrucoes: [`Com o móvel deitado de costas, fixe ${lista(nomes(restoEstrutura))}.`],
        ids: ids(restoEstrutura),
      });
    }
    const atras = fundos.filter((f) => !emCanal.includes(f));
    if (atras.length) {
      rascunhos.push({
        fase: 'fundo',
        titulo: 'Esquadro e fundo',
        instrucoes: [
          'Deite o móvel de frente para o chão. Meça as duas diagonais da caixa: precisam dar a mesma medida. Se não der, empurre o canto da diagonal maior até igualar.',
          `Com o esquadro certo, fixe ${lista(nomes(atras))} com pregos ou grampos, começando por um canto. O fundo trava o esquadro.`,
        ],
        ids: ids(atras),
      });
    } else if (emCanal.length) {
      rascunhos.push({
        fase: 'ajustes',
        titulo: 'Confira o esquadro',
        instrucoes: ['Ponha o móvel em pé. Meça as duas diagonais da frente: precisam dar a mesma medida. Ajuste antes de seguir.'],
        ids: [],
      });
    }
    const regulaveis = de('prateleira_regulavel').sort((a, b) => a.caixa.x - b.caixa.x || a.caixa.y - b.caixa.y);
    if (regulaveis.length) {
      rascunhos.push({
        fase: 'regulaveis',
        titulo: regulaveis.length > 1 ? 'Prateleiras reguláveis' : 'Prateleira regulável',
        instrucoes: [
          'Com o móvel em pé, ponha 4 suportes (pinos) por prateleira, nos furos marcados, na mesma altura dos dois lados.',
          `Apoie ${lista(nomes(regulaveis))} nos suportes.`,
        ],
        ids: ids(regulaveis),
      });
    }
  } else {
    // ---- Mesa ou bancada: tampo de face para baixo; pés ou suportes.
    const tampo = de('tampo');
    rascunhos.push({
      fase: 'estrutura',
      titulo: 'Tampo',
      instrucoes: [`Deite o ${tampo.map((c) => rot(c.id)).join(', ') || 'tampo'} de face para baixo, sobre manta ou papelão, para não riscar.`],
      ids: ids(tampo),
    });
    const faixas = de('engrosso');
    if (faixas.length) {
      rascunhos.push({
        fase: 'engrosso',
        titulo: 'Borda engrossada',
        instrucoes: [
          `Cole e parafuse ${lista(nomes(faixas))} embaixo do tampo, alinhadas com a borda. Os parafusos entram pela faixa até o furo-guia no tampo.`,
          ...(faixas.some((c) => /_2$/.test(c.id)) ? ['Com duas faixas, parafuse a de cima primeiro e a de baixo depois.'] : []),
        ],
        ids: ids(faixas).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
      });
    }
    const pes = de('pe', 'pe_comprado');
    if (pes.length) {
      const comprados = pes.every((c) => c.comprado);
      rascunhos.push({
        fase: 'pes',
        titulo: 'Pés',
        instrucoes: comprados
          ? [`Fixe ${lista(nomes(pes))} nos furos-guia embaixo do tampo, pela chapa de cada pé.`]
          : [`Encaixe ${lista(nomes(pes))} no tampo.`, ...(tem('sapata_niveladora') ? ['Ponha as sapatas niveladoras na base de cada pé.'] : [])],
        ids: ids(pes),
      });
    }
    const travam = de('saia', 'travessa');
    if (travam.length) {
      rascunhos.push({
        fase: 'estrutura',
        titulo: travam.length > 1 ? 'Saia e travessa' : travam[0]!.nome,
        instrucoes: [`Encaixe ${lista(nomes(travam))} entre os pés. É o que trava a mesa: confira o esquadro dos pés com o tampo.`],
        ids: ids(travam),
      });
    }
    const suportes = de('suporte');
    if (suportes.length) {
      rascunhos.push({
        fase: 'suportes',
        titulo: 'Suportes na parede',
        instrucoes: [
          `Marque na parede a altura de baixo do tampo e fixe ${lista(nomes(suportes))} nivelados, nas posições do projeto.`,
          'Parafuso e bucha da parede dependem da parede (alvenaria, drywall) e não estão na lista.',
        ],
        ids: ids(suportes),
      });
    }
    const gabinetes = de('gabinete_ref');
    if (gabinetes.length) {
      rascunhos.push({
        fase: 'estrutura',
        titulo: 'Gabinetes',
        instrucoes: [`Posicione ${lista(nomes(gabinetes))} encostados um no outro e na parede, nivelados.`],
        ids: ids(gabinetes),
      });
    }
    if (suportes.length || gabinetes.length) {
      rascunhos.push({
        fase: 'assentar',
        titulo: 'Assente o tampo',
        instrucoes: [
          suportes.length
            ? 'Vire o tampo e apoie nos suportes. Parafuse por baixo, nos furos marcados.'
            : 'Vire o tampo e apoie nos gabinetes. Parafuse de dentro dos gabinetes para cima, nos furos marcados.',
        ],
        ids: [],
      });
    } else if (pes.length) {
      rascunhos.push({
        fase: 'ajustes',
        titulo: 'Vire a mesa',
        instrucoes: ['Vire a mesa com ajuda de outra pessoa, sem apoiar o peso em um pé só.', ...(tem('sapata_niveladora') ? ['Nivele pelas sapatas.'] : [])],
        ids: [],
      });
    }
  }

  // ---- Gavetas, portas e frentes (comum aos dois).
  const caixas = r.componentes.filter((c) => CAIXA_GAVETA.has(c.papel));
  if (caixas.length) {
    const qtd = new Set(caixas.map((c) => /^(gaveta_v\d+_\d+)_/.exec(c.id)?.[1] ?? c.id)).size;
    const juntaFundo = r.juncoes.some((j) => porId.get(j.a)?.papel === 'fundo_gaveta' || porId.get(j.b)?.papel === 'fundo_gaveta');
    const semJuncao = !r.juncoes.some((j) => j.a.startsWith('gaveta_'));
    rascunhos.push({
      fase: 'gavetas',
      titulo: qtd > 1 ? `Caixas das gavetas (${qtd})` : 'Caixa da gaveta',
      instrucoes: [
        `Na bancada, monte ${qtd > 1 ? 'as caixas' : 'a caixa'}: ${lista(nomes(caixas.filter((c) => c.papel !== 'fundo_gaveta')))}.`,
        semJuncao
          ? 'As peças da gaveta não têm furação de junção no projeto: monte com o sistema da oficina (grampo, cola ou parafuso).'
          : juntaFundo
            ? 'O fundo vai embaixo das laterais, parafusado nos furos marcados.'
            : 'O fundo vai embaixo das laterais: confira o esquadro e fixe com grampos ou pregos.',
      ],
      ids: ids(caixas),
    });
  }
  if (tem('corredica')) {
    rascunhos.push({
      fase: 'corredicas',
      titulo: 'Corrediças',
      instrucoes: [
        'Separe cada corrediça em duas partes: a de dentro vai na lateral da gaveta, a de fora na lateral do móvel (ou na divisória).',
        'Parafuse cada parte nos furos-guia marcados, com a frente da corrediça para a frente. Depois encaixe as gavetas e confira se correm sem raspar.',
      ],
      ids: [],
    });
  }
  const frentesGaveta = de('frente_gaveta').sort((a, b) => a.caixa.x - b.caixa.x || b.caixa.y - a.caixa.y);
  if (frentesGaveta.length) {
    rascunhos.push({
      fase: 'frentes_gaveta',
      titulo: frentesGaveta.length > 1 ? 'Frentes das gavetas' : 'Frente da gaveta',
      instrucoes: [
        'Com as gavetas fechadas, prenda cada frente com fita dupla-face ou grampo, alinhada com as folgas das vizinhas.',
        `Abra a gaveta e parafuse por dentro da contrafrente: ${lista(nomes(frentesGaveta))}.`,
      ],
      ids: ids(frentesGaveta),
    });
  }
  const portas = de('porta').sort((a, b) => a.caixa.x - b.caixa.x);
  if (portas.length) {
    rascunhos.push({
      fase: 'portas',
      titulo: portas.length > 1 ? 'Portas' : 'Porta',
      instrucoes: [
        'Na bancada, encaixe a copa de cada dobradiça no furo de 35 mm da porta e parafuse.',
        'No móvel, parafuse os calços nos dois furos marcados da lateral (ou divisória).',
        `Encaixe as dobradiças nos calços: ${lista(nomes(portas))}.`,
      ],
      ids: ids(portas),
    });
  }
  if (tem('puxador')) {
    rascunhos.push({
      fase: 'puxadores',
      titulo: 'Puxadores',
      instrucoes: ['Parafuse os puxadores pelos furos passantes, de dentro para fora. Os parafusos costumam vir com o puxador.'],
      ids: [],
    });
  }

  // Peças que nenhum passo pegou (não deve acontecer): um passo para elas.
  const usados = new Set(rascunhos.flatMap((p) => p.ids));
  const sobra = r.componentes.filter((c) => !usados.has(c.id));
  if (sobra.length) {
    rascunhos.push({ fase: 'outras', titulo: 'Demais peças', instrucoes: [`Monte ${lista(nomes(sobra))} conforme o desenho.`], ids: ids(sobra) });
  }
  if (portas.length || frentesGaveta.length) {
    rascunhos.push({
      fase: 'ajustes',
      titulo: 'Regulagem final',
      instrucoes: [
        ...(portas.length ? ['Regule as dobradiças pelos parafusos de ajuste (altura, lado e profundidade) até as folgas ficarem iguais e as portas fecharem sem raspar.'] : []),
        ...(frentesGaveta.length ? ['Confira as frentes das gavetas: alinhadas entre si e com as folgas iguais.'] : []),
        'Limpe as peças e retire sobras de cola.',
      ],
      ids: [],
    });
  }

  // ---- Junções: entram no passo em que as duas peças já estão no lugar.
  const posto = new Set<string>();
  const pendentes = [...r.juncoes];
  const dicasDadas = new Set<string>();
  const ordemNaLista = new Map(r.componentes.map((c, i) => [c.id, i]));
  const passos: PassoMontagem[] = rascunhos.map((rasc, i) => {
    for (const id of rasc.ids) posto.add(id);
    const juncoes: Juncao[] = [];
    for (let k = pendentes.length - 1; k >= 0; k--) {
      const j = pendentes[k]!;
      if (posto.has(j.a) && posto.has(j.b)) juncoes.unshift(...pendentes.splice(k, 1));
    }
    const instrucoes = [...rasc.instrucoes];
    // Junções iguais (a mesma em cada gaveta, por exemplo): uma linha com a quantidade.
    const linhas = new Map<string, number>();
    for (const j of juncoes) {
      const t = `${rot(j.a)} com ${rot(j.b)}: ${textoFerragensJuncao(j)}`;
      linhas.set(t, (linhas.get(t) ?? 0) + 1);
    }
    for (const [t, n] of linhas) instrucoes.push(n > 1 ? `${t} (${n} vezes).` : `${t}.`);
    for (const t of ['minifix', 'cavilha', 'parafuso'] as const) {
      if (juncoes.some((j) => j.tipo === t || (t === 'cavilha' && j.cavilhas?.length)) && !dicasDadas.has(t)) {
        dicasDadas.add(t);
        instrucoes.push(DICA[t]);
      }
    }
    const marcas: MarcaMontagem[] = [];
    for (const j of juncoes) {
      const tipo: TipoMarca = j.tipo === 'minifix' ? 'minifix' : j.tipo === 'cavilha' ? 'cavilha' : 'parafuso';
      for (const p of j.pontos) marcas.push({ tipo, ponto: p });
      for (const p of j.cavilhas ?? []) marcas.push({ tipo: 'cavilha', ponto: p });
    }
    const finalidades = MARCAS_DA_FASE[rasc.fase];
    if (finalidades) {
      const vistos = new Set<string>();
      for (const c of r.componentes) {
        if (rasc.marcasEm && !rasc.marcasEm.includes(c.id)) continue;
        for (const f of c.furos ?? []) {
          const tipo = finalidades[f.finalidade];
          if (!tipo) continue;
          // Parafuso que atravessa uma peça e morde a outra: uma marca, no furo passante.
          if (UM_PARAFUSO_DOIS_FUROS.has(f.finalidade) && !f.passante) continue;
          for (const p of furoNoMovel(c, f)) {
            // Furo passante e furo-guia no mesmo ponto: uma marca só.
            const chave = `${tipo}:${p.x},${p.y},${p.z}`;
            if (vistos.has(chave)) continue;
            vistos.add(chave);
            marcas.push({ tipo, ponto: p });
          }
        }
      }
    }
    if (rasc.fase === 'regulaveis') marcas.push(...pinosDasPrateleiras(r, rasc.ids));
    const novas = rasc.ids.map((id) => porId.get(id)!).filter(Boolean).map(peca);
    return {
      numero: i + 1,
      titulo: rasc.titulo,
      instrucoes,
      novas,
      montadas: [...posto].sort((a, b) => (ordemNaLista.get(a) ?? 0) - (ordemNaLista.get(b) ?? 0)),
      juncoes,
      ferragens: [] as FerragemNecessaria[],
      marcas,
    };
  });
  if (passos.length === 0) return null;
  // Sobrou junção (peça fora de todos os passos): vai para o último.
  if (pendentes.length) passos.at(-1)!.juncoes.push(...pendentes);

  // ---- Ferragens: as de junção pelos pontos; as outras inteiras na fase delas.
  const porPasso: FerragemNecessaria[][] = passos.map((p) => p.juncoes.flatMap(ferragensDaJuncao));
  const fases = rascunhos.map((p) => p.fase);
  for (const f of r.ferragens) {
    if (JUNCAO.has(f.codigo)) continue;
    const fase = FASE_DA_FERRAGEM[f.codigo];
    let i = fase ? fases.indexOf(fase) : -1;
    if (i < 0) i = passos.length - 1;
    porPasso[i]!.push(f);
  }
  passos.forEach((p, i) => {
    p.ferragens = juntarFerragens(porPasso[i]!).map((f) => ({ ...f, descricao: f.descricao || DESCRICAO_FERRAGEM[f.codigo] }));
  });

  const pecas = r.componentes.map(peca);
  const aCortar = r.componentes.filter((c) => !c.comprado).length;
  const ferragens = r.ferragens.map((f) => ({ ...f, descricao: f.descricao || DESCRICAO_FERRAGEM[f.codigo] }));
  const antes = [
    `Confira as ${aCortar} peças pelos códigos das etiquetas e separe as ferragens da lista.`,
    'Ferramentas: parafusadeira, chave Philips, martelo de borracha, trena e esquadro.',
    'Monte em lugar plano e forrado, para não riscar as peças.',
  ];
  return { antes, pecas, ferragens, passos };
}

/** Os quatro furos onde vão os suportes de cada prateleira regulável (os mais próximos da face de baixo dela). */
function pinosDasPrateleiras(r: ResultadoModulo, ids: readonly string[]): MarcaMontagem[] {
  const furos = r.componentes.flatMap((c) => (c.furos ?? []).filter((f) => f.finalidade === 'pino_prateleira').flatMap((f) => furoNoMovel(c, f)));
  const marcas: MarcaMontagem[] = [];
  for (const id of ids) {
    const p = r.componentes.find((c) => c.id === id);
    if (!p) continue;
    for (const borda of [p.caixa.x, p.caixa.x + p.caixa.dx]) {
      // Furos na parede deste lado (até 5 mm de folga), dentro da profundidade da prateleira.
      const lado = furos.filter((g) => Math.abs(g.x - borda) <= 50 && g.z >= p.caixa.z && g.z <= p.caixa.z + p.caixa.dz && g.y <= p.caixa.y);
      if (!lado.length) continue;
      const y = Math.max(...lado.map((g) => g.y));
      for (const g of lado.filter((g) => g.y === y)) marcas.push({ tipo: 'suporte_prateleira', ponto: g });
    }
  }
  return marcas;
}

// ---------------------------------------------------------------------------
// Fotografia do móvel para o manual publicado e para a oficina: só a forma,
// a furação, as junções e as ferragens (nada de preço ou de cliente).
// ---------------------------------------------------------------------------

export interface ModeloMontagem {
  versao: 1;
  componentes: Componente[];
  juncoes: Juncao[];
  ferragens: FerragemNecessaria[];
  /** Id da peça → código da lista (P01…). */
  codigos: Record<string, string>;
}

export function modeloMontagem(r: ResultadoModulo, codigos: ReadonlyMap<string, string>): ModeloMontagem {
  return {
    versao: 1,
    componentes: r.componentes.map((c) => ({ ...c, origem: '' })),
    juncoes: r.juncoes,
    ferragens: r.ferragens,
    codigos: Object.fromEntries(r.componentes.flatMap((c) => (codigos.has(c.id) ? [[c.id, codigos.get(c.id)!]] : []))),
  };
}

/** O resultado (válido) que o manual precisa, a partir da fotografia. */
export function resultadoDoModelo(m: ModeloMontagem): ResultadoModulo {
  return { valido: true, erros: [], medidas: {}, vaos: [], componentes: m.componentes, avisos: [], ferragens: m.ferragens, juncoes: m.juncoes };
}

const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const texto = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length <= max;
const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ponto = (v: unknown) => objeto(v) && numero(v.x) && numero(v.y) && numero(v.z);
const EIXOS_CAIXA = ['x', 'y', 'z', 'dx', 'dy', 'dz'] as const;

/**
 * Confere a fotografia lida de fora (arquivo publicado, dados da ordem).
 * Devolve null se a forma não bate: a página mostra "não foi possível abrir".
 */
export function lerModeloMontagem(v: unknown): ModeloMontagem | null {
  if (!objeto(v) || v.versao !== 1) return null;
  const { componentes, juncoes, ferragens, codigos } = v;
  if (!Array.isArray(componentes) || componentes.length === 0 || componentes.length > 2000) return null;
  if (!Array.isArray(juncoes) || juncoes.length > 5000 || !Array.isArray(ferragens) || ferragens.length > 200 || !objeto(codigos)) return null;
  for (const c of componentes) {
    if (!objeto(c) || !texto(c.id, 80) || !texto(c.papel, 40) || !texto(c.nome) || !texto(c.material, 40)) return null;
    if (!numero(c.comprimento) || !numero(c.largura) || !numero(c.espessura) || !objeto(c.caixa)) return null;
    const k = c.caixa;
    if (!EIXOS_CAIXA.every((e) => numero(k[e]))) return null;
    if (c.furos !== undefined) {
      if (!Array.isArray(c.furos) || c.furos.length > 200) return null;
      for (const f of c.furos) {
        if (!objeto(f) || !texto(f.finalidade, 40) || !texto(f.face, 2) || !numero(f.diametro) || !numero(f.profundidade) || !Array.isArray(f.centros) || f.centros.length > 2000) return null;
        if (!f.centros.every((p) => objeto(p) && numero(p.u) && numero(p.v))) return null;
      }
    }
  }
  for (const j of juncoes) {
    if (!objeto(j) || !texto(j.a, 80) || !texto(j.b, 80) || !Array.isArray(j.pontos) || !j.pontos.every(ponto)) return null;
    if (j.cavilhas !== undefined && (!Array.isArray(j.cavilhas) || !j.cavilhas.every(ponto))) return null;
    if (j.tipo !== undefined && j.tipo !== 'minifix' && j.tipo !== 'cavilha' && j.tipo !== 'parafuso') return null;
  }
  for (const f of ferragens) {
    if (!objeto(f) || !texto(f.codigo, 40) || !(f.codigo in DESCRICAO_FERRAGEM) || !numero(f.quantidade) || !texto(f.descricao, 300)) return null;
    if (f.comprimento !== undefined && !numero(f.comprimento)) return null;
  }
  if (!Object.values(codigos).every((c) => texto(c, 12))) return null;
  return v as unknown as ModeloMontagem;
}
