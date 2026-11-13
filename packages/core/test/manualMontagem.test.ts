import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  calcularMesa,
  calcularModulo,
  codigosDasPecas,
  furoNoMovel,
  gerarListaPecas,
  gerarManual,
  juntarFerragens,
  lerModeloMontagem,
  modeloMontagem,
  resultadoDoModelo,
  mm,
  modeloPadrao,
  type EntradaFrentes,
  type EntradaMesa,
  type EntradaModulo,
  type FerragemNecessaria,
  type ManualMontagem,
  type ResultadoModulo,
} from '../src';

/** 600 × 700 × 550, MDF 18, fundo 6 em canal, uma porta, minifix. Tampo e base entre as laterais. */
const REF: EntradaModulo = { L: mm(600), A: mm(700), P: mm(550), espessuraEstrutura: mm(18), espessuraFundo: mm(6), parametros: { c: 80, g: 10, r: 100 } };
const FR: EntradaFrentes = { modo: 'sobreposta', espessuraFrente: mm(18), espessuraGaveta: mm(15), vaos: { tipo: 'porta', portas: 1, lado: 'esquerda' }, puxador: false };
const MONTAGENS = ['tampo_base_entre_laterais', 'tampo_sobre_laterais', 'base_entre_laterais_travessas'] as const;

function calc(e: Partial<EntradaModulo> = {}, montagem: string = MONTAGENS[0], fundo = 'fundo_canal'): ResultadoModulo {
  // c, g e r são parâmetros do fundo em canal.
  const parametros = fundo === 'fundo_canal' ? REF.parametros : {};
  return calcularModulo(modeloPadrao(montagem, fundo), { ...REF, parametros, frentes: FR, furacao: { juncao: 'minifix' }, ...e });
}
function manual(r: ResultadoModulo, montagem: string = MONTAGENS[0], fundo = 'fundo_canal'): ManualMontagem {
  const lista = gerarListaPecas({ resultado: r, montagem, fundo, espessuraFundo: mm(6) });
  const m = gerarManual(r, codigosDasPecas(lista.itens));
  expect(m).not.toBeNull();
  return m!;
}
const resumo = (f: readonly FerragemNecessaria[]) => juntarFerragens(f.map((x) => ({ ...x, descricao: '' }))).map((x) => [x.codigo, x.quantidade, x.comprimento ?? null]);

/** O que todo manual precisa cumprir. */
function conferir(r: ResultadoModulo, m: ManualMontagem) {
  // Cada peça entra uma vez só.
  const novas = m.passos.flatMap((p) => p.novas.map((n) => n.id));
  expect([...novas].sort()).toEqual(r.componentes.map((c) => c.id).sort());
  // Cada junção aparece uma vez, no primeiro passo em que as duas peças estão no lugar.
  const vistas = m.passos.flatMap((p) => p.juncoes);
  expect(vistas.length).toBe(r.juncoes.length);
  for (const p of m.passos) {
    for (const j of p.juncoes) {
      expect(p.montadas).toContain(j.a);
      expect(p.montadas).toContain(j.b);
      expect(p.novas.some((n) => n.id === j.a || n.id === j.b), `${j.a} com ${j.b} no passo ${p.numero}`).toBe(true);
    }
  }
  // Peças montadas só crescem; números em ordem.
  m.passos.forEach((p, i) => {
    expect(p.numero).toBe(i + 1);
    if (i > 0) for (const id of m.passos[i - 1]!.montadas) expect(p.montadas).toContain(id);
  });
  // As ferragens dos passos somam exatamente a lista do móvel.
  expect(resumo(m.passos.flatMap((p) => p.ferragens))).toEqual(resumo(r.ferragens));
  expect(resumo(m.ferragens)).toEqual(resumo(r.ferragens));
  for (const p of m.passos) for (const f of p.ferragens) expect(f.descricao.length).toBeGreaterThan(0);
}

