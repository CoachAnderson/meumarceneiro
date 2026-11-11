/**
 * Linguagem de expressões das regras paramétricas.
 *
 * Feita para ser segura e exata:
 *   - parser próprio; nada de eval/Function, nenhum acesso a objetos do JavaScript;
 *   - só inteiros (medidas em décimos de mm) e booleanos;
 *   - "/" não existe: toda divisão declara o arredondamento
 *     (div_baixo, div_cima, div_proximo, div_exato);
 *   - todo resultado é conferido como inteiro seguro.
 *
 * Gramática (da menor para a maior precedência):
 *   condicional  := ou ('?' condicional ':' condicional)?
 *   ou           := e ('||' e)*
 *   e            := comparacao ('&&' comparacao)*
 *   comparacao   := soma (('=='|'!='|'<'|'<='|'>'|'>=') soma)?
 *   soma         := produto (('+'|'-') produto)*
 *   produto      := unario ('*' unario)*
 *   unario       := ('-'|'!') unario | primario
 *   primario     := inteiro | 'verdadeiro' | 'falso' | nome | nome '(' args ')' | '(' condicional ')'
 */

export type Valor = number | boolean;

export type No =
  | { tipo: 'numero'; valor: number; pos: number }
  | { tipo: 'booleano'; valor: boolean; pos: number }
  | { tipo: 'variavel'; nome: string; pos: number }
  | { tipo: 'unario'; op: '-' | '!'; arg: No; pos: number }
  | { tipo: 'binario'; op: OperadorBinario; esq: No; dir: No; pos: number }
  | { tipo: 'condicional'; teste: No; entao: No; senao: No; pos: number }
  | { tipo: 'chamada'; funcao: NomeFuncao; args: No[]; pos: number };

type OperadorBinario = '+' | '-' | '*' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||';

const FUNCOES = {
  min: { aridade: [2, Infinity] },
  max: { aridade: [2, Infinity] },
  abs: { aridade: [1, 1] },
  div_baixo: { aridade: [2, 2] },
  div_cima: { aridade: [2, 2] },
  div_proximo: { aridade: [2, 2] },
  div_exato: { aridade: [2, 2] },
} as const;

type NomeFuncao = keyof typeof FUNCOES;

const ehFuncao = (nome: string): nome is NomeFuncao => Object.prototype.hasOwnProperty.call(FUNCOES, nome);

export class ErroExpressao extends Error {
  readonly posicao: number;

  constructor(mensagem: string, posicao: number) {
    super(mensagem);
    this.name = 'ErroExpressao';
    this.posicao = posicao;
  }
}

type Token =
  | { tipo: 'numero'; valor: number; pos: number }
  | { tipo: 'nome'; valor: string; pos: number }
  | { tipo: 'op'; valor: string; pos: number }
  | { tipo: 'fim'; pos: number };

const OPERADORES = ['==', '!=', '<=', '>=', '&&', '||', '+', '-', '*', '<', '>', '!', '?', ':', '(', ')', ','];
const NOME = /[A-Za-z_][A-Za-z0-9_]*/y;
const NUMERO = /[0-9]+/y;
const LIMITE_TEXTO = 2000;

