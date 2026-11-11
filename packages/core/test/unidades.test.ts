import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ErroMedida,
  area,
  dividir,
  distribuir,
  dmm,
  emM2,
  exigirEntre,
  exigirPositiva,
  formatarMm,
  lerMm,
  mm,
  multiplicar,
  somar,
  subtrair,
  type Dmm,
} from '../src';

/** Medidas realistas de marcenaria: −10 m a +10 m, em décimos de mm. */
const medida = fc.integer({ min: -100_000, max: 100_000 }).map((v) => dmm(v));
const medidaPositiva = fc.integer({ min: 1, max: 100_000 }).map((v) => dmm(v));

function codigoDoErro(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErroMedida) return e.codigo;
    throw e;
  }
  return undefined;
}

describe('mm()', () => {
  it('converte milímetros para décimos de milímetro', () => {
    expect(mm(18)).toBe(180);
    expect(mm(18.5)).toBe(185);
    expect(mm(2750)).toBe(27500);
    expect(mm(3.2)).toBe(32);
    expect(mm(0.1)).toBe(1);
    expect(mm(-6)).toBe(-60);
  });

  it('rejeita mais de uma casa decimal', () => {
    expect(codigoDoErro(() => mm(18.55))).toBe('PRECISAO');
    expect(codigoDoErro(() => mm(0.05))).toBe('PRECISAO');
  });

  it('rejeita valores não finitos', () => {
    expect(codigoDoErro(() => mm(Number.NaN))).toBe('NAO_NUMERICO');
    expect(codigoDoErro(() => mm(Number.POSITIVE_INFINITY))).toBe('NAO_NUMERICO');
  });

  it('normaliza -0 para 0', () => {
    expect(Object.is(mm(-0), 0)).toBe(true);
  });
});

describe('dmm()', () => {
  it('aceita só inteiros seguros', () => {
    expect(dmm(185)).toBe(185);
    expect(codigoDoErro(() => dmm(18.5))).toBe('FORA_DA_FAIXA_SEGURA');
    expect(codigoDoErro(() => dmm(Number.MAX_SAFE_INTEGER + 1))).toBe('FORA_DA_FAIXA_SEGURA');
  });
});

describe('lerMm()', () => {
  it('aceita vírgula ou ponto como separador decimal', () => {
    expect(lerMm('18')).toBe(180);
    expect(lerMm('18,5')).toBe(185);
    expect(lerMm('18.5')).toBe(185);
    expect(lerMm('18,50')).toBe(185);
    expect(lerMm(' 600 mm ')).toBe(6000);
    expect(lerMm('2750')).toBe(27500);
    expect(lerMm('-6')).toBe(-60);
  });

  it('rejeita precisão maior que 0,1 mm', () => {
    expect(codigoDoErro(() => lerMm('18,55'))).toBe('PRECISAO');
  });

  it('rejeita separador de milhar, que seria lido como decimal', () => {
    expect(codigoDoErro(() => lerMm('2.750'))).toBe('AMBIGUO');
    expect(codigoDoErro(() => lerMm('2,700'))).toBe('AMBIGUO');
  });

  it('rejeita textos que não são medidas', () => {
    for (const texto of ['', 'abc', '1.234,5', '18,', ',5', '1e3', '18 cm']) {
      expect(codigoDoErro(() => lerMm(texto))).toBe('FORMATO');
    }
  });
});

describe('formatarMm()', () => {
  it('formata no padrão brasileiro, sem separador de milhar', () => {
    expect(formatarMm(dmm(180))).toBe('18');
    expect(formatarMm(dmm(185))).toBe('18,5');
    expect(formatarMm(dmm(27500))).toBe('2750');
    expect(formatarMm(dmm(-5))).toBe('-0,5');
    expect(formatarMm(dmm(32), { unidade: true })).toBe('3,2 mm');
  });

  it('ida e volta: lerMm(formatarMm(x)) = x', () => {
    fc.assert(fc.property(medida, (x) => lerMm(formatarMm(x)) === x));
  });
});

describe('aritmética exata', () => {
  it('largura interna do módulo de exemplo: 600 − 2 × 18 = 564', () => {
    const largura = mm(600);
    const espessura = mm(18);
    expect(subtrair(largura, multiplicar(espessura, 2))).toBe(mm(564));
  });

  it('soma é associativa e comutativa, sem erro acumulado', () => {
    fc.assert(
      fc.property(fc.array(medida, { maxLength: 200 }), (lista) => {
        const ida = somar(...lista);
        const volta = somar(...[...lista].reverse());
        return ida === volta && Number.isSafeInteger(ida);
      }),
    );
  });

  it('subtrair desfaz somar', () => {
    fc.assert(fc.property(medida, medida, (a, b) => subtrair(somar(a, b), b) === a));
  });

  it('multiplicar exige fator inteiro', () => {
    expect(codigoDoErro(() => multiplicar(dmm(180), 1.5))).toBe('FORA_DA_FAIXA_SEGURA');
  });
});