describe('armário de referência (conferido à mão)', () => {
  const r = calc();
  const m = manual(r);

  it('ordem: lateral esquerda, base e tampo, fundo no canal, lateral direita, esquadro, porta, regulagem', () => {
    expect(r.erros).toEqual([]);
    expect(m.passos.map((p) => p.titulo)).toEqual([
      'Comece pela lateral esquerda',
      'Base e tampo',
      'Fundo nos canais',
      'Feche com a lateral direita',
      'Confira o esquadro',
      'Porta',
      'Regulagem final',
    ]);
    expect(m.passos.map((p) => p.novas.map((n) => n.id))).toEqual([['lateral_esquerda'], ['base', 'tampo'], ['fundo'], ['lateral_direita'], [], ['porta_v1'], []]);
    conferir(r, m);
  });

  it('cada lado da caixa: 2 junções de 2 minifix (8 no total), com o código de cada peça no texto', () => {
    const [, base, , direita] = m.passos;
    expect(base!.juncoes.map((j) => [j.a, j.b])).toEqual([['tampo', 'lateral_esquerda'], ['base', 'lateral_esquerda']].sort((x, y) => r.juncoes.findIndex((j) => j.a === x[0]) - r.juncoes.findIndex((j) => j.a === y[0])));
    expect(base!.ferragens.map((f) => [f.codigo, f.quantidade])).toEqual([['minifix', 4]]);
    expect(direita!.ferragens.map((f) => [f.codigo, f.quantidade])).toEqual([['minifix', 4]]);
    const lista = gerarListaPecas({ resultado: r, montagem: MONTAGENS[0], fundo: 'fundo_canal', espessuraFundo: mm(6) });
    const cod = codigosDasPecas(lista.itens);
    expect(base!.instrucoes).toContain(`Tampo (${cod.get('tampo')}) com Lateral esquerda (${cod.get('lateral_esquerda')}): 2 minifix.`);
    // A dica do minifix aparece uma vez só no manual.
    expect(m.passos.flatMap((p) => p.instrucoes).filter((t) => t.startsWith('Minifix:')).length).toBe(1);
  });

  it('marcas no 3D: os pontos de minifix são os furos do pino na lateral; dobradiças na porta', () => {
    const lateral = r.componentes.find((c) => c.id === 'lateral_esquerda')!;
    const pinos = (lateral.furos ?? []).filter((f) => f.finalidade === 'minifix_pino').flatMap((f) => furoNoMovel(lateral, f));
    const marcas = m.passos[1]!.marcas.filter((k) => k.tipo === 'minifix').map((k) => k.ponto);
    // O ponto da junção fica no plano de contato: o mesmo x da face da lateral, mesmos y e z do pino.
    expect(marcas.map((p) => [p.y, p.z]).sort()).toEqual(pinos.map((p) => [p.y, p.z]).sort());
    expect(new Set(marcas.map((p) => p.x))).toEqual(new Set(pinos.map((p) => p.x)));
    const porta = m.passos[5]!;
    expect(porta.ferragens.map((f) => [f.codigo, f.quantidade])).toEqual([['dobradica_reta', 2]]);
    // 2 copas na porta e 2 × 2 furos dos calços na lateral.
    expect(porta.marcas.filter((k) => k.tipo === 'dobradica').length).toBe(6);
  });

  it('fundo sobreposto: entra depois de fechar, com o esquadro pelas diagonais', () => {
    const r2 = calc({}, MONTAGENS[0], 'fundo_sobreposto');
    const m2 = manual(r2, MONTAGENS[0], 'fundo_sobreposto');
    const titulos = m2.passos.map((p) => p.titulo);
    expect(titulos.indexOf('Esquadro e fundo')).toBe(titulos.indexOf('Feche com a lateral direita') + 1);
    expect(titulos).not.toContain('Fundo nos canais');
    conferir(r2, m2);
  });

  it('cálculo com erro: sem manual', () => {
    expect(gerarManual(calc({ L: mm(10) }))).toBeNull();
  });
});

