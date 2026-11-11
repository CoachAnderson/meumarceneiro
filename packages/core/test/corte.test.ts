import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ErroCorte,
  ehGuilhotina,
  medidaDeCorte,
  mm,
  orientacoes,
  otimizarCorte,
  verificarPlano,
  type ChapaDisponivel,
  type Dmm,
  type ParametrosCorte,
  type PecaCorte,
  type PlanoCorte,
} from '../src';

const SEM_BORDAS = { frente: false, tras: false, ext1: false, ext2: false };

describe('medidaDeCorte(): desconto da fita', () => {
  it('fita de 1 mm na frente: largura 550 → 549', () => {
    const m = medidaDeCorte({ comprimento: mm(700), largura: mm(550), bordas: { ...SEM_BORDAS, frente: true } }, { espessuraFitaCmm: 100 });
    expect(m).toEqual({ comprimento: mm(700), largura: mm(549), arredondamentoCmm: { comprimento: 0, largura: 0 } });
  });

  it('fita de 0,45 mm: 549,55 vira 549,6 (arredonda para cima, nunca menor)', () => {
    const m = medidaDeCorte({ comprimento: mm(700), largura: mm(550), bordas: { ...SEM_BORDAS, frente: true } }, { espessuraFitaCmm: 45 });
    expect(m.largura).toBe(5496);
    expect(m.arredondamentoCmm.largura).toBe(5);
  });

  it('fita nas quatro bordas, 2 mm: 600 × 400 → 596 × 396', () => {
    const m = medidaDeCorte({ comprimento: mm(600), largura: mm(400), bordas: { frente: true, tras: true, ext1: true, ext2: true } }, { espessuraFitaCmm: 200 });
    expect([m.comprimento, m.largura]).toEqual([mm(596), mm(396)]);
  });

  it('sobremedida para a coladeira compensa o desconto', () => {
    const m = medidaDeCorte({ comprimento: mm(600), largura: mm(400), bordas: { ...SEM_BORDAS, ext1: true } }, { espessuraFitaCmm: 100, sobremedidaCmm: 100 });
    expect(m.comprimento).toBe(mm(600));
  });

  it('sem fita, a medida não muda', () => {
    const m = medidaDeCorte({ comprimento: mm(600), largura: mm(400), bordas: SEM_BORDAS }, { espessuraFitaCmm: 200 });
    expect([m.comprimento, m.largura]).toEqual([mm(600), mm(400)]);
  });
});

describe('orientacoes()', () => {
  const p = { comprimento: mm(800), largura: mm(300), veio: true };
  it('com veio, segue a chapa', () => {
    expect(orientacoes(p, 'comprimento')).toEqual([[mm(800), mm(300), false]]);
    expect(orientacoes(p, 'largura')).toEqual([[mm(300), mm(800), true]]);
  });
  it('sem veio, gira', () => {
    expect(orientacoes({ ...p, veio: false }, 'comprimento')).toHaveLength(2);
    expect(orientacoes(p, 'sem_veio')).toHaveLength(2);
  });
});

const r = (x: number, y: number, dx: number, dy: number) => ({ x: x as Dmm, y: y as Dmm, dx: dx as Dmm, dy: dy as Dmm });

describe('ehGuilhotina()', () => {
  it('peças em grade, com a serra entre elas', () => {
    expect(ehGuilhotina([r(0, 0, 10, 10), r(14, 0, 10, 10), r(0, 14, 24, 5)], 4)).toBe(true);
  });
  it('catavento (cinco peças entrelaçadas) não é guilhotina', () => {
    const cata = [r(0, 0, 20, 10), r(24, 0, 10, 24), r(14, 28, 20, 10), r(0, 14, 10, 24), r(14, 14, 6, 10)];
    expect(ehGuilhotina(cata, 4)).toBe(false);
  });
  it('peças mais próximas que a largura da serra', () => {
    expect(ehGuilhotina([r(0, 0, 10, 10), r(12, 0, 10, 10)], 4)).toBe(false);
  });
  it('peças sobrepostas', () => {
    expect(ehGuilhotina([r(0, 0, 10, 10), r(5, 5, 10, 10)], 0)).toBe(false);
  });
});

const PADRAO: ParametrosCorte = {
  serra: mm(4),
  refilo: mm(10),
  refiloRetalho: mm(5),
  sobraMinima: { comprimento: mm(300), largura: mm(100) },
  veio: 'sem_veio',
};
const CHAPA: ChapaDisponivel = { id: 'c', tipo: 'chapa', nome: '2750 × 1850', comprimento: mm(2750), largura: mm(1850), quantidade: null };
const peca = (id: string, c: number, l: number, q = 1, veio = false): PecaCorte => ({ id, nome: id, comprimento: mm(c), largura: mm(l), quantidade: q, veio });

