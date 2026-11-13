/**
 * Regras paramétricas como dados.
 *
 * Um módulo é calculado por DUAS regras compostas: uma de montagem (como
 * laterais, tampo e base se encaixam) e uma de fundo (como o fundo entra na
 * caixa). Cada uma declara parâmetros, medidas derivadas, componentes e
 * validações, todos em expressões da linguagem segura (expressao.ts).
 *
 * Contrato entre as duas:
 *   - a montagem define Li, Hi (vão interno), xi, yi (canto do vão na vista
 *     frontal) e FLe, FAe (largura e altura externas cobertas por um fundo
 *     sobreposto);
 *   - o fundo define Pc (profundidade da caixa: laterais, tampo, base) e
 *     Pint (profundidade livre do vão, da frente até a face do fundo).
 *
 * Ao compor, as medidas derivadas das duas viram um único grafo. Ele é
 * ordenado topologicamente; ciclos e nomes desconhecidos são recusados na
 * compilação, antes de qualquer cálculo.
 */
import { analisarExpressao, ErroExpressao, variaveisDe, type No } from './expressao';

/** Medidas que o usuário informa. Todas em décimos de mm. */
export const ENTRADAS = {
  L: 'largura externa',
  A: 'altura externa',
  P: 'profundidade externa',
  e: 'espessura do material da estrutura',
  ef: 'espessura do material do fundo',
} as const;

export type NomeEntrada = keyof typeof ENTRADAS;

export const EXIGIDOS_MONTAGEM = ['Li', 'Hi', 'xi', 'yi', 'FLe', 'FAe'] as const;
export const EXIGIDOS_FUNDO = ['Pc', 'Pint'] as const;

export type PapelComponente =
  | 'lateral'
  | 'tampo'
  | 'base'
  | 'travessa'
  | 'fundo'
  | 'divisoria'
  | 'prateleira_fixa'
  | 'prateleira_regulavel'
  | 'porta'
  | 'frente_gaveta'
  | 'lateral_gaveta'
  | 'contrafrente_gaveta'
  | 'traseira_gaveta'
  | 'fundo_gaveta'
  // Mesa
  | 'pe'
  | 'saia'
  | 'engrosso'
  // Itens comprados ou de referência (não são cortados)
  | 'pe_comprado'
  | 'suporte'
  | 'gabinete_ref';

/** Frente: portas e frentes de gaveta. Gaveta: caixa da gaveta. O fundo da gaveta usa o material do fundo. */
export type MaterialComponente = 'estrutura' | 'fundo' | 'frente' | 'gaveta';

export interface DefinicaoParametro {
  nome: string;
  rotulo: string;
  /** Décimos de mm. */
  padrao: number;
  min: number;
  max: number;
  ajuda?: string;
}

/**
 * Posição da peça no espaço, em expressões. Origem: canto esquerdo, no chão,
 * na face da frente da caixa. x cresce para a direita, y para cima, z para
 * trás. dx, dy, dz são o tamanho da peça nesses eixos.
 */
export interface DefinicaoCaixa {
  x: string;
  y: string;
  z: string;
  dx: string;
  dy: string;
  dz: string;
}

export const EIXOS_CAIXA = ['x', 'y', 'z', 'dx', 'dy', 'dz'] as const;

export interface DefinicaoComponente {
  id: string;
  papel: PapelComponente;
  nome: string;
  /** Medida que acompanha o veio. */
  comprimento: string;
  /** Medida transversal ao veio. */
  largura: string;
  material: MaterialComponente;
  /** Onde a peça fica no móvel. Obrigatório: alimenta as vistas 2D e 3D e a usinagem. */
  caixa: DefinicaoCaixa;
  /** Se presente e falsa, o componente não existe. */
  quando?: string;
}

export interface DefinicaoValidacao {
  condicao: string;
  /** Pode citar medidas entre chaves: "{Li}" vira "564 mm". */
  mensagem: string;
}

