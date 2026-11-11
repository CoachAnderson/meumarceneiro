import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ErroPecas,
  area,
  calcularModulo,
  comprimentoDeFita,
  descreverBordas,
  gerarListaPecas,
  gerarPecas,
  mm,
  modeloPadrao,
  type EntradaModulo,
  type Dmm,
} from '../src';

const RUNS = Number(process.env.FC_RUNS ?? 200);

const REF: EntradaModulo = {
  L: mm(600),
  A: mm(700),
  P: mm(550),
  espessuraEstrutura: mm(18),
  espessuraFundo: mm(6),
  parametros: { c: 80, g: 10, r: 100, fl: 10, ft: 20, rfp: 120 },
  interior: { divisorias: 0, prateleiras: { quantidade: 2, tipo: 'regulavel' } },
};

function gerar(montagem = 'tampo_base_entre_laterais', fundo = 'fundo_canal', entrada: Partial<EntradaModulo> = {}, opcoes = {}) {
  const e = { ...REF, ...entrada };
  const resultado = calcularModulo(modeloPadrao(montagem, fundo), e);
  return gerarListaPecas({ resultado, montagem, fundo, espessuraFundo: e.espessuraFundo, opcoes });
}

describe('lista de peças: caso de referência (conferido à mão)', () => {
  const lista = gerar();
  const porNome = Object.fromEntries(lista.itens.map((i) => [i.nome, i]));

  it('agrupa peças iguais e numera os itens', () => {
    expect(lista.itens.map((i) => [i.codigo, i.nome, i.quantidade])).toEqual([
      // Laterais espelhadas: a furação de pino fica em faces opostas, então são peças diferentes.
      ['P01', 'Lateral esquerda', 1],
      ['P02', 'Lateral direita', 1],
      ['P03', 'Tampo', 1],
      ['P04', 'Base', 1],
      ['P05', 'Fundo', 1],
      ['P06', 'Prateleira regulável', 2],
    ]);
    expect(lista.totalPecas).toBe(7);
  });

  it('fita só na frente; fundo sem fita', () => {
    expect(descreverBordas(porNome['Lateral esquerda']!.bordas)).toBe('frente');
    expect(descreverBordas(porNome['Fundo']!.bordas)).toBe('sem fita');
  });

  it('fita total: 2×700 + 2×564 + 2×562 = 3652 mm', () => {
    expect(lista.fitaDmm).toBe(36520);
  });

  it('veio: estrutura sim, fundo não (pode girar)', () => {
    expect(porNome['Lateral esquerda']!.veio).toBe(true);
    expect(porNome['Fundo']!.veio).toBe(false);
  });

  it('canal do fundo: laterais, tampo e base; 6 mm de largura, 8 de fundo, a 10 mm da traseira', () => {
    const u = porNome['Lateral esquerda']!.usinagens;
    expect(u.map((x) => x.tipo)).toEqual(['canal_fundo', 'furos']);
    expect(u[0]).toMatchObject({ tipo: 'canal_fundo', largura: mm(6), profundidade: mm(8), distanciaTras: mm(10), comprimento: mm(700) });
    expect(porNome['Prateleira regulável']!.usinagens).toEqual([]);
    expect(porNome['Tampo']!.usinagens.map((x) => x.tipo)).toEqual(['canal_fundo']);
    expect(porNome['Fundo']!.usinagens).toEqual([]);
  });

  it('área por material, em inteiros', () => {
    const t = lista.porMaterial.find((m) => m.material === 'estrutura')!;
    // 2×700×550 + 2×564×550 + 2×562×520 (mm²) = 770000 + 620400 + 584480
    expect(t.area).toBe((770000 + 620400 + 584480) * 100);
    expect(t.pecas).toBe(6);
  });
});

describe('montagens e fundos', () => {
  it('tampo sobre laterais leva fita na frente e nas duas pontas', () => {
    const l = gerar('tampo_sobre_laterais', 'fundo_sobreposto', { interior: { divisorias: 0 }, parametros: { rfp: 120 } });
    const tampo = l.itens.find((i) => i.papel === 'tampo')!;
    expect(descreverBordas(tampo.bordas)).toBe('frente, ponta 1, ponta 2');
    // frente 1 × (L + 2al) + 2 pontas × (P + af)
    expect(comprimentoDeFita(tampo)).toBe(tampo.comprimento + 2 * tampo.largura);
  });

  it('fundo sobreposto e embutido não geram usinagem', () => {
    for (const f of ['fundo_sobreposto', 'fundo_embutido']) {
      const l = gerar('tampo_base_entre_laterais', f, { interior: { divisorias: 0 }, parametros: { rfp: 120 } });
      expect(l.itens.every((i) => i.usinagens.length === 0)).toBe(true);
    }
  });

  it('travessa traseira sem fita; frontal com fita na frente', () => {
    const l = gerar('base_entre_laterais_travessas', 'fundo_sobreposto', { interior: { divisorias: 0 }, parametros: { rfp: 120 } });
    const pecas = gerarPecas({ resultado: calcularModulo(modeloPadrao('base_entre_laterais_travessas', 'fundo_sobreposto'), { ...REF, interior: { divisorias: 0 }, parametros: { rfp: 120 } }), montagem: 'base_entre_laterais_travessas', fundo: 'fundo_sobreposto', espessuraFundo: mm(6) });
    expect(pecas.find((p) => p.id === 'travessa_traseira')!.bordas.frente).toBe(false);
    expect(pecas.find((p) => p.id === 'travessa_frontal')!.bordas.frente).toBe(true);
    expect(l.totalPecas).toBe(pecas.length);
  });

  it('prateleiras de mesma medida em vãos diferentes viram um item só, com nome limpo', () => {
    const l = gerar('tampo_base_entre_laterais', 'fundo_canal', { interior: { divisorias: 1, prateleiras: { quantidade: 2, tipo: 'regulavel' } } });
    const nomes = l.itens.filter((i) => i.papel === 'prateleira_regulavel').map((i) => i.nome);
    expect(nomes).toEqual(['Prateleira regulável']);
    expect(l.itens.find((i) => i.papel === 'prateleira_regulavel')!.quantidade).toBe(4);
  });

  it('divisórias iguais se agrupam', () => {
    const l = gerar('tampo_base_entre_laterais', 'fundo_canal', { interior: { divisorias: 1 } });
    expect(l.itens.find((i) => i.papel === 'divisoria')!.quantidade).toBe(1);
  });
});

