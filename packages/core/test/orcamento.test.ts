import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ErroOrcamento, calcularOrcamento, type EntradaOrcamento } from '../src';

const BASE: EntradaOrcamento = {
  chapas: [{ descricao: 'MDF Branco 18 mm 2750 × 1850', quantidade: 2, precoCentavos: 32990 }],
  fitas: [{ descricao: 'Fita Branco 22 × 0,45', comprimentoDmm: 164500, precoMetroCentavos: 89 }],
  ferragens: [
    { descricao: 'Dobradiça reta', quantidade: 2, precoCentavos: 690 },
    { descricao: 'Corrediça 500', quantidade: 3, precoCentavos: 3290 },
  ],
  maoDeObra: { minutos: 150, valorHoraCentavos: 6000 },
  outros: [{ descricao: 'Frete', valorCentavos: 8000 }],
  margemCentesimos: 3500,
  descontoCentesimos: 500,
};

describe('calcularOrcamento(): caso conferido à mão', () => {
  const o = calcularOrcamento(BASE);

  it('custo de cada linha', () => {
    expect(o.linhas.map((l) => [l.descricao, l.quantidade, l.custoCentavos])).toEqual([
      ['MDF Branco 18 mm 2750 × 1850', '2 chapas', 65980],
      // 16,45 m × R$ 0,89 = R$ 14,6405 → para cima: R$ 14,65
      ['Fita Branco 22 × 0,45', '16,45 m', 1465],
      ['Dobradiça reta', '2 un', 1380],
      ['Corrediça 500', '3 un', 9870],
      // 2 h 30 × R$ 60 = R$ 150
      ['Mão de obra', '2 h 30 min', 15000],
      ['Frete', '', 8000],
    ]);
  });

  it('custo, margem de 35%, desconto de 5% e total', () => {
    expect(o.custoCentavos).toBe(101695); // R$ 1.016,95
    expect(o.margemCentavos).toBe(35593); // 355,9325 → 355,93
    expect(o.precoCentavos).toBe(137288);
    expect(o.descontoCentavos).toBe(6864); // 68,644 → 68,64
    expect(o.totalCentavos).toBe(130424);
    expect(o.lucroCentavos).toBe(28729);
    expect(o.pendencias).toEqual([]);
  });

  it('custo por categoria soma o custo total', () => {
    expect(o.custoPorCategoria).toEqual({ chapa: 65980, fita: 1465, ferragem: 11250, mao_de_obra: 15000, outro: 8000 });
  });
});

describe('regras', () => {
  it('item sem preço fica fora da soma e vira pendência', () => {
    const o = calcularOrcamento({ ...BASE, ferragens: [{ descricao: 'Puxador cava', quantidade: 4, precoCentavos: null }] });
    expect(o.pendencias).toEqual(['Puxador cava: sem preço no cadastro.']);
    expect(o.linhas.find((l) => l.descricao === 'Puxador cava')!.custoCentavos).toBeNull();
    expect(o.custoPorCategoria.ferragem).toBe(0);
  });

  it('quantidade zero não gera linha', () => {
    const o = calcularOrcamento({ ...BASE, chapas: [{ descricao: 'X', quantidade: 0, precoCentavos: null }] });
    expect(o.linhas.some((l) => l.descricao === 'X')).toBe(false);
    expect(o.pendencias).toEqual([]);
  });

  it('fita: fração de centavo sempre para cima', () => {
    const o = calcularOrcamento({ chapas: [], ferragens: [], fitas: [{ descricao: 'F', comprimentoDmm: 1, precoMetroCentavos: 1 }], margemCentesimos: 0 });
    expect(o.custoCentavos).toBe(1);
  });

  it('desconto de 100% zera o total; lucro fica negativo', () => {
    const o = calcularOrcamento({ ...BASE, descontoCentesimos: 10000 });
    expect(o.totalCentavos).toBe(0);
    expect(o.lucroCentavos).toBe(-o.custoCentavos);
  });

  it('entradas inválidas', () => {
    expect(() => calcularOrcamento({ ...BASE, margemCentesimos: -1 })).toThrow(ErroOrcamento);
    expect(() => calcularOrcamento({ ...BASE, descontoCentesimos: 10001 })).toThrow(ErroOrcamento);
    expect(() => calcularOrcamento({ ...BASE, chapas: [{ descricao: 'X', quantidade: 1.5, precoCentavos: 1 }] })).toThrow(ErroOrcamento);
    expect(() => calcularOrcamento({ ...BASE, outros: [{ descricao: 'X', valorCentavos: -1 }] })).toThrow(ErroOrcamento);
  });
});

describe('propriedades', () => {
  it('custo acima de R$ 100 milhões é recusado, não calculado errado', () => {
    expect(() => calcularOrcamento({ chapas: [{ descricao: 'c', quantidade: 100_000, precoCentavos: 1_000_000 }], fitas: [], ferragens: [], margemCentesimos: 0 })).toThrow(ErroOrcamento);
  });

  const dinheiro = fc.integer({ min: 0, max: 200_000 }); // até R$ 2.000 por item
  const arb = fc.record({
    chapas: fc.array(fc.record({ descricao: fc.constant('c'), quantidade: fc.integer({ min: 0, max: 200 }), precoCentavos: fc.option(dinheiro, { nil: null }) }), { maxLength: 4 }),
    fitas: fc.array(fc.record({ descricao: fc.constant('f'), comprimentoDmm: fc.integer({ min: 0, max: 10_000_000 }), precoMetroCentavos: fc.option(dinheiro, { nil: null }) }), { maxLength: 3 }),
    ferragens: fc.array(fc.record({ descricao: fc.constant('h'), quantidade: fc.integer({ min: 0, max: 5000 }), precoCentavos: fc.option(dinheiro, { nil: null }) }), { maxLength: 6 }),
    maoDeObra: fc.record({ minutos: fc.integer({ min: 0, max: 100_000 }), valorHoraCentavos: dinheiro }),
    margemCentesimos: fc.integer({ min: 0, max: 30_000 }),
    descontoCentesimos: fc.integer({ min: 0, max: 10_000 }),
  });

  it('totais são inteiros e batem com a soma das linhas', () => {
    fc.assert(
      fc.property(arb, (e) => {
        const o = calcularOrcamento(e);
        const soma = o.linhas.reduce((s, l) => s + (l.custoCentavos ?? 0), 0);
        expect(o.custoCentavos).toBe(soma);
        for (const v of [o.custoCentavos, o.margemCentavos, o.precoCentavos, o.descontoCentavos, o.totalCentavos]) {
          expect(Number.isSafeInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
        }
        expect(o.precoCentavos).toBe(o.custoCentavos + o.margemCentavos);
        expect(o.totalCentavos).toBe(o.precoCentavos - o.descontoCentavos);
        expect(o.totalCentavos).toBeLessThanOrEqual(o.precoCentavos);
        expect(o.pendencias.length).toBe(o.linhas.filter((l) => l.custoCentavos === null).length);
      }),
    );
  });

  it('mais margem nunca dá preço menor', () => {
    fc.assert(
      fc.property(arb, fc.integer({ min: 0, max: 5000 }), (e, extra) => {
        const a = calcularOrcamento(e);
        const b = calcularOrcamento({ ...e, margemCentesimos: e.margemCentesimos + extra });
        expect(b.precoCentavos).toBeGreaterThanOrEqual(a.precoCentavos);
      }),
    );
  });
});