describe('otimizarCorte(): casos conferidos à mão', () => {
  it('duas peças de 1000 × 500 numa chapa', () => {
    const { plano } = otimizarCorte([peca('A', 1000, 500, 2)], [CHAPA], PADRAO);
    expect(plano!.chapas).toHaveLength(1);
    expect(plano!.chapas[0]!.pecas).toHaveLength(2);
    expect(plano!.minimoTeoricoChapas).toBe(1);
  });

  it('peça do tamanho exato da área útil: 2730 × 1830', () => {
    const { plano } = otimizarCorte([peca('A', 2730, 1830)], [CHAPA], PADRAO);
    expect(plano!.chapas[0]!.pecas[0]).toMatchObject({ x: mm(10), y: mm(10) });
    expect(plano!.chapas[0]!.sobras).toEqual([]);
  });

  it('18 peças de 600 × 400 cabem numa chapa só girando (6 × 3)', () => {
    const { plano } = otimizarCorte([peca('A', 600, 400, 18)], [CHAPA], PADRAO);
    expect(plano!.chapas).toHaveLength(1);
    expect(plano!.chapas[0]!.pecas.every((p) => p.girada)).toBe(true);
  });

  it('com veio, a mesma peça não gira e precisa de duas chapas', () => {
    const { plano } = otimizarCorte([peca('A', 600, 400, 18, true)], [CHAPA], { ...PADRAO, veio: 'comprimento' });
    expect(plano!.chapas).toHaveLength(2);
    expect(plano!.chapas.flatMap((c) => c.pecas).every((p) => !p.girada)).toBe(true);
  });

  it('peça que só cabe girada, mas tem veio: não cabe, com o motivo', () => {
    const r = otimizarCorte([peca('Lateral', 300, 2000, 1, true)], [CHAPA], { ...PADRAO, veio: 'comprimento' });
    expect(r.plano).toBeNull();
    expect(r.naoCabem[0]!.motivo).toContain('veio');
    // Sem veio, gira e cabe.
    expect(otimizarCorte([peca('Lateral', 300, 2000)], [CHAPA], PADRAO).plano).not.toBeNull();
  });

  it('usa o retalho antes de abrir chapa nova', () => {
    const retalho: ChapaDisponivel = { id: 'r1', tipo: 'retalho', nome: 'Retalho 1000 × 600', comprimento: mm(1000), largura: mm(600), quantidade: 1 };
    const { plano } = otimizarCorte([peca('A', 900, 500)], [CHAPA, retalho], PADRAO);
    expect(plano!.usoPorChapa).toEqual([{ chapaId: 'r1', nome: 'Retalho 1000 × 600', tipo: 'retalho', quantidade: 1 }]);
    expect(plano!.chapas[0]!.pecas[0]).toMatchObject({ x: mm(5), y: mm(5) }); // refilo do retalho
  });

  it('estoque limitado: avisa que faltou chapa', () => {
    const r = otimizarCorte([peca('A', 2000, 1500, 2)], [{ ...CHAPA, quantidade: 1 }], PADRAO);
    expect(r.plano).toBeNull();
    expect(r.faltouChapa).toBe(true);
  });

  it('escolhe o formato que gasta menos chapa', () => {
    const pequena: ChapaDisponivel = { id: 'p', tipo: 'chapa', nome: '1850 × 1000', comprimento: mm(1850), largura: mm(1000), quantidade: null };
    const { plano } = otimizarCorte([peca('A', 900, 450, 2)], [CHAPA, pequena], PADRAO);
    expect(plano!.usoPorChapa.map((u) => u.chapaId)).toEqual(['p']);
  });

  it('sobra grande vira retalho aproveitável', () => {
    const { plano } = otimizarCorte([peca('A', 1000, 1830)], [CHAPA], PADRAO);
    const ret = plano!.chapas[0]!.retalhos;
    // 2730 − 1000 − 4 = 1726 de comprimento, altura toda
    expect(ret).toEqual([{ x: mm(1014), y: mm(10), dx: mm(1726), dy: mm(1830) }]);
  });

  it('entrada inválida é recusada', () => {
    expect(() => otimizarCorte([peca('A', 0, 10)], [CHAPA], PADRAO)).toThrow(ErroCorte);
    expect(() => otimizarCorte([peca('A', 10, 10)], [], PADRAO)).toThrow(ErroCorte);
    expect(() => otimizarCorte([peca('A', 10, 10)], [CHAPA], { ...PADRAO, serra: -1 as Dmm })).toThrow(ErroCorte);
  });
});

