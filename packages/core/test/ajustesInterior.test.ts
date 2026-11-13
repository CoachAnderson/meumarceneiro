import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  calcularModulo,
  dmm,
  encaixarNoFuro,
  fixarPrateleira,
  limitesDivisoria,
  limitesPrateleira,
  linhasDePino,
  mm,
  modeloPadrao,
  moverDivisoria,
  posicoesPrateleiras,
  vaosLivres,
  VAO_LIVRE_MIN,
  type EntradaModulo,
} from '../src';

const RUNS = Number(process.env.FC_RUNS ?? 200);
const d = (...v: number[]) => v.map((x) => dmm(x));

describe('posicoesPrateleiras (alturas a partir do fundo interno, face de baixo)', () => {
  // Altura interna 700 mm, MDF 18,3 mm.
  const Hi = dmm(7000);
  const e = dmm(183);

  it('sem altura informada: espaçamento igual (conta à mão)', () => {
    // 7000 − 2 × 183 = 6634 → 3 espaços: 2212 + 2211 + 2211.
    const r = posicoesPrateleiras(Hi, e, 2);
    expect(r).toEqual({ posicoes: d(2212, 4606), erro: null });
    expect(vaosLivres(Hi, e, r.posicoes!)).toEqual(d(2212, 2211, 2211));
  });

  it('altura informada na de baixo: a de cima divide o que sobra acima dela', () => {
    // Base 3000 + 183 = 3183; sobra 7000 − 3183 − 183 = 3634 → 1817 + 1817.
    expect(posicoesPrateleiras(Hi, e, 2, [dmm(3000), null])).toEqual({ posicoes: d(3000, 5000), erro: null });
  });

  it('altura informada na de cima: a de baixo divide o que sobra embaixo', () => {
    // 3000 − 183 = 2817 → 1409 + 1408.
    expect(posicoesPrateleiras(Hi, e, 2, [null, dmm(3000)])).toEqual({ posicoes: d(1409, 3000), erro: null });
  });

  it('recusa ordem trocada, prateleira passando do tampo, altura negativa e lista do tamanho errado', () => {
    expect(posicoesPrateleiras(Hi, e, 2, [dmm(3000), dmm(2000)]).erro).toMatch(/prateleira 2 a 200 mm não deixa lugar/);
    expect(posicoesPrateleiras(Hi, e, 1, [dmm(6900)]).erro).toMatch(/passa do tampo/);
    expect(posicoesPrateleiras(Hi, e, 1, [dmm(-10)]).erro).toMatch(/de 0 em diante/);
    expect(posicoesPrateleiras(Hi, e, 2, [dmm(1000)]).erro).toMatch(/2 prateleira/);
  });

  it('propriedade: as informadas ficam onde foram postas, nada se sobrepõe e nada passa do tampo', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2000, max: 30000 }), fc.integer({ min: 60, max: 400 }), fc.integer({ min: 0, max: 8 }), fc.array(fc.boolean(), { maxLength: 8 }), (hi, esp, q, quais) => {
        const H = dmm(hi);
        const E = dmm(esp);
        const auto = posicoesPrateleiras(H, E, q);
        fc.pre(auto.erro === null);
        // Fixa algumas nas posições automáticas e confere que o resto se arruma.
        const alturas = auto.posicoes!.map((p, i) => (quais[i] ? p : null));
        const r = posicoesPrateleiras(H, E, q, alturas);
        expect(r.erro).toBeNull();
        r.posicoes!.forEach((p, i) => {
          if (alturas[i] !== null) expect(p).toBe(alturas[i]);
          expect(p).toBeGreaterThanOrEqual(i === 0 ? 0 : (r.posicoes![i - 1] as number) + E);
        });
        if (q > 0) expect((r.posicoes!.at(-1) as number) + E).toBeLessThanOrEqual(H);
        expect(vaosLivres(H, E, r.posicoes!).reduce((a, b) => a + b, 0) + q * E).toBe(H);
      }),
      { numRuns: RUNS },
    );
  });
});