describe('opções', () => {
  it('quantidade de módulos multiplica peças, área e fita', () => {
    const um = gerar();
    const tres = gerar(undefined, undefined, {}, { quantidadeModulos: 3 });
    expect(tres.totalPecas).toBe(um.totalPecas * 3);
    expect(tres.fitaDmm).toBe(um.fitaDmm * 3);
    expect(tres.itens.map((i) => i.quantidade)).toEqual(um.itens.map((i) => i.quantidade * 3));
  });

  it('bordas personalizadas por componente', () => {
    const l = gerar(undefined, undefined, {}, { bordas: { tampo: { tras: true } } });
    const t = l.itens.find((i) => i.nome.includes('Tampo'));
    expect(t!.nome).toBe('Tampo');
    expect(descreverBordas(t!.bordas)).toBe('frente, trás');
    expect(l.itens.find((i) => i.nome === 'Base')!.quantidade).toBe(1);
  });

  it('sobra de fita arredonda para cima', () => {
    const l = gerar(undefined, undefined, {}, { sobraFitaPercentual: 10 });
    expect(l.fitaComSobraDmm).toBe(40172); // 36520 × 1,10
    const m = gerar(undefined, undefined, {}, { sobraFitaPercentual: 3 });
    expect(m.fitaComSobraDmm).toBe(Math.ceil((36520 * 103) / 100));
  });

  it('recusa quantidade e sobra inválidas', () => {
    expect(() => gerar(undefined, undefined, {}, { quantidadeModulos: 0 })).toThrow(ErroPecas);
    expect(() => gerar(undefined, undefined, {}, { quantidadeModulos: 1.5 })).toThrow(ErroPecas);
    expect(() => gerar(undefined, undefined, {}, { sobraFitaPercentual: 101 })).toThrow(ErroPecas);
  });

  it('módulo inválido não gera lista', () => {
    const e = { ...REF, L: mm(10) };
    const resultado = calcularModulo(modeloPadrao('tampo_base_entre_laterais', 'fundo_canal'), e);
    expect(resultado.valido).toBe(false);
    expect(() => gerarListaPecas({ resultado, montagem: 'tampo_base_entre_laterais', fundo: 'fundo_canal', espessuraFundo: mm(6) })).toThrow(ErroPecas);
  });
});

describe('propriedades', () => {
  const medida = (min: number, max: number) => fc.integer({ min, max }).map((v) => (v * 10) as Dmm);
  const entrada = fc.record({
    L: medida(300, 2400),
    A: medida(300, 2700),
    P: medida(250, 700),
    divisorias: fc.integer({ min: 0, max: 4 }),
    prat: fc.integer({ min: 0, max: 5 }),
    modulos: fc.integer({ min: 1, max: 20 }),
    montagem: fc.constantFrom('tampo_base_entre_laterais', 'tampo_sobre_laterais', 'base_entre_laterais_travessas'),
    fundo: fc.constantFrom('fundo_sobreposto', 'fundo_canal', 'fundo_embutido'),
  });

  it('agrupar não perde nem inventa nada: peças, área e fita batem com a soma individual', () => {
    fc.assert(
      fc.property(entrada, (v) => {
        const e: EntradaModulo = {
          L: v.L, A: v.A, P: v.P, espessuraEstrutura: mm(18), espessuraFundo: mm(6),
          interior: { divisorias: v.divisorias, prateleiras: { quantidade: v.prat, tipo: 'regulavel' } },
        };
        const resultado = calcularModulo(modeloPadrao(v.montagem, v.fundo), e);
        fc.pre(resultado.valido);
        const base = { resultado, montagem: v.montagem, fundo: v.fundo, espessuraFundo: e.espessuraFundo };
        const pecas = gerarPecas(base);
        const lista = gerarListaPecas({ ...base, opcoes: { quantidadeModulos: v.modulos } });
        const somaPecas = pecas.length * v.modulos;
        const somaFita = pecas.reduce((s, p) => s + comprimentoDeFita(p), 0) * v.modulos;
        const somaArea = pecas.reduce((s, p) => s + area(p.comprimento, p.largura), 0) * v.modulos;
        expect(lista.totalPecas).toBe(somaPecas);
        expect(lista.fitaDmm).toBe(somaFita);
        expect(lista.porMaterial.reduce((s, m) => s + m.area, 0)).toBe(somaArea);
        expect(lista.itens.reduce((s, i) => s + i.ids.length, 0)).toBe(somaPecas);
        expect(new Set(lista.itens.map((i) => i.codigo)).size).toBe(lista.itens.length);
      }),
      { numRuns: RUNS },
    );
  });
});
