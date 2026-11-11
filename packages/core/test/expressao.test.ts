import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ErroExpressao, analisarExpressao, avaliar, avaliarNumero, variaveisDe, type Valor } from '../src';

const amb = (o: Record<string, Valor>) => new Map(Object.entries(o));

function erro(fn: () => unknown): ErroExpressao {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErroExpressao) return e;
    throw e;
  }
  throw new Error('Esperava ErroExpressao.');
}

describe('avaliação', () => {
  it('calcula a largura interna do módulo de exemplo', () => {
    expect(avaliarNumero('L - 2*e', amb({ L: 6000, e: 180 }))).toBe(5640);
  });

  it('respeita precedência e parênteses', () => {
    expect(avaliarNumero('2 + 3 * 4', amb({}))).toBe(14);
    expect(avaliarNumero('(2 + 3) * 4', amb({}))).toBe(20);
    expect(avaliarNumero('10 - 3 - 2', amb({}))).toBe(5);
    expect(avaliarNumero('-2 * -3', amb({}))).toBe(6);
    expect(avaliarNumero('--5', amb({}))).toBe(5);
  });

  it('divisão só com arredondamento explícito', () => {
    expect(avaliarNumero('div_baixo(10, 3)', amb({}))).toBe(3);
    expect(avaliarNumero('div_cima(10, 3)', amb({}))).toBe(4);
    expect(avaliarNumero('div_proximo(5, 2)', amb({}))).toBe(3);
    expect(avaliarNumero('div_baixo(-10, 3)', amb({}))).toBe(-4);
    expect(avaliarNumero('div_exato(5640, 2)', amb({}))).toBe(2820);
    expect(erro(() => avaliarNumero('div_exato(5, 2)', amb({}))).message).toContain('não é divisível');
    expect(erro(() => avaliarNumero('div_baixo(5, 0)', amb({}))).message).toContain('positivo');
  });

  it('min, max, abs', () => {
    expect(avaliarNumero('min(3, 1, 2)', amb({}))).toBe(1);
    expect(avaliarNumero('max(a, b)', amb({ a: 7, b: 9 }))).toBe(9);
    expect(avaliarNumero('abs(0 - 4)', amb({}))).toBe(4);
  });

  it('condicional e lógica', () => {
    const a = amb({ x: 5, ok: true });
    expect(avaliarNumero('x > 3 ? 1 : 2', a)).toBe(1);
    expect(avaliarNumero('x > 3 && !ok ? 1 : x == 5 || falso ? 2 : 3', a)).toBe(2);
    expect(avaliar(analisarExpressao('x >= 5 && x <= 5'), a)).toBe(true);
  });

  it('curto-circuito: o lado não avaliado pode ter variável ausente', () => {
    expect(avaliar(analisarExpressao('falso && naoexiste > 0'), amb({}))).toBe(false);
    expect(avaliarNumero('verdadeiro ? 1 : naoexiste', amb({}))).toBe(1);
  });

  it('soma é exata para qualquer combinação de inteiros', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e9, max: 1e9 }), fc.integer({ min: -1e9, max: 1e9 }), (a, b) => {
        return avaliarNumero('a + b - b', amb({ a, b })) === a;
      }),
    );
  });
});

describe('segurança e erros', () => {
  it('recusa "/" com mensagem que ensina o que usar', () => {
    expect(erro(() => analisarExpressao('L / 2')).message).toContain('div_baixo');
  });

  it('recusa decimais, lembrando a unidade', () => {
    expect(erro(() => analisarExpressao('18.5 + 1')).message).toContain('décimos de milímetro');
  });

  it('não dá acesso a nada do JavaScript', () => {
    for (const t of ['constructor', '__proto__', 'toString', 'globalThis', 'process']) {
      expect(erro(() => avaliarNumero(t, amb({ L: 1 }))).message).toContain('não definida');
    }
    expect(erro(() => analisarExpressao('constructor(1)')).message).toContain('Função desconhecida');
    expect(erro(() => analisarExpressao('L["x"]')).message).toContain('Caractere inesperado');
    expect(erro(() => analisarExpressao('a.b')).message).toContain('Caractere inesperado');
  });

  it('recusa mistura de número com verdadeiro/falso', () => {
    expect(erro(() => avaliarNumero('verdadeiro + 1', amb({}))).message).toContain('Esperava um número');
    expect(erro(() => avaliarNumero('1 ? 2 : 3', amb({}))).message).toContain('verdadeiro/falso');
    expect(erro(() => avaliarNumero('x > 1', amb({ x: 2 }))).message).toContain('Esperava um número');
  });

  it('recusa estouro de inteiro seguro', () => {
    expect(erro(() => avaliarNumero('a * a', amb({ a: 2 ** 30 }))).message).toContain('limite');
    expect(erro(() => analisarExpressao('99999999999999999999')).message).toContain('grande demais');
  });

  it('aponta a posição do erro de sintaxe', () => {
    expect(erro(() => analisarExpressao('L - * 2')).posicao).toBe(4);
    expect(erro(() => analisarExpressao('(L - 2')).message).toContain('Esperava ")"');
    expect(erro(() => analisarExpressao('L 2')).message).toContain('Sobrou texto');
    expect(erro(() => analisarExpressao('a < b < c')).message).toContain('encadeadas');
    expect(erro(() => analisarExpressao('min(1)')).message).toContain('pelo menos 2');
    expect(erro(() => analisarExpressao('min')).message).toContain('é uma função');
    expect(erro(() => analisarExpressao('   ')).message).toContain('vazia');
  });

  it('recusa aninhamento excessivo em vez de estourar a pilha', () => {
    expect(erro(() => analisarExpressao('('.repeat(500) + '1' + ')'.repeat(500))).message).toMatch(/aninhada|longa/);
    expect(erro(() => analisarExpressao('-'.repeat(150) + '1')).message).toContain('aninhada');
  });
});

describe('variaveisDe()', () => {
  it('lista as dependências, incluindo dentro de funções e condicionais', () => {
    const no = analisarExpressao('ok ? max(L - 2*e, c) : div_baixo(Hi, 2)');
    expect([...variaveisDe(no)].sort()).toEqual(['Hi', 'L', 'c', 'e', 'ok']);
  });
});