describe('mover prateleira', () => {
  const Hi = dmm(7000);
  const e = dmm(183);

  it('limites: 50 mm livres para cada lado da vizinha', () => {
    // Prateleiras em 2212 e 4606. A de cima: de 2212 + 183 + 500 = 2895 até 7000 − 500 − 183 = 6317.
    expect(limitesPrateleira(Hi, e, d(2212, 4606), 1)).toEqual({ min: dmm(2895), max: dmm(6317) });
    // A de baixo: de 500 até 4606 − 500 − 183 = 3923.
    expect(limitesPrateleira(Hi, e, d(2212, 4606), 0)).toEqual({ min: VAO_LIVRE_MIN, max: dmm(3923) });
  });

  it('fixar uma não mexe nas outras', () => {
    expect(fixarPrateleira(d(2212, 4606), 0, dmm(1500))).toEqual(d(1500, 4606));
  });

  it('prateleira regulável vai para a linha de furo mais perto, dentro dos limites', () => {
    // Margem 96 mm, passo 32 mm: 960, 1280, 1600, …
    const linhas = linhasDePino(Hi, dmm(960), dmm(320));
    expect(linhas.slice(0, 3)).toEqual(d(960, 1280, 1600));
    // Última: 960 + 15 × 320 = 5760 (a próxima, 6080, passa de 7000 − 960 = 6040).
    expect(linhas.at(-1)).toBe(dmm(5760));
  });
});

describe('mover divisória', () => {
  it('só os dois vãos vizinhos mudam; se todos ficariam fixos, o da direita continua automático', () => {
    expect(moverDivisoria(d(3000, 3000, 3000), [null, null, null], 1, dmm(2500))).toEqual([dmm(2500), dmm(3500), null]);
    expect(moverDivisoria(d(4000, 4000), [null, null], 1, dmm(3000))).toEqual([dmm(3000), null]);
    // O da direita já era fixo: quem volta a automático é o da esquerda.
    expect(moverDivisoria(d(4000, 4000), [null, dmm(4000)], 1, dmm(3000))).toEqual([null, dmm(5000)]);
    // Todos fixos desde antes: continua tudo fixo, com a mesma soma.
    expect(moverDivisoria(d(4000, 4000), d(4000, 4000), 1, dmm(3000))).toEqual(d(3000, 5000));
  });

  it('fora dos limites (vão com menos de 50 mm) devolve null', () => {
    expect(limitesDivisoria(d(4000, 4000), 1)).toEqual({ min: dmm(500), max: dmm(7500) });
    expect(moverDivisoria(d(4000, 4000), [null, null], 1, dmm(400))).toBeNull();
    expect(moverDivisoria(d(4000, 4000), [null, null], 1, dmm(7600))).toBeNull();
    expect(moverDivisoria(d(4000, 4000), [null, null], 2, dmm(3000))).toBeNull();
  });
});