export interface DefinicaoRegra {
  codigo: string;
  versao: number;
  tipo: 'montagem' | 'fundo';
  nome: string;
  descricao: string;
  parametros: DefinicaoParametro[];
  derivados: Record<string, string>;
  componentes: DefinicaoComponente[];
  validacoes: DefinicaoValidacao[];
}

export interface ExpressaoCompilada {
  texto: string;
  no: No;
}

export interface ComponenteCompilado {
  id: string;
  papel: PapelComponente;
  nome: string;
  material: MaterialComponente;
  comprimento: ExpressaoCompilada;
  largura: ExpressaoCompilada;
  caixa: Record<(typeof EIXOS_CAIXA)[number], ExpressaoCompilada>;
  quando?: ExpressaoCompilada;
  origem: string;
}

export interface ModeloCompilado {
  codigo: string;
  nome: string;
  montagem: { codigo: string; versao: number };
  fundo: { codigo: string; versao: number };
  parametros: DefinicaoParametro[];
  /** Medidas derivadas em ordem de cálculo. */
  derivados: Array<{ nome: string } & ExpressaoCompilada>;
  componentes: ComponenteCompilado[];
  validacoes: Array<{ condicao: ExpressaoCompilada; mensagem: string; regra: string }>;
  /** Dependências diretas: nome → nomes de que ele depende. */
  dependencias: ReadonlyMap<string, ReadonlySet<string>>;
}

export class ErroRegra extends Error {
  readonly problemas: string[];

  constructor(problemas: string[]) {
    super(`Regra inválida:\n- ${problemas.join('\n- ')}`);
    this.name = 'ErroRegra';
    this.problemas = problemas;
  }
}

const NOME_VALIDO = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const RESERVADOS = new Set(['verdadeiro', 'falso', 'min', 'max', 'abs', 'div_baixo', 'div_cima', 'div_proximo', 'div_exato']);

function compilarTexto(texto: string, onde: string, problemas: string[]): ExpressaoCompilada | null {
  if (typeof texto !== 'string') {
    problemas.push(`${onde}: a expressão precisa ser texto.`);
    return null;
  }
  try {
    return { texto, no: analisarExpressao(texto) };
  } catch (e) {
    if (e instanceof ErroExpressao) {
      problemas.push(`${onde}: ${e.message} (posição ${e.posicao + 1} em "${texto}")`);
      return null;
    }
    throw e;
  }
}

/**
 * Ordena as medidas derivadas para que cada uma seja calculada depois das que
 * ela usa. Devolve o ciclo encontrado, se houver.
 */
export function ordenarTopologicamente(
  dependencias: ReadonlyMap<string, ReadonlySet<string>>,
): { ordem: string[] } | { ciclo: string[] } {
  const estado = new Map<string, 'visitando' | 'feito'>();
  const ordem: string[] = [];
  const pilha: string[] = [];

  const visitar = (nome: string): string[] | null => {
    const s = estado.get(nome);
    if (s === 'feito') return null;
    if (s === 'visitando') return [...pilha.slice(pilha.indexOf(nome)), nome];
    estado.set(nome, 'visitando');
    pilha.push(nome);
    for (const dep of [...(dependencias.get(nome) ?? [])].sort()) {
      if (!dependencias.has(dep)) continue; // entrada ou parâmetro: folha
      const ciclo = visitar(dep);
      if (ciclo) return ciclo;
    }
    pilha.pop();
    estado.set(nome, 'feito');
    ordem.push(nome);
    return null;
  };

  for (const nome of [...dependencias.keys()].sort()) {
    const ciclo = visitar(nome);
    if (ciclo) return { ciclo };
  }
  return { ordem };
}

