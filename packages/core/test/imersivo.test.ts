import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ABERTURA_PORTA,
  calcularModulo,
  cenaImersiva,
  comodoDaMedicao,
  lerCenaImersiva,
  mm,
  modeloPadrao,
  movimentosDoMovel,
  novaMedicao,
  type EntradaModulo,
  type FrenteDoVao,
} from '../src';

const BASE: EntradaModulo = { L: mm(900), A: mm(700), P: mm(550), espessuraEstrutura: mm(18), espessuraFundo: mm(6), parametros: { c: 80, g: 10, r: 100 } };

function movel(vaos: FrenteDoVao[], divisorias = vaos.length - 1) {
  const r = calcularModulo(modeloPadrao('tampo_base_entre_laterais', 'fundo_canal'), {
    ...BASE,
    interior: { divisorias },
    frentes: { modo: 'sobreposta', espessuraFrente: mm(18), espessuraGaveta: mm(15), vaos, puxador: true },
  });
  expect(r.valido).toBe(true);
  return r.componentes;
}

describe('portas giram na linha das dobradiças', () => {
  it('porta com dobradiça à direita: eixo na borda direita, atrás da porta', () => {
    const c = movel([{ tipo: 'porta', portas: 1, lado: 'direita' }, { tipo: 'aberto' }]);
    const [p] = movimentosDoMovel(c).filter((v) => v.tipo === 'porta');
    // Móvel de 900 mm centrado: a porta vai de x = −435 a +12 mm (sobreposta, folgas de 1,5 mm).
    const porta = c.find((x) => x.id === 'porta_v1')!;
    expect(p).toEqual({ tipo: 'porta', pecas: ['porta_v1'], pivo: [(porta.caixa.x + porta.caixa.dx - 4500) / 10_000, expect.any(Number)], sentido: 1, angulo: ABERTURA_PORTA });
    // A face de trás da porta encosta na frente da caixa (z = profundidade da caixa, 550 mm).
    expect((p as { pivo: [number, number] }).pivo[1]).toBeCloseTo(0.55, 6);
  });

  it('par de portas: a da esquerda gira para um lado e a da direita para o outro', () => {
    const c = movel([{ tipo: 'porta', portas: 2 }], 0);
    const portas = movimentosDoMovel(c).filter((v) => v.tipo === 'porta');
    expect(portas.map((v) => (v.tipo === 'porta' ? v.sentido : 0))).toEqual([-1, 1]);
    const [e, d] = portas as Array<{ pivo: [number, number] }>;
    expect(e!.pivo[0]).toBeLessThan(0);
    expect(d!.pivo[0]).toBeGreaterThan(0);
  });

  it('o lado das dobradiças vem das copas: trocar o lado troca o eixo', () => {
    const esq = movimentosDoMovel(movel([{ tipo: 'porta', portas: 1, lado: 'esquerda' }], 0))[0];
    const dir = movimentosDoMovel(movel([{ tipo: 'porta', portas: 1, lado: 'direita' }], 0))[0];
    expect(esq).toMatchObject({ tipo: 'porta', sentido: -1 });
    expect(dir).toMatchObject({ tipo: 'porta', sentido: 1 });
    expect((esq as { pivo: number[] }).pivo[0]).toBeCloseTo(-(dir as { pivo: number[] }).pivo[0]!, 6);
  });
});