describe('no motor (armário 600 × 700 × 550, MDF 18)', () => {
  const REF: EntradaModulo = { L: mm(600), A: mm(700), P: mm(550), espessuraEstrutura: mm(18), espessuraFundo: mm(6) };
  const modelo = modeloPadrao('tampo_base_entre_laterais', 'fundo_canal');
  const caixa = (r: ReturnType<typeof calcularModulo>, id: string) => r.componentes.find((c) => c.id === id)!.caixa;

  it('divisória movida pelo desenho: vãos de 200 e 346 mm e a divisória no lugar certo', () => {
    // Largura interna 600 − 36 = 564; menos a divisória: 546 → 273 + 273.
    const antes = calcularModulo(modelo, { ...REF, interior: { divisorias: 1 } });
    expect(antes.vaos.map((v) => v.largura)).toEqual(d(2730, 2730));
    const largurasVaos = moverDivisoria(antes.vaos.map((v) => v.largura), [null, null], 1, dmm(2000))!;
    const r = calcularModulo(modelo, { ...REF, interior: { divisorias: 1, largurasVaos } });
    expect(r.valido).toBe(true);
    expect(r.vaos.map((v) => v.largura)).toEqual(d(2000, 3460));
    expect(caixa(r, 'divisoria_1').x).toBe(dmm(180 + 2000));
  });

  it('prateleira fixa com altura informada: a 200 mm do fundo interno, a outra divide o resto', () => {
    // Altura interna 700 − 36 = 664. Primeira a 200 mm (y = 18 + 200 = 218).
    // Acima dela: 664 − 218 − 18 = 428 → 214 + 214 → segunda a 200 + 18 + 214 = 432 (y = 450).
    const r = calcularModulo(modelo, { ...REF, interior: { divisorias: 0, prateleiras: { quantidade: 2, tipo: 'fixa', alturas: [dmm(2000), null] } } });
    expect(r.valido).toBe(true);
    expect([caixa(r, 'prateleira_v1_1').y, caixa(r, 'prateleira_v1_2').y]).toEqual(d(2180, 4500));
  });

  it('altura que não cabe vira erro; espaço muito pequeno vira aviso', () => {
    const naoCabe = calcularModulo(modelo, { ...REF, interior: { divisorias: 0, prateleiras: { quantidade: 1, tipo: 'fixa', alturas: [dmm(6600)] } } });
    expect(naoCabe.erros.map((x) => x.codigo)).toContain('prateleiras_altura');
    const apertada = calcularModulo(modelo, { ...REF, interior: { divisorias: 0, prateleiras: { quantidade: 1, tipo: 'fixa', alturas: [dmm(300)] } } });
    expect(apertada.valido).toBe(true);
    expect(apertada.avisos.map((x) => x.codigo)).toContain('vao_livre_pequeno');
  });

  it('a altura da prateleira não muda as medidas de corte, só a posição', () => {
    const auto = calcularModulo(modelo, { ...REF, interior: { divisorias: 0, prateleiras: { quantidade: 2, tipo: 'regulavel' } } });
    const livre = calcularModulo(modelo, { ...REF, interior: { divisorias: 0, prateleiras: { quantidade: 2, tipo: 'regulavel', alturas: [dmm(1280), dmm(4160)] } } });
    const medidas = (r: typeof auto) => r.componentes.map((c) => [c.id, c.comprimento, c.largura, c.espessura]);
    expect(medidas(livre)).toEqual(medidas(auto));
    expect(caixa(livre, 'prateleira_v1_1').y).toBe(dmm(180 + 1280));
  });
});

describe('encaixarNoFuro', () => {
  it('escolhe a linha mais perto que esteja dentro dos limites', () => {
    const linhas = d(960, 1280, 1600, 1920);
    expect(encaixarNoFuro(1400, linhas, { min: dmm(500), max: dmm(5000) })).toBe(dmm(1280));
    expect(encaixarNoFuro(1500, linhas, { min: dmm(500), max: dmm(5000) })).toBe(dmm(1600));
    // 1600 está fora do limite: vai para 1280.
    expect(encaixarNoFuro(1550, linhas, { min: dmm(500), max: dmm(1500) })).toBe(dmm(1280));
    expect(encaixarNoFuro(1550, linhas, { min: dmm(1300), max: dmm(1500) })).toBeNull();
  });
});

describe('furação acompanha a altura da prateleira fixa', () => {
  const REF: EntradaModulo = { L: mm(600), A: mm(700), P: mm(550), espessuraEstrutura: mm(18), espessuraFundo: mm(6) };
  const modelo = modeloPadrao('tampo_base_entre_laterais', 'fundo_canal');

  it('cavilhas na lateral no meio da espessura da prateleira (200 + 9 = 209 mm do fundo interno)', () => {
    const r = calcularModulo(modelo, {
      ...REF,
      interior: { divisorias: 0, prateleiras: { quantidade: 1, tipo: 'fixa', alturas: [dmm(2000)] } },
      furacao: { juncao: 'cavilha', cavilhaComMinifix: false, puxadorEntreFuros: null, juncaoGaveta: 'nenhuma', corredica: false, frenteGaveta: false },
    });
    expect(r.valido).toBe(true);
    const lateral = r.componentes.find((c) => c.id === 'lateral_esquerda')!;
    const alturasDosFuros = new Set(lateral.furos!.filter((f) => f.finalidade === 'cavilha').flatMap((f) => f.centros.map((c) => c.u)));
    // A lateral começa no chão (y = 0); a prateleira de 18 mm tem a face de baixo em 18 + 200 = 218 mm: meio em 227 mm.
    expect(alturasDosFuros.has(dmm(2270))).toBe(true);
  });
});