function conferirDefinicao(regra: DefinicaoRegra, problemas: string[]): void {
  const onde = `Regra "${regra.codigo}"`;
  if (!NOME_VALIDO.test(regra.codigo ?? '')) problemas.push(`${onde}: código inválido.`);
  if (!Number.isSafeInteger(regra.versao) || regra.versao < 1) problemas.push(`${onde}: versão precisa ser um inteiro ≥ 1.`);
  for (const p of regra.parametros) {
    if (!NOME_VALIDO.test(p.nome) || RESERVADOS.has(p.nome)) problemas.push(`${onde}: nome de parâmetro inválido "${p.nome}".`);
    if (![p.padrao, p.min, p.max].every(Number.isSafeInteger) || p.min > p.max || p.padrao < p.min || p.padrao > p.max) {
      problemas.push(`${onde}: parâmetro "${p.nome}" com limites ou padrão inválidos.`);
    }
  }
  for (const nome of Object.keys(regra.derivados)) {
    if (!NOME_VALIDO.test(nome) || RESERVADOS.has(nome)) problemas.push(`${onde}: nome de medida derivada inválido "${nome}".`);
  }
}

/**
 * Compõe uma regra de montagem com uma regra de fundo e compila o resultado.
 * Lança ErroRegra com TODOS os problemas encontrados.
 */