describe('gavetas correm com a caixa delas', () => {
  it('cada frente leva as 5 peças da caixa que está atrás dela, e nenhuma da vizinha', () => {
    const c = movel([{ tipo: 'porta', portas: 1, lado: 'direita' }, { tipo: 'gavetas', gavetas: 3 }]);
    const gavetas = movimentosDoMovel(c).filter((v) => v.tipo === 'gaveta');
    expect(gavetas).toHaveLength(3);
    for (const g of gavetas) {
      expect(g.pecas).toHaveLength(6);
      const prefixo = g.pecas[0]!.replace(/_frente$/, '');
      expect(g.pecas.every((p) => p.startsWith(prefixo))).toBe(true);
    }
    // Nenhuma peça em duas gavetas e nenhuma peça de gaveta sem gaveta.
    const todas = gavetas.flatMap((g) => g.pecas);
    expect(new Set(todas).size).toBe(todas.length);
    const deGaveta = c.filter((x) => /gaveta/.test(x.papel)).map((x) => x.id);
    expect(todas.sort()).toEqual(deGaveta.sort());
  });

  it('o curso é 80% da caixa da gaveta', () => {
    const c = movel([{ tipo: 'gavetas', gavetas: 1 }], 0);
    const g = movimentosDoMovel(c).find((v) => v.tipo === 'gaveta')!;
    const lateral = c.find((x) => x.papel === 'lateral_gaveta')!;
    expect(g.tipo === 'gaveta' && g.curso).toBeCloseTo((lateral.caixa.dz / 10_000) * 0.8, 3);
  });

  it('em qualquer combinação de vãos, sobreposta ou embutida, cada peça de gaveta fica em uma gaveta só', () => {
    const vao = fc.oneof(
      fc.constant<FrenteDoVao>({ tipo: 'aberto' }),
      fc.constantFrom<FrenteDoVao>({ tipo: 'porta', portas: 1, lado: 'esquerda' }, { tipo: 'porta', portas: 1, lado: 'direita' }),
      fc.integer({ min: 1, max: 4 }).map((n): FrenteDoVao => ({ tipo: 'gavetas', gavetas: n })),
    );
    fc.assert(
      fc.property(fc.array(vao, { minLength: 1, maxLength: 3 }), fc.constantFrom('sobreposta' as const, 'embutida' as const), (vaos, modo) => {
        const r = calcularModulo(modeloPadrao('tampo_base_entre_laterais', 'fundo_canal'), {
          ...BASE,
          L: mm(400 * vaos.length + 100),
          interior: { divisorias: vaos.length - 1 },
          frentes: { modo, espessuraFrente: mm(18), espessuraGaveta: mm(15), vaos, puxador: true },
        });
        if (!r.valido) return;
        const gavetas = movimentosDoMovel(r.componentes).filter((v) => v.tipo === 'gaveta');
        const todas = gavetas.flatMap((g) => g.pecas);
        const deGaveta = r.componentes.filter((x) => /gaveta/.test(x.papel)).map((x) => x.id);
        expect(todas.sort()).toEqual(deGaveta.sort());
        for (const g of gavetas) expect(new Set(g.pecas.map((p) => p.replace(/_(frente|lateral_e|lateral_d|contrafrente|traseira|fundo)$/, ''))).size).toBe(1);
      }),
      { numRuns: 60 },
    );
  });

  it('para qualquer número de gavetas, as caixas não se misturam', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), (n) => {
        const c = movel([{ tipo: 'gavetas', gavetas: n }], 0);
        const gavetas = movimentosDoMovel(c).filter((v) => v.tipo === 'gaveta');
        expect(gavetas).toHaveLength(n);
        for (const g of gavetas) expect(g.pecas.filter((p) => p.endsWith('_frente'))).toHaveLength(1);
      }),
      { numRuns: 10 },
    );
  });
});

describe('cena completa e leitura do arquivo', () => {
  it('a cena tem as mesmas peças do "ver no ambiente", com o material de cada uma', () => {
    const c = movel([{ tipo: 'porta', portas: 2 }], 0);
    const cena = cenaImersiva(c);
    expect(cena.pecas.map((p) => p.id)).toEqual(c.map((x) => x.id));
    expect(cena.pecas.find((p) => p.id === 'porta_v1_1')?.material).toBe('frente');
    expect(cena.dimensoes[0]).toBeCloseTo(0.9, 6);
    expect(lerCenaImersiva(JSON.parse(JSON.stringify(cena)))).toEqual(cena);
  });

  it('recusa arquivo estragado ou malicioso', () => {
    const cena = cenaImersiva(movel([{ tipo: 'porta', portas: 1, lado: 'esquerda' }], 0));
    const ok = JSON.parse(JSON.stringify(cena));
    expect(lerCenaImersiva(null)).toBeNull();
    expect(lerCenaImersiva({ ...ok, versao: 2 })).toBeNull();
    expect(lerCenaImersiva({ ...ok, pecas: [] })).toBeNull();
    expect(lerCenaImersiva({ ...ok, pecas: [{ ...ok.pecas[0], centro: [0, Infinity, 0] }] })).toBeNull();
    expect(lerCenaImersiva({ ...ok, pecas: [{ ...ok.pecas[0], papel: '<script>' }] })).toBeNull();
    expect(lerCenaImersiva({ ...ok, movimentos: [{ tipo: 'gaveta', pecas: ['nao_existe'], curso: 0.3 }] })).toBeNull();
    expect(lerCenaImersiva({ ...ok, movimentos: [{ tipo: 'porta', pecas: [ok.pecas[0].id], pivo: [0, 0], sentido: 2, angulo: 90 }] })).toBeNull();
    expect(lerCenaImersiva({ ...ok, pecas: [ok.pecas[0], ok.pecas[0]] })).toBeNull();
    expect(lerCenaImersiva({ ...ok, comodo: { largura: 100, altura: null, anguloEsquerdo: null, anguloDireito: null, profundidade: null, posicaoMovel: 0, pontos: [] } })).toBeNull();
  });
});