describe('dividir()', () => {
  it('arredonda conforme o modo pedido', () => {
    expect(dividir(dmm(10), 3, 'baixo')).toBe(3);
    expect(dividir(dmm(10), 3, 'cima')).toBe(4);
    expect(dividir(dmm(10), 3, 'proximo')).toBe(3);
    expect(dividir(dmm(5), 2, 'proximo')).toBe(3);
    expect(dividir(dmm(-10), 3, 'baixo')).toBe(-4);
    expect(dividir(dmm(-10), 3, 'cima')).toBe(-3);
    expect(dividir(dmm(12), 3, 'exato')).toBe(4);
  });

  it('modo exato recusa divisão com resto', () => {
    expect(codigoDoErro(() => dividir(dmm(10), 3, 'exato'))).toBe('DIVISAO_NAO_EXATA');
  });

  it('recusa divisor zero, negativo ou fracionário', () => {
    for (const d of [0, -2, 1.5]) {
      expect(codigoDoErro(() => dividir(dmm(10), d, 'baixo'))).toBe('DIVISOR_INVALIDO');
    }
  });

  it('baixo ≤ x/n ≤ cima, e diferem no máximo em 1', () => {
    fc.assert(
      fc.property(medida, fc.integer({ min: 1, max: 1000 }), (x, n) => {
        const baixo = dividir(x, n, 'baixo');
        const cima = dividir(x, n, 'cima');
        const proximo = dividir(x, n, 'proximo');
        return (
          baixo * n <= x &&
          cima * n >= x &&
          cima - baixo <= 1 &&
          proximo >= baixo &&
          proximo <= cima &&
          Math.abs(proximo * n - x) * 2 <= n
        );
      }),
    );
  });
});

describe('distribuir()', () => {
  it('reparte o resto nas primeiras partes', () => {
    expect(distribuir(dmm(1000), 3)).toEqual([334, 333, 333]);
    expect(distribuir(dmm(5640), 2)).toEqual([2820, 2820]);
    expect(distribuir(dmm(0), 4)).toEqual([0, 0, 0, 0]);
  });

  it('a soma das partes é exatamente o total, e as partes diferem no máximo 0,1 mm', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }).map((v) => dmm(v)),
        fc.integer({ min: 1, max: 50 }),
        (total, n) => {
          const partes = distribuir(total, n);
          const maior = Math.max(...partes);
          const menor = Math.min(...partes);
          return partes.length === n && somar(...partes) === total && maior - menor <= 1;
        },
      ),
    );
  });

  it('vãos entre divisórias fecham exatamente na largura interna', () => {
    // Largura interna 564 mm, 2 divisórias de 18 mm → 3 vãos.
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 30000 }).map((v) => dmm(v)),
        fc.integer({ min: 0, max: 10 }),
        fc.constantFrom(60, 90, 150, 180, 250).map((v) => dmm(v)),
        (larguraInterna, divisorias, espessura) => {
          const util = subtrair(larguraInterna, multiplicar(espessura, divisorias));
          fc.pre(util >= 0);
          const vaos = distribuir(util, divisorias + 1);
          return somar(...vaos, multiplicar(espessura, divisorias)) === larguraInterna;
        },
      ),
    );
  });

  it('recusa total negativo e quantidade inválida', () => {
    expect(codigoDoErro(() => distribuir(dmm(-1), 2))).toBe('FORA_DOS_LIMITES');
    expect(codigoDoErro(() => distribuir(dmm(10), 0))).toBe('DIVISOR_INVALIDO');
  });
});

describe('area()', () => {
  it('calcula área de chapa inteira sem perder precisão', () => {
    const chapa = area(mm(2750), mm(1850));
    expect(chapa).toBe(27500 * 18500);
    expect(emM2(chapa)).toBeCloseTo(5.0875, 10);
  });

  it('é sempre um inteiro seguro para medidas de chapa', () => {
    fc.assert(
      fc.property(medidaPositiva, medidaPositiva, (c, l) => Number.isSafeInteger(area(c, l))),
    );
  });
});

describe('validação de limites', () => {
  it('exigirEntre aceita o intervalo fechado e recusa fora dele', () => {
    const min = mm(100);
    const max = mm(2750);
    expect(exigirEntre(mm(100), min, max, 'Largura')).toBe(1000);
    expect(exigirEntre(mm(2750), min, max, 'Largura')).toBe(27500);
    expect(codigoDoErro(() => exigirEntre(mm(99.9), min, max, 'Largura'))).toBe('FORA_DOS_LIMITES');
  });

  it('exigirPositiva recusa zero e negativos com mensagem em português', () => {
    expect(() => exigirPositiva(dmm(0) as Dmm, 'Altura')).toThrow('Altura deve ser maior que zero');
    expect(codigoDoErro(() => exigirPositiva(dmm(-1), 'Altura'))).toBe('FORA_DOS_LIMITES');
  });
});
