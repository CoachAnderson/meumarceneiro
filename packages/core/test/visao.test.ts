import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { FERRAMENTA_VISAO, calcularModulo, largurasPorProporcao, mm, modeloPadrao, pedidoVisao, validarLeitura } from '../src';

/** Uma resposta bem formada, como a IA devolveria para um gabinete de porta + gaveteiro. */
const BOA = {
  tipo_de_movel: 'Gabinete de cozinha com porta e gaveteiro',
  montagem: 'base_entre_laterais_travessas',
  modo_frente: 'sobreposta',
  largura_mm: 800,
  altura_mm: 720,
  profundidade_mm: 550,
  origem_das_medidas: 'parciais',
  confianca: 'alta',
  vaos: [
    { proporcao_largura: 1, frente: 'porta', portas: 1, lado_dobradicas: 'esquerda', gavetas: 0, prateleiras: 1 },
    { proporcao_largura: 1, frente: 'gavetas', portas: 0, lado_dobradicas: 'nao_se_aplica', gavetas: 3, prateleiras: 0 },
  ],
  observacoes: ['Porta fechada: prateleira estimada.'],
  nao_representado: ['Rodapé recuado', 'Tampo de granito'],
};

describe('validarLeitura()', () => {
  it('resposta boa vira leitura, com medidas em décimos de mm', () => {
    const r = validarLeitura(BOA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.leitura).toMatchObject({ largura: mm(800), altura: mm(720), profundidade: mm(550), montagem: 'base_entre_laterais_travessas', origemMedidas: 'parciais', ajustes: [] });
    expect(r.leitura.vaos).toEqual([
      { proporcao: 1, frente: 'porta', portas: 1, lado: 'esquerda', gavetas: 3, prateleiras: 1 },
      { proporcao: 1, frente: 'gavetas', portas: 1, lado: 'esquerda', gavetas: 3, prateleiras: 0 },
    ]);
    expect(r.leitura.naoRepresentado).toEqual(['Rodapé recuado', 'Tampo de granito']);
  });

  it('recusa o que não dá para aproveitar', () => {
    for (const ruim of [null, 'texto', [], { ...BOA, montagem: 'inventada' }, { ...BOA, modo_frente: 'de correr' }, { ...BOA, largura_mm: 80000 }, { ...BOA, altura_mm: 12.5 }, { ...BOA, profundidade_mm: '550' }, { ...BOA, vaos: [] }, { ...BOA, vaos: Array(8).fill(BOA.vaos[0]) }, { ...BOA, vaos: [1] }]) {
      expect(validarLeitura(ruim).ok, JSON.stringify(ruim)?.slice(0, 60)).toBe(false);
    }
  });

  it('corrige incoerências pequenas e avisa', () => {
    const r = validarLeitura({
      ...BOA,
      vaos: [
        { proporcao_largura: 0, frente: 'porta', portas: 3, lado_dobradicas: 'direita', gavetas: 0, prateleiras: 40 },
        { proporcao_largura: 1, frente: 'gavetas', portas: 0, lado_dobradicas: 'x', gavetas: 12, prateleiras: 2 },
        { proporcao_largura: 1, frente: 'cortina', portas: 0, lado_dobradicas: 'x', gavetas: 0, prateleiras: -3 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.leitura.vaos).toEqual([
      { proporcao: 1, frente: 'porta', portas: 1, lado: 'direita', gavetas: 3, prateleiras: 10 },
      { proporcao: 1, frente: 'gavetas', portas: 1, lado: 'esquerda', gavetas: 8, prateleiras: 0 },
      { proporcao: 1, frente: 'aberto', portas: 1, lado: 'esquerda', gavetas: 3, prateleiras: 0 },
    ]);
    expect(r.leitura.ajustes).toHaveLength(6);
  });

  it('textos da IA são limpos e limitados (nada de texto gigante na tela)', () => {
    const r = validarLeitura({ ...BOA, tipo_de_movel: '  A\n\nB  ' + 'x'.repeat(500), observacoes: [...Array(20).fill('ok'), 7, ''], nao_representado: 'não é lista' });
    if (!r.ok) throw new Error('deveria validar');
    expect(r.leitura.tipo.length).toBe(120);
    expect(r.leitura.tipo.startsWith('A B')).toBe(true);
    expect(r.leitura.observacoes).toHaveLength(6);
    expect(r.leitura.naoRepresentado).toEqual([]);
  });

  it('campos de confiança desconhecidos caem no mais cauteloso', () => {
    const r = validarLeitura({ ...BOA, confianca: 'altíssima', origem_das_medidas: 'medi com laser' });
    if (!r.ok) throw new Error('deveria validar');
    expect([r.leitura.confianca, r.leitura.origemMedidas]).toEqual(['baixa', 'estimadas']);
  });

  it('qualquer entrada: nunca lança, e leitura aceita sempre roda no motor sem erro de formato', () => {
    const vao = fc.record({
      proporcao_largura: fc.oneof(fc.integer({ min: -5, max: 200 }), fc.constant('x')),
      frente: fc.constantFrom('aberto', 'porta', 'gavetas', 'outra'),
      portas: fc.integer({ min: -1, max: 5 }),
      lado_dobradicas: fc.constantFrom('esquerda', 'direita', 'nao_se_aplica'),
      gavetas: fc.integer({ min: -2, max: 20 }),
      prateleiras: fc.integer({ min: -2, max: 30 }),
    });
    const arb = fc.record({
      tipo_de_movel: fc.string(),
      montagem: fc.constantFrom(...FERRAMENTA_VISAO.input_schema.properties.montagem.enum, 'x'),
      modo_frente: fc.constantFrom('sobreposta', 'embutida', 'x'),
      largura_mm: fc.integer({ min: -100, max: 9000 }),
      altura_mm: fc.integer({ min: -100, max: 4000 }),
      profundidade_mm: fc.integer({ min: -100, max: 2000 }),
      origem_das_medidas: fc.string(),
      confianca: fc.string(),
      vaos: fc.array(vao, { maxLength: 9 }),
      observacoes: fc.array(fc.string(), { maxLength: 10 }),
      nao_representado: fc.anything(),
    });
    fc.assert(
      fc.property(fc.oneof(arb, fc.anything()), (x) => {
        const r = validarLeitura(x);
        if (!r.ok) return;
        const l = r.leitura;
        expect(l.vaos.length).toBeGreaterThanOrEqual(1);
        // O motor aceita as entradas (pode acusar erro de medida, nunca de formato).
        const res = calcularModulo(modeloPadrao(l.montagem, 'fundo_sobreposto'), {
          L: l.largura,
          A: l.altura,
          P: l.profundidade,
          espessuraEstrutura: mm(18),
          espessuraFundo: mm(6),
          interior: { divisorias: l.vaos.length - 1, prateleiras: l.vaos.map((v) => ({ quantidade: v.prateleiras, tipo: 'regulavel' as const })) },
          frentes: { modo: l.modoFrente, espessuraFrente: mm(18), espessuraGaveta: mm(15), vaos: l.vaos.map((v) => ({ tipo: v.frente, portas: v.portas, lado: v.lado, gavetas: v.gavetas })) },
        });
        expect(res.erros.every((e) => e.codigo !== 'frentes_invalidas' && e.codigo !== 'gavetas_invalidas')).toBe(true);
      }),
    );
  });
});

describe('largurasPorProporcao()', () => {
  it('vãos iguais: deixa o motor dividir', () => {
    expect(largurasPorProporcao(mm(900), mm(18), [1, 1, 1])).toBeNull();
    expect(largurasPorProporcao(mm(900), mm(18), [1])).toBeNull();
  });

  it('1 : 2 em 1200 mm com MDF 18: livre 1146 → 382 e o resto', () => {
    // 1200 − 2 × 18 − 18 = 1146; 1146 / 3 = 382
    expect(largurasPorProporcao(mm(1200), mm(18), [1, 2])).toEqual([mm(382), null]);
  });

  it('o motor aceita as larguras geradas', () => {
    const larguras = largurasPorProporcao(mm(1200), mm(18), [1, 2])!;
    const r = calcularModulo(modeloPadrao('tampo_base_entre_laterais', 'fundo_sobreposto'), { L: mm(1200), A: mm(700), P: mm(500), espessuraEstrutura: mm(18), espessuraFundo: mm(6), interior: { divisorias: 1, largurasVaos: larguras } });
    expect(r.erros).toEqual([]);
    expect(r.vaos.map((v) => v.largura)).toEqual([mm(382), mm(764)]);
  });
});

describe('pedido e ferramenta', () => {
  it('o pedido leva as medidas conhecidas e corta observação longa', () => {
    expect(pedidoVisao({ largura: 800 })).toContain('largura 800 mm');
    expect(pedidoVisao({})).toContain('não informou medidas');
    expect(pedidoVisao({}, 'a'.repeat(1000)).length).toBeLessThan(450);
  });

  it('o esquema é estrito: sem campos soltos, tudo obrigatório', () => {
    const s = FERRAMENTA_VISAO.input_schema;
    expect(FERRAMENTA_VISAO.strict).toBe(true);
    expect(s.additionalProperties).toBe(false);
    expect([...s.required].sort()).toEqual(Object.keys(s.properties).sort());
    const v = s.properties.vaos.items;
    expect(v.additionalProperties).toBe(false);
    expect([...v.required].sort()).toEqual(Object.keys(v.properties).sort());
  });
});