describe('cômodo da medição', () => {
  function medicao() {
    const d = novaMedicao('a');
    const p = d.paredes[0]!;
    p.larguras = { baixo: mm(2430), meio: mm(2418), alto: mm(2425) };
    p.alturas = { esquerda: mm(2600), meio: mm(2592), direita: mm(2598) };
    p.cantoEsquerdo = { naParede: mm(600), naVizinha: mm(800), diagonal: mm(1000) };
    p.pontos = [
      { id: 't', tipo: 'tomada', x: mm(300), y: mm(1100), largura: null, altura: null, saliencia: null, observacao: 'atrás da cama' },
      { id: 'j', tipo: 'janela', x: mm(1500), y: mm(1000), largura: mm(800), altura: mm(1200), saliencia: null, observacao: '' },
      { id: 'r', tipo: 'rodape', x: null, y: null, largura: null, altura: mm(70), saliencia: mm(15), observacao: '' },
      { id: 's', tipo: 'interruptor', x: null, y: mm(1100), largura: null, altura: null, saliencia: null, observacao: '' },
    ];
    d.ambiente = 'Quarto do casal';
    d.profundidadeLivre = mm(1800);
    return d;
  }

  it('usa só o que foi medido: menor largura e altura, canto pelo 3-4-5, pontos em metros', () => {
    const r = comodoDaMedicao({ medicao: medicao(), paredeId: 'a', posicao: mm(100) }, mm(900));
    expect(r.erros).toEqual([]);
    expect(r.comodo).toEqual({
      largura: 2.418,
      altura: 2.592,
      anguloEsquerdo: 90,
      anguloDireito: null,
      profundidade: 1.8,
      posicaoMovel: 0.1,
      pontos: [
        { tipo: 'tomada', x: 0.3, y: 1.1, largura: 0, altura: 0, saliencia: 0 },
        { tipo: 'janela', x: 1.5, y: 1, largura: 0.8, altura: 1.2, saliencia: 0 },
        { tipo: 'rodape', x: 0, y: 0, largura: 2.418, altura: 0.07, saliencia: 0.015 },
      ],
    });
  });

  it('não leva nome do ambiente nem observações (o arquivo é público)', () => {
    const r = comodoDaMedicao({ medicao: medicao(), paredeId: 'a', posicao: null }, mm(900));
    const texto = JSON.stringify(r.comodo);
    expect(texto).not.toContain('Quarto');
    expect(texto).not.toContain('cama');
  });

  it('sem posição, o móvel fica no meio da parede', () => {
    const r = comodoDaMedicao({ medicao: medicao(), paredeId: 'a', posicao: null }, mm(900));
    expect(r.comodo!.posicaoMovel).toBeCloseTo((2.418 - 0.9) / 2, 6);
  });

  it('avisa quando o móvel passa da parede e recusa parede sem largura', () => {
    expect(comodoDaMedicao({ medicao: medicao(), paredeId: 'a', posicao: mm(2000) }, mm(900)).avisos[0]?.codigo).toBe('nao_cabe');
    const d = novaMedicao('a');
    expect(comodoDaMedicao({ medicao: d, paredeId: 'a', posicao: null }, mm(900))).toMatchObject({ comodo: null, erros: [{ codigo: 'sem_largura' }] });
    expect(comodoDaMedicao({ medicao: d, paredeId: 'x', posicao: null }, mm(900)).erros[0]?.codigo).toBe('sem_parede');
  });

  it('a cena com cômodo passa pela leitura sem perder nada', () => {
    const c = movel([{ tipo: 'gavetas', gavetas: 2 }], 0);
    const cena = cenaImersiva(c, comodoDaMedicao({ medicao: medicao(), paredeId: 'a', posicao: null }, mm(900)).comodo);
    expect(lerCenaImersiva(JSON.parse(JSON.stringify(cena)))).toEqual(cena);
  });
});