export function compilarModelo(montagem: DefinicaoRegra, fundo: DefinicaoRegra): ModeloCompilado {
  const problemas: string[] = [];

  if (montagem.tipo !== 'montagem') problemas.push(`"${montagem.codigo}" não é uma regra de montagem.`);
  if (fundo.tipo !== 'fundo') problemas.push(`"${fundo.codigo}" não é uma regra de fundo.`);
  conferirDefinicao(montagem, problemas);
  conferirDefinicao(fundo, problemas);

  for (const nome of EXIGIDOS_MONTAGEM) {
    if (!(nome in montagem.derivados)) problemas.push(`Montagem "${montagem.codigo}" precisa definir a medida ${nome}.`);
  }
  for (const nome of EXIGIDOS_FUNDO) {
    if (!(nome in fundo.derivados)) problemas.push(`Fundo "${fundo.codigo}" precisa definir a medida ${nome}.`);
  }

  // Todos os nomes num só espaço: entradas, parâmetros e derivados não podem colidir.
  const origemDoNome = new Map<string, string>();
  const registrar = (nome: string, origem: string) => {
    const anterior = origemDoNome.get(nome);
    if (anterior) problemas.push(`O nome "${nome}" aparece em ${anterior} e em ${origem}.`);
    else origemDoNome.set(nome, origem);
  };
  for (const nome of Object.keys(ENTRADAS)) registrar(nome, 'entradas do módulo');
  const parametros: DefinicaoParametro[] = [];
  for (const regra of [montagem, fundo]) {
    for (const p of regra.parametros) {
      registrar(p.nome, `parâmetros de "${regra.codigo}"`);
      parametros.push(p);
    }
  }
  for (const regra of [montagem, fundo]) {
    for (const nome of Object.keys(regra.derivados)) registrar(nome, `medidas de "${regra.codigo}"`);
  }

  const conhecidos = new Set(origemDoNome.keys());
  const conferirNomes = (exp: ExpressaoCompilada | null, onde: string) => {
    if (!exp) return;
    for (const v of variaveisDe(exp.no)) {
      if (!conhecidos.has(v)) problemas.push(`${onde}: "${v}" não é entrada, parâmetro nem medida conhecida (em "${exp.texto}").`);
    }
  };

  // Medidas derivadas e grafo.
  const expDerivadas = new Map<string, ExpressaoCompilada>();
  const dependencias = new Map<string, Set<string>>();
  for (const regra of [montagem, fundo]) {
    for (const [nome, texto] of Object.entries(regra.derivados)) {
      const exp = compilarTexto(texto, `Medida ${nome} ("${regra.codigo}")`, problemas);
      conferirNomes(exp, `Medida ${nome}`);
      if (exp) {
        expDerivadas.set(nome, exp);
        dependencias.set(nome, variaveisDe(exp.no));
      }
    }
  }

  // Componentes.
  const componentes: ComponenteCompilado[] = [];
  const ids = new Set<string>();
  for (const regra of [montagem, fundo]) {
    for (const c of regra.componentes) {
      const onde = `Componente ${c.id} ("${regra.codigo}")`;
      if (!NOME_VALIDO.test(c.id)) problemas.push(`${onde}: id inválido.`);
      if (ids.has(c.id)) problemas.push(`${onde}: id repetido.`);
      ids.add(c.id);
      const comprimento = compilarTexto(c.comprimento, `${onde}, comprimento`, problemas);
      const largura = compilarTexto(c.largura, `${onde}, largura`, problemas);
      const quando = c.quando === undefined ? undefined : compilarTexto(c.quando, `${onde}, quando`, problemas);
      const caixa: Partial<Record<(typeof EIXOS_CAIXA)[number], ExpressaoCompilada | null>> = {};
      if (!c.caixa) problemas.push(`${onde}: falta a posição (caixa).`);
      else for (const eixo of EIXOS_CAIXA) caixa[eixo] = compilarTexto(c.caixa[eixo], `${onde}, caixa.${eixo}`, problemas);
      for (const exp of [comprimento, largura, quando ?? null, ...Object.values(caixa)]) {
        conferirNomes(exp ?? null, onde);
      }
      if (!comprimento || !largura || quando === null) continue;
      if (!c.caixa || EIXOS_CAIXA.some((eixo) => !caixa[eixo])) continue;
      const deps = new Set([...variaveisDe(comprimento.no), ...variaveisDe(largura.no), ...(quando ? variaveisDe(quando.no) : [])]);
      dependencias.set(`#${c.id}`, deps);
      componentes.push({
        id: c.id,
        papel: c.papel,
        nome: c.nome,
        material: c.material,
        comprimento,
        largura,
        caixa: caixa as ComponenteCompilado['caixa'],
        quando: quando ?? undefined,
        origem: `${c.comprimento} × ${c.largura}`,
      });
    }
  }

  // Validações.
  const validacoes: ModeloCompilado['validacoes'] = [];
  for (const regra of [montagem, fundo]) {
    regra.validacoes.forEach((v, i) => {
      const exp = compilarTexto(v.condicao, `Validação ${i + 1} ("${regra.codigo}")`, problemas);
      conferirNomes(exp, `Validação ${i + 1} ("${regra.codigo}")`);
      if (exp) validacoes.push({ condicao: exp, mensagem: v.mensagem, regra: regra.codigo });
    });
  }

  // Ordem de cálculo (só das medidas derivadas; componentes dependem delas).
  const grafoDerivadas = new Map([...dependencias].filter(([k]) => !k.startsWith('#')));
  const ordenacao = ordenarTopologicamente(grafoDerivadas);
  if ('ciclo' in ordenacao) {
    problemas.push(`Dependência circular entre medidas: ${ordenacao.ciclo.join(' → ')}.`);
  }

  if (problemas.length > 0) throw new ErroRegra(problemas);

  const ordem = (ordenacao as { ordem: string[] }).ordem;
  return {
    codigo: `${montagem.codigo}+${fundo.codigo}`,
    nome: `${montagem.nome}, ${fundo.nome.toLowerCase()}`,
    montagem: { codigo: montagem.codigo, versao: montagem.versao },
    fundo: { codigo: fundo.codigo, versao: fundo.versao },
    parametros,
    derivados: ordem.map((nome) => ({ nome, ...(expDerivadas.get(nome) as ExpressaoCompilada) })),
    componentes,
    validacoes,
    dependencias: dependencias as ReadonlyMap<string, ReadonlySet<string>>,
  };
}

/**
 * Tudo o que muda quando `nome` muda: medidas derivadas e componentes
 * (componentes aparecem como "#id"), em qualquer profundidade.
 */
export function dependentesDe(modelo: ModeloCompilado, nome: string): Set<string> {
  const reverso = new Map<string, string[]>();
  for (const [quem, deps] of modelo.dependencias) {
    for (const d of deps) reverso.set(d, [...(reverso.get(d) ?? []), quem]);
  }
  const resultado = new Set<string>();
  const fila = [nome];
  while (fila.length > 0) {
    const atual = fila.shift() as string;
    for (const q of reverso.get(atual) ?? []) {
      if (!resultado.has(q)) {
        resultado.add(q);
        fila.push(q);
      }
    }
  }
  return resultado;
}