describe('armário com divisória, prateleiras e gavetas', () => {
  const r = calc({
    L: mm(900),
    A: mm(800),
    interior: { divisorias: 1, prateleiras: [{ quantidade: 1, tipo: 'regulavel' }, { quantidade: 0, tipo: 'fixa' }] },
    frentes: { ...FR, puxador: true, vaos: [{ tipo: 'porta', portas: 1, lado: 'esquerda' }, { tipo: 'gavetas', gavetas: 2 }] },
    furacao: { juncao: 'minifix', cavilhaComMinifix: true, juncaoGaveta: 'cavilha', corredica: true, frenteGaveta: true, puxadorEntreFuros: mm(96) },
  });
  const m = manual(r);

  it('divisória antes de fechar; reguláveis com 4 suportes; caixas, corrediças, frentes, porta, puxadores', () => {
    expect(r.erros).toEqual([]);
    expect(m.passos.map((p) => p.titulo)).toEqual([
      'Comece pela lateral esquerda',
      'Base e tampo',
      'Divisória',
      'Fundo nos canais',
      'Feche com a lateral direita',
      'Confira o esquadro',
      'Prateleira regulável',
      'Caixas das gavetas (2)',
      'Corrediças',
      'Frentes das gavetas',
      'Porta',
      'Puxadores',
      'Regulagem final',
    ]);
    conferir(r, m);
    const passo = (t: string) => m.passos.find((p) => p.titulo === t)!;
    expect(passo('Prateleira regulável').ferragens.map((f) => [f.codigo, f.quantidade])).toEqual([['suporte_prateleira', 4]]);
    expect(passo('Prateleira regulável').marcas.filter((k) => k.tipo === 'suporte_prateleira').length).toBe(4);
    // Minifix com cavilha: cada encontro tem 2 minifix e 2 cavilhas.
    expect(passo('Divisória').ferragens.map((f) => [f.codigo, f.quantidade])).toEqual([['minifix', 4], ['cavilha', 4]]);
    // Laterais e traseiras iguais nas duas gavetas: a junção vira uma linha com "(2 vezes)".
    // As contrafrentes têm furos de puxador e da frente em alturas diferentes: códigos diferentes.
    expect(passo('Caixas das gavetas (2)').instrucoes.filter((t) => t.endsWith('(2 vezes).')).length).toBe(2);
    expect(passo('Corrediças').ferragens.map((f) => f.codigo)).toEqual(['corredica', 'parafuso_corredica']);
    expect(passo('Corrediças').marcas.length).toBeGreaterThan(0);
    expect(passo('Frentes das gavetas').ferragens.map((f) => f.codigo)).toEqual(['parafuso_frente']);
    // Uma marca por parafuso (o furo passante da contrafrente), não duas.
    expect(passo('Frentes das gavetas').marcas.length).toBe(passo('Frentes das gavetas').ferragens[0]!.quantidade);
    expect(passo('Puxadores').ferragens.map((f) => [f.codigo, f.quantidade])).toEqual([['puxador', 3]]);
  });

  it('peças iguais com o nome comum: "2× Lateral de gaveta"', () => {
    const textos = m.passos.flatMap((p) => p.instrucoes).join('\n');
    expect(textos).toMatch(/2× Lateral de gaveta \(P\d+\)/);
    expect(textos).toMatch(/2× Traseira de gaveta \(P\d+\)/);
    expect(textos).not.toMatch(/\(vão \(/);
  });
});

describe('mesas e bancadas', () => {
  const MESA: EntradaMesa = { L: mm(1200), A: mm(750), P: mm(600), espessura: mm(18), sapatas: true, engrosso: { bordas: 'frente', camadas: 1 }, furacao: { juncao: 'minifix', engrosso: true } };

  it('pés de MDF: tampo, borda engrossada, pés (com sapatas), saia, virar', () => {
    const r = calcularMesa(MESA);
    const m = gerarManual(r)!;
    expect(m.passos.map((p) => p.titulo)).toEqual(['Tampo', 'Borda engrossada', 'Pés', 'Saia', 'Vire a mesa']);
    expect(m.passos[2]!.ferragens.map((f) => f.codigo)).toEqual(['minifix', 'sapata_niveladora']);
    expect(m.passos[1]!.ferragens.map((f) => f.codigo)).toEqual(['parafuso_engrosso']);
    expect(m.passos[1]!.marcas.length).toBe(m.passos[1]!.ferragens[0]!.quantidade);
    conferir(r, m);
  });

  it('pés comprados, bancada suspensa e tampo sobre gabinetes', () => {
    const casos: Array<[EntradaMesa, string[]]> = [
      [{ ...MESA, modelo: 'pes_comprados', engrosso: undefined }, ['Tampo', 'Pés', 'Vire a mesa']],
      [{ ...MESA, modelo: 'suspensa', A: mm(900), P: mm(500), engrosso: undefined }, ['Tampo', 'Suportes na parede', 'Assente o tampo']],
      [{ ...MESA, modelo: 'sobre_gabinetes', A: mm(900), gabinetes: [mm(600), mm(600)], engrosso: undefined }, ['Tampo', 'Gabinetes', 'Assente o tampo']],
    ];
    for (const [e, titulos] of casos) {
      const r = calcularMesa(e);
      expect(r.erros, e.modelo).toEqual([]);
      const m = gerarManual(r)!;
      expect(m.passos.map((p) => p.titulo)).toEqual(titulos);
      conferir(r, m);
    }
    const suspensa = gerarManual(calcularMesa(casos[1]![0]))!;
    expect(suspensa.passos[1]!.instrucoes[0]).toContain('3× Mão-francesa');
    expect(suspensa.passos[2]!.ferragens.map((f) => f.codigo)).toEqual(['parafuso_suporte']);
  });
});

describe('propriedade: qualquer armário válido', () => {
  const entrada = fc.record({
    L: fc.integer({ min: 300, max: 2400 }),
    A: fc.integer({ min: 300, max: 2400 }),
    P: fc.integer({ min: 250, max: 700 }),
    e: fc.constantFrom(15, 18, 25),
    montagem: fc.constantFrom(...MONTAGENS),
    fundo: fc.constantFrom('fundo_canal', 'fundo_sobreposto', 'fundo_embutido'),
    divisorias: fc.integer({ min: 0, max: 3 }),
    prateleiras: fc.integer({ min: 0, max: 3 }),
    tipo: fc.constantFrom('fixa' as const, 'regulavel' as const),
    juncao: fc.constantFrom('minifix' as const, 'cavilha' as const, 'parafuso' as const, 'nenhuma' as const),
    cavilha: fc.boolean(),
    frente: fc.constantFrom('aberto' as const, 'porta' as const, 'gavetas' as const),
    portas: fc.constantFrom(1 as const, 2 as const),
    gavetas: fc.integer({ min: 1, max: 4 }),
    juncaoGaveta: fc.constantFrom('nenhuma' as const, 'parafuso' as const, 'cavilha' as const),
    extras: fc.boolean(),
    puxador: fc.boolean(),
  });

  it('toda peça entra uma vez, toda junção no passo certo, e as ferragens fecham com a lista', () => {
    fc.assert(
      fc.property(entrada, (v) => {
        const r = calcularModulo(modeloPadrao(v.montagem, v.fundo), {
          L: mm(v.L), A: mm(v.A), P: mm(v.P), espessuraEstrutura: mm(v.e), espessuraFundo: mm(6),
          interior: { divisorias: v.divisorias, prateleiras: { quantidade: v.prateleiras, tipo: v.tipo } },
          frentes: { ...FR, puxador: v.puxador, vaos: { tipo: v.frente, portas: v.portas, lado: 'esquerda', gavetas: v.gavetas } },
          furacao: { juncao: v.juncao, cavilhaComMinifix: v.cavilha, puxadorEntreFuros: mm(96), juncaoGaveta: v.juncaoGaveta, corredica: v.extras, frenteGaveta: v.extras },
        });
        fc.pre(r.valido);
        conferir(r, manual(r, v.montagem, v.fundo));
      }),
      { numRuns: 150 },
    );
  });
});

describe('fotografia do móvel (manual publicado e oficina)', () => {
  const r = calc({ furacao: { juncao: 'minifix', cavilhaComMinifix: true } });
  const lista = gerarListaPecas({ resultado: r, montagem: MONTAGENS[0], fundo: 'fundo_canal', espessuraFundo: mm(6) });
  const cod = codigosDasPecas(lista.itens);
  const modelo = modeloMontagem(r, cod);

  it('vai e volta em JSON e gera o mesmo manual', () => {
    const lido = lerModeloMontagem(JSON.parse(JSON.stringify(modelo)));
    expect(lido).not.toBeNull();
    const deNovo = gerarManual(resultadoDoModelo(lido!), new Map(Object.entries(lido!.codigos)))!;
    expect(deNovo.passos).toEqual(gerarManual(r, cod)!.passos);
    expect(Object.keys(lido!.codigos).length).toBe(r.componentes.filter((c) => !c.comprado).length);
  });

  it('arquivo adulterado ou de outro formato: recusado', () => {
    const copia = () => JSON.parse(JSON.stringify(modelo));
    expect(lerModeloMontagem(null)).toBeNull();
    expect(lerModeloMontagem({ ...copia(), versao: 2 })).toBeNull();
    expect(lerModeloMontagem({ ...copia(), componentes: [] })).toBeNull();
    const a = copia();
    a.componentes[0].caixa.x = 'x';
    expect(lerModeloMontagem(a)).toBeNull();
    const b = copia();
    b.ferragens[0].codigo = 'foguete';
    expect(lerModeloMontagem(b)).toBeNull();
    const c = copia();
    c.juncoes[0].pontos = [{ x: 1 }];
    expect(lerModeloMontagem(c)).toBeNull();
  });
});