function tokenizar(texto: string): Token[] {
  if (texto.length > LIMITE_TEXTO) throw new ErroExpressao(`Expressão longa demais (máximo ${LIMITE_TEXTO} caracteres).`, 0);
  const tokens: Token[] = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i] as string;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    NUMERO.lastIndex = i;
    const n = NUMERO.exec(texto);
    if (n) {
      const valor = Number(n[0]);
      if (!Number.isSafeInteger(valor)) throw new ErroExpressao(`Número grande demais: ${n[0]}.`, i);
      if (texto[i + n[0].length] === '.' && /[0-9]/.test(texto[i + n[0].length + 1] ?? '')) {
        throw new ErroExpressao('Use só inteiros (medidas em décimos de milímetro: 18 mm = 180).', i);
      }
      tokens.push({ tipo: 'numero', valor, pos: i });
      i += n[0].length;
      continue;
    }
    NOME.lastIndex = i;
    const m = NOME.exec(texto);
    if (m) {
      tokens.push({ tipo: 'nome', valor: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if (c === '/') {
      throw new ErroExpressao('Divisão com "/" não é permitida. Use div_baixo, div_cima, div_proximo ou div_exato.', i);
    }
    const op = OPERADORES.find((o) => texto.startsWith(o, i));
    if (!op) throw new ErroExpressao(`Caractere inesperado "${c}".`, i);
    tokens.push({ tipo: 'op', valor: op, pos: i });
    i += op.length;
  }
  tokens.push({ tipo: 'fim', pos: texto.length });
  return tokens;
}

class Parser {
  private i = 0;
  private profundidade = 0;

  constructor(private readonly tokens: Token[]) {}

  private atual(): Token {
    return this.tokens[this.i] as Token;
  }

  private ehOp(valor: string): boolean {
    const t = this.atual();
    return t.tipo === 'op' && t.valor === valor;
  }

  private consumirOp(valor: string): Token {
    const t = this.atual();
    if (t.tipo !== 'op' || t.valor !== valor) {
      throw new ErroExpressao(`Esperava "${valor}".`, t.pos);
    }
    this.i++;
    return t;
  }

  analisar(): No {
    const no = this.condicional();
    const t = this.atual();
    if (t.tipo !== 'fim') throw new ErroExpressao('Sobrou texto depois do fim da expressão.', t.pos);
    return no;
  }

  private aninhar<T>(fn: () => T): T {
    if (++this.profundidade > 100) throw new ErroExpressao('Expressão aninhada demais.', this.atual().pos);
    try {
      return fn();
    } finally {
      this.profundidade--;
    }
  }

  private condicional(): No {
    return this.aninhar(() => {
      const teste = this.ou();
      if (!this.ehOp('?')) return teste;
      const pos = this.consumirOp('?').pos;
      const entao = this.condicional();
      this.consumirOp(':');
      const senao = this.condicional();
      return { tipo: 'condicional', teste, entao, senao, pos };
    });
  }

  private binarioEsquerda(proximo: () => No, ops: OperadorBinario[]): No {
    let esq = proximo();
    for (;;) {
      const t = this.atual();
      if (t.tipo !== 'op' || !ops.includes(t.valor as OperadorBinario)) return esq;
      this.i++;
      const dir = proximo();
      esq = { tipo: 'binario', op: t.valor as OperadorBinario, esq, dir, pos: t.pos };
    }
  }

  private ou(): No {
    return this.binarioEsquerda(() => this.e(), ['||']);
  }

  private e(): No {
    return this.binarioEsquerda(() => this.comparacao(), ['&&']);
  }

  private comparacao(): No {
    const esq = this.soma();
    const t = this.atual();
    if (t.tipo === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(t.valor)) {
      this.i++;
      const dir = this.soma();
      const seguinte = this.atual();
      if (seguinte.tipo === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(seguinte.valor)) {
        throw new ErroExpressao('Comparações encadeadas (a < b < c) não são permitidas; use &&.', seguinte.pos);
      }
      return { tipo: 'binario', op: t.valor as OperadorBinario, esq, dir, pos: t.pos };
    }
    return esq;
  }

  private soma(): No {
    return this.binarioEsquerda(() => this.produto(), ['+', '-']);
  }

  private produto(): No {
    return this.binarioEsquerda(() => this.unario(), ['*']);
  }

  private unario(): No {
    const t = this.atual();
    if (t.tipo === 'op' && (t.valor === '-' || t.valor === '!')) {
      this.i++;
      return this.aninhar(() => ({ tipo: 'unario', op: t.valor as '-' | '!', arg: this.unario(), pos: t.pos }));
    }
    return this.primario();
  }

  private primario(): No {
    const t = this.atual();
    if (t.tipo === 'numero') {
      this.i++;
      return { tipo: 'numero', valor: t.valor, pos: t.pos };
    }
    if (t.tipo === 'nome') {
      this.i++;
      if (t.valor === 'verdadeiro' || t.valor === 'falso') return { tipo: 'booleano', valor: t.valor === 'verdadeiro', pos: t.pos };
      if (this.ehOp('(')) {
        if (!ehFuncao(t.valor)) throw new ErroExpressao(`Função desconhecida "${t.valor}".`, t.pos);
        this.consumirOp('(');
        const args: No[] = [];
        if (!this.ehOp(')')) {
          do {
            args.push(this.condicional());
          } while (this.ehOp(',') && this.consumirOp(','));
        }
        this.consumirOp(')');
        const [minimo, maximo] = FUNCOES[t.valor].aridade;
        if (args.length < minimo || args.length > maximo) {
          throw new ErroExpressao(
            `${t.valor}() recebe ${minimo === maximo ? minimo : `pelo menos ${minimo}`} argumento(s); recebeu ${args.length}.`,
            t.pos,
          );
        }
        return { tipo: 'chamada', funcao: t.valor, args, pos: t.pos };
      }
      if (ehFuncao(t.valor)) throw new ErroExpressao(`"${t.valor}" é uma função; use ${t.valor}(...).`, t.pos);
      return { tipo: 'variavel', nome: t.valor, pos: t.pos };
    }
    if (t.tipo === 'op' && t.valor === '(') {
      this.i++;
      const no = this.condicional();
      this.consumirOp(')');
      return no;
    }
    throw new ErroExpressao(t.tipo === 'fim' ? 'A expressão terminou antes do esperado.' : `"${t.valor}" fora do lugar.`, t.pos);
  }
}

/** Analisa o texto e devolve a árvore. Lança ErroExpressao com a posição do problema. */
export function analisarExpressao(texto: string): No {
  if (texto.trim() === '') throw new ErroExpressao('Expressão vazia.', 0);
  return new Parser(tokenizar(texto)).analisar();
}

/** Nomes de variáveis usados na expressão (para o grafo de dependências). */
export function variaveisDe(no: No, acumulado = new Set<string>()): Set<string> {
  switch (no.tipo) {
    case 'variavel':
      acumulado.add(no.nome);
      break;
    case 'unario':
      variaveisDe(no.arg, acumulado);
      break;
    case 'binario':
      variaveisDe(no.esq, acumulado);
      variaveisDe(no.dir, acumulado);
      break;
    case 'condicional':
      variaveisDe(no.teste, acumulado);
      variaveisDe(no.entao, acumulado);
      variaveisDe(no.senao, acumulado);
      break;
    case 'chamada':
      for (const a of no.args) variaveisDe(a, acumulado);
      break;
    default:
      break;
  }
  return acumulado;
}

export type Ambiente = ReadonlyMap<string, Valor>;

function inteiro(v: Valor, no: No): number {
  if (typeof v !== 'number') throw new ErroExpressao('Esperava um número, veio verdadeiro/falso.', no.pos);
  return v;
}

function booleano(v: Valor, no: No): boolean {
  if (typeof v !== 'boolean') throw new ErroExpressao('Esperava verdadeiro/falso, veio um número.', no.pos);
  return v;
}

function seguro(valor: number, no: No): number {
  if (!Number.isSafeInteger(valor)) throw new ErroExpressao('O resultado passou do limite de inteiros seguros.', no.pos);
  return valor === 0 ? 0 : valor;
}

function divisaoPiso(a: number, b: number): number {
  const resto = ((a % b) + b) % b;
  return (a - resto) / b;
}

export function avaliar(no: No, ambiente: Ambiente): Valor {
  switch (no.tipo) {
    case 'numero':
    case 'booleano':
      return no.valor;
    case 'variavel': {
      const v = ambiente.get(no.nome);
      if (v === undefined) throw new ErroExpressao(`Variável "${no.nome}" não definida.`, no.pos);
      return v;
    }
    case 'unario': {
      const v = avaliar(no.arg, ambiente);
      return no.op === '-' ? seguro(-inteiro(v, no.arg), no) : !booleano(v, no.arg);
    }
    case 'condicional':
      return booleano(avaliar(no.teste, ambiente), no.teste) ? avaliar(no.entao, ambiente) : avaliar(no.senao, ambiente);
    case 'binario': {
      if (no.op === '&&') return booleano(avaliar(no.esq, ambiente), no.esq) && booleano(avaliar(no.dir, ambiente), no.dir);
      if (no.op === '||') return booleano(avaliar(no.esq, ambiente), no.esq) || booleano(avaliar(no.dir, ambiente), no.dir);
      const a = avaliar(no.esq, ambiente);
      const b = avaliar(no.dir, ambiente);
      if (no.op === '==' || no.op === '!=') {
        if (typeof a !== typeof b) throw new ErroExpressao('Comparação entre número e verdadeiro/falso.', no.pos);
        return no.op === '==' ? a === b : a !== b;
      }
      const x = inteiro(a, no.esq);
      const y = inteiro(b, no.dir);
      switch (no.op) {
        case '+':
          return seguro(x + y, no);
        case '-':
          return seguro(x - y, no);
        case '*':
          return seguro(x * y, no);
        case '<':
          return x < y;
        case '<=':
          return x <= y;
        case '>':
          return x > y;
        case '>=':
          return x >= y;
      }
      throw new ErroExpressao(`Operador desconhecido ${no.op}.`, no.pos);
    }
    case 'chamada': {
      const args = no.args.map((a) => inteiro(avaliar(a, ambiente), a));
      switch (no.funcao) {
        case 'min':
          return Math.min(...args);
        case 'max':
          return Math.max(...args);
        case 'abs':
          return seguro(Math.abs(args[0] as number), no);
      }
      const [a, b] = args as [number, number];
      if (b <= 0) throw new ErroExpressao(`${no.funcao}(): o divisor precisa ser positivo (veio ${b}).`, no.pos);
      switch (no.funcao) {
        case 'div_baixo':
          return seguro(divisaoPiso(a, b), no);
        case 'div_cima':
          return seguro(-divisaoPiso(-a, b), no);
        case 'div_proximo':
          return seguro(divisaoPiso(2 * a + b, 2 * b), no);
        case 'div_exato':
          if (a % b !== 0) throw new ErroExpressao(`div_exato(): ${a} não é divisível por ${b}.`, no.pos);
          return seguro(a / b, no);
      }
    }
  }
}

/** Atalho: analisa e avalia, exigindo resultado numérico. */
export function avaliarNumero(texto: string, ambiente: Ambiente): number {
  const no = analisarExpressao(texto);
  return inteiro(avaliar(no, ambiente), no);
}