describe('verificarPlano() pega plano adulterado', () => {
  const pecas = [peca('A', 1000, 500, 3), peca('B', 400, 300, 2)];
  const original = otimizarCorte(pecas, [CHAPA], PADRAO).plano!;
  const copia = (): PlanoCorte => structuredClone(original);

  it('o plano original passa', () => {
    expect(verificarPlano(original, pecas, [CHAPA], PADRAO)).toEqual([]);
  });

  it('peça faltando', () => {
    const p = copia();
    p.chapas[0]!.pecas.pop();
    p.chapas[0]!.areaPecas = p.chapas[0]!.pecas.reduce((s, x) => s + x.dx * x.dy, 0) as never;
    expect(verificarPlano(p, pecas, [CHAPA], PADRAO).some((x) => x.includes('ficou fora'))).toBe(true);
  });

  it('peça em cima de outra', () => {
    const p = copia();
    const [a, b] = p.chapas[0]!.pecas;
    b!.x = a!.x;
    b!.y = a!.y;
    expect(verificarPlano(p, pecas, [CHAPA], PADRAO).length).toBeGreaterThan(0);
  });

  it('peça girada contra o veio', () => {
    const p = copia();
    const x = p.chapas[0]!.pecas[0]!;
    [x.dx, x.dy] = [x.dy, x.dx];
    x.girada = !x.girada;
    expect(verificarPlano(p, [peca('A', 1000, 500, 3, true), peca('B', 400, 300, 2, true)], [CHAPA], { ...PADRAO, veio: 'comprimento' }).some((s) => s.includes('veio'))).toBe(true);
  });

  it('peça no refilo', () => {
    const p = copia();
    p.chapas[0]!.pecas[0]!.x = mm(0);
    expect(verificarPlano(p, pecas, [CHAPA], PADRAO).some((s) => s.includes('fora da área útil'))).toBe(true);
  });
});

describe('propriedades', () => {
  const arbPeca = fc.record({
    c: fc.integer({ min: 500, max: 26000 }),
    l: fc.integer({ min: 500, max: 9000 }),
    q: fc.integer({ min: 1, max: 6 }),
    veio: fc.boolean(),
  });
  const arb = fc.record({
    pecas: fc.array(arbPeca, { minLength: 1, maxLength: 12 }),
    serra: fc.integer({ min: 0, max: 60 }),
    refilo: fc.integer({ min: 0, max: 200 }),
    veio: fc.constantFrom('sem_veio' as const, 'comprimento' as const, 'largura' as const),
    retalhos: fc.array(fc.record({ c: fc.integer({ min: 2000, max: 20000 }), l: fc.integer({ min: 1000, max: 9000 }) }), { maxLength: 3 }),
  });

  it('todo plano devolvido coloca todas as peças, é guilhotina e passa na verificação', () => {
    fc.assert(
      fc.property(arb, (v) => {
        const pecas = v.pecas.map((x, i) => ({ id: `P${i}`, nome: `P${i}`, comprimento: x.c as Dmm, largura: x.l as Dmm, quantidade: x.q, veio: x.veio }));
        const chapas: ChapaDisponivel[] = [
          CHAPA,
          ...v.retalhos.map((x, i) => ({ id: `R${i}`, tipo: 'retalho' as const, nome: `R${i}`, comprimento: x.c as Dmm, largura: x.l as Dmm, quantidade: 1 })),
        ];
        const p: ParametrosCorte = { ...PADRAO, serra: v.serra as Dmm, refilo: v.refilo as Dmm, veio: v.veio };
        const r = otimizarCorte(pecas, chapas, p);
        if (!r.plano) {
          // Só pode faltar plano se alguma peça não cabe.
          expect(r.naoCabem.length).toBeGreaterThan(0);
          return;
        }
        expect(verificarPlano(r.plano, pecas, chapas, p)).toEqual([]);
        const unidades = pecas.reduce((s, x) => s + x.quantidade, 0);
        expect(r.plano.chapas.reduce((s, c) => s + c.pecas.length, 0)).toBe(unidades);
        const inteiras = r.plano.chapas.filter((c) => c.tipo === 'chapa').length;
        if (inteiras > 0) expect(inteiras).toBeGreaterThanOrEqual(r.plano.minimoTeoricoChapas);
        // Peças + sobras nunca passam da área útil de cada chapa.
        for (const c of r.plano.chapas) {
          const util = (c.comprimento - 2 * c.refilo) * (c.largura - 2 * c.refilo);
          expect(c.areaPecas + c.sobras.reduce((s, x) => s + x.dx * x.dy, 0)).toBeLessThanOrEqual(util);
        }
      }),
    );
  }, 600_000);

  it('é determinístico', () => {
    fc.assert(
      fc.property(arb, (v) => {
        const pecas = v.pecas.map((x, i) => ({ id: `P${i}`, nome: `P${i}`, comprimento: x.c as Dmm, largura: x.l as Dmm, quantidade: x.q, veio: false }));
        const a = otimizarCorte(pecas, [CHAPA], PADRAO);
        const b = otimizarCorte(pecas, [CHAPA], PADRAO);
        expect(a).toEqual(b);
      }),
      { numRuns: 30 },
    );
  }, 600_000);
});
