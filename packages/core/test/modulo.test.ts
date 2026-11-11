import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  FUNDOS_PADRAO,
  MONTAGENS_PADRAO,
  cabeNaChapa,
  caixaConfere,
  colisoes,
  calcularModulo,
  dmm,
  mm,
  modeloPadrao,
  type Componente,
  type EntradaModulo,
  type ResultadoModulo,
} from '../src';

/** Módulo de referência do documento: 600 × 700 × 550, MDF 18, fundo 6. */
const REF: EntradaModulo = { L: mm(600), A: mm(700), P: mm(550), espessuraEstrutura: mm(18), espessuraFundo: mm(6) };

function pecas(r: ResultadoModulo): Record<string, string> {
  const fmt = (c: Componente) => `${c.comprimento / 10} × ${c.largura / 10} × ${c.espessura / 10}`;
  return Object.fromEntries(r.componentes.map((c) => [c.id, fmt(c)]));
}

function calcular(montagem: string, fundo: string, entrada: Partial<EntradaModulo> = {}): ResultadoModulo {
  return calcularModulo(modeloPadrao(montagem, fundo), { ...REF, ...entrada });
}

describe('casos de referência (conferidos à mão)', () => {
  it('documento: tampo e base entre laterais, fundo em canal, 2 prateleiras reguláveis', () => {
    const r = calcular('tampo_base_entre_laterais', 'fundo_canal', {
      parametros: { c: 80, g: 10, r: 100, fl: 10, ft: 20, rfp: 120 },
      interior: { divisorias: 0, prateleiras: { quantidade: 2, tipo: 'regulavel' } },
    });
    expect(r.erros).toEqual([]);
    expect(pecas(r)).toEqual({
      lateral_esquerda: '700 × 550 × 18',
      lateral_direita: '700 × 550 × 18',
      tampo: '564 × 550 × 18',
      base: '564 × 550 × 18',
      // comprimento = altura (veio vertical): 664 + 2 × (8 − 1); largura: 564 + 2 × 7
      fundo: '678 × 578 × 6',
      // (564 − 2 × 1) × (550 − 10 − 6 − 2 − 12)
      prateleira_v1_1: '562 × 520 × 18',
      prateleira_v1_2: '562 × 520 × 18',
    });
    expect(r.medidas).toMatchObject({ Li: 5640, Hi: 6640, Pc: 5500, Pint: 5340 });
  });

  it('prateleira fixa usa o vão inteiro (564), sem folga lateral', () => {
    const r = calcular('tampo_base_entre_laterais', 'fundo_canal', { interior: { divisorias: 0, prateleiras: { quantidade: 1, tipo: 'fixa' } } });
    expect(pecas(r).prateleira_v1_1).toBe('564 × 534 × 18');
  });

  it('fundo sobreposto: caixa mais rasa, fundo cobre a traseira inteira', () => {
    const r = calcular('tampo_base_entre_laterais', 'fundo_sobreposto');
    expect(pecas(r)).toEqual({
      lateral_esquerda: '700 × 544 × 18',
      lateral_direita: '700 × 544 × 18',
      tampo: '564 × 544 × 18',
      base: '564 × 544 × 18',
      fundo: '700 × 600 × 6',
    });
  });

  it('fundo embutido: entre as peças, com folga de 1 mm por lado', () => {
    const r = calcular('tampo_base_entre_laterais', 'fundo_embutido');
    expect(pecas(r).fundo).toBe('662 × 562 × 6');
    expect(pecas(r).lateral_esquerda).toBe('700 × 550 × 18');
    expect(r.medidas.Pint).toBe(5440);
  });

  it('tampo sobre laterais com avanço frontal de 20 mm', () => {
    const r = calcular('tampo_sobre_laterais', 'fundo_canal', { parametros: { af: 200 } });
    expect(pecas(r)).toEqual({
      lateral_esquerda: '682 × 550 × 18',
      lateral_direita: '682 × 550 × 18',
      tampo: '600 × 570 × 18',
      base: '564 × 550 × 18',
      fundo: '678 × 578 × 6',
    });
  });

  it('tampo sobre laterais com fundo sobreposto: fundo vai até o tampo', () => {
    const r = calcular('tampo_sobre_laterais', 'fundo_sobreposto');
    expect(pecas(r)).toMatchObject({ lateral_esquerda: '682 × 544 × 18', tampo: '600 × 550 × 18', fundo: '682 × 600 × 6' });
  });

  it('gabinete com travessas de 100 mm', () => {
    const r = calcular('base_entre_laterais_travessas', 'fundo_canal');
    expect(pecas(r)).toEqual({
      lateral_esquerda: '700 × 550 × 18',
      lateral_direita: '700 × 550 × 18',
      base: '564 × 550 × 18',
      travessa_frontal: '564 × 100 × 18',
      travessa_traseira: '564 × 100 × 18',
      fundo: '678 × 578 × 6',
    });
  });

  it('duas divisórias dividem 564 − 36 = 528 mm em três vãos de 176', () => {
    const r = calcular('tampo_base_entre_laterais', 'fundo_canal', { interior: { divisorias: 2 } });
    expect(r.vaos.map((v) => v.largura)).toEqual([1760, 1760, 1760]);
    expect(pecas(r).divisoria_1).toBe('664 × 534 × 18');
    expect(r.componentes.filter((c) => c.papel === 'divisoria')).toHaveLength(2);
  });

  it('resto de 0,1 mm vai para o primeiro vão, e a soma fecha exata', () => {
    const r = calcular('tampo_base_entre_laterais', 'fundo_canal', { L: dmm(6001), interior: { divisorias: 2 } });
    expect(r.vaos.map((v) => v.largura)).toEqual([1761, 1760, 1760]);
  });

  it('vão com largura fixa; os outros dividem o resto', () => {
    const r = calcular('tampo_base_entre_laterais', 'fundo_canal', {
      interior: { divisorias: 2, largurasVaos: [mm(200), null, null], prateleiras: [{ quantidade: 1, tipo: 'fixa' }, { quantidade: 0, tipo: 'fixa' }, { quantidade: 2, tipo: 'regulavel' }] },
    });
    expect(r.vaos.map((v) => [v.largura, v.fixo])).toEqual([
      [2000, true],
      [1640, false],
      [1640, false],
    ]);
    expect(pecas(r)).toMatchObject({ prateleira_v1_1: '200 × 534 × 18', prateleira_v3_1: '162 × 532 × 18', prateleira_v3_2: '162 × 532 × 18' });
    expect(r.componentes.some((c) => c.id.startsWith('prateleira_v2'))).toBe(false);
  });
});

describe('validações', () => {
  it('travessas largas demais para a profundidade', () => {
    const r = calcular('base_entre_laterais_travessas', 'fundo_canal', { parametros: { t: 3000 } });
    expect(r.valido).toBe(false);
    expect(r.erros[0]?.mensagem).toBe('As duas travessas (300 mm cada) não cabem na profundidade da caixa (550 mm).');
  });

  it('canal mais fundo que a chapa', () => {
    const r = calcular('tampo_base_entre_laterais', 'fundo_canal', { espessuraEstrutura: mm(6), parametros: { c: 80 } });
    expect(r.erros.map((e) => e.mensagem)).toContain('O canal (8 mm) não pode ser tão fundo quanto a espessura da chapa (6 mm).');
  });

  it('módulo estreito demais para a espessura', () => {
    const r = calcular('tampo_base_entre_laterais', 'fundo_canal', { L: mm(80) });
    expect(r.valido).toBe(false);
    expect(r.erros[0]?.mensagem).toContain('A largura interna ficou em 44 mm');
  });

  it('vãos fixos que passam da largura interna', () => {
    const r = calcular('tampo_base_entre_laterais', 'fundo_canal', { interior: { divisorias: 1, largurasVaos: [mm(400), mm(200)] } });
    expect(r.erros[0]?.codigo).toBe('vaos_nao_fecham');
  });

  it('vão menor que 50 mm', () => {
    const r = calcular('tampo_base_entre_laterais', 'fundo_canal', { interior: { divisorias: 1, largurasVaos: [mm(500), null] } });
    expect(r.erros.map((e) => e.codigo)).toContain('vao_estreito');
  });

  it('entradas e parâmetros fora dos limites', () => {
    expect(calcular('tampo_base_entre_laterais', 'fundo_canal', { A: mm(7000) }).erros[0]?.mensagem).toContain('Altura precisa ficar entre 50 e 6000 mm');
    expect(calcular('tampo_base_entre_laterais', 'fundo_canal', { parametros: { c: 500 } }).erros[0]?.mensagem).toContain('Profundidade do canal');
    expect(calcular('tampo_base_entre_laterais', 'fundo_canal', { parametros: { t: 1000 } }).erros[0]?.codigo).toBe('parametro_desconhecido');
  });

  it('recuo frontal maior que a profundidade livre zera a prateleira', () => {
    // P = 100: profundidade livre = 100 − 10 − 6 = 84 mm; 84 − 2 − 100 < 0
    const r = calcular('tampo_base_entre_laterais', 'fundo_canal', {
      P: mm(100),
      parametros: { rfp: 1000 },
      interior: { divisorias: 0, prateleiras: { quantidade: 1, tipo: 'regulavel' } },
    });
    expect(r.valido).toBe(false);
    expect(r.erros.some((e) => e.codigo === 'peca_invalida' && e.componente === 'prateleira_v1_1')).toBe(true);
  });
});

describe('cabeNaChapa()', () => {
  const chapa = { comprimento: mm(2750), largura: mm(1850) };
  it('sem veio, a peça pode girar', () => {
    expect(cabeNaChapa({ comprimento: mm(1800), largura: mm(2700) }, chapa, 'sem_veio')).toBe(true);
  });
  it('com veio, a peça não gira', () => {
    expect(cabeNaChapa({ comprimento: mm(1800), largura: mm(2700) }, chapa, 'comprimento')).toBe(false);
    expect(cabeNaChapa({ comprimento: mm(1800), largura: mm(2700) }, chapa, 'largura')).toBe(true);
    expect(cabeNaChapa({ comprimento: mm(2750), largura: mm(1850) }, chapa, 'comprimento')).toBe(true);
  });
  it('peça maior que a chapa nunca cabe', () => {
    expect(cabeNaChapa({ comprimento: mm(2800), largura: mm(100) }, chapa, 'sem_veio')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Propriedades: valem para qualquer módulo válido.
// ---------------------------------------------------------------------------

const arbEntrada = fc.record({
  montagem: fc.constantFrom(...MONTAGENS_PADRAO.map((m) => m.codigo)),
  fundo: fc.constantFrom(...FUNDOS_PADRAO.map((f) => f.codigo)),
  L: fc.integer({ min: 1500, max: 30000 }),
  A: fc.integer({ min: 1500, max: 28000 }),
  P: fc.integer({ min: 2500, max: 7000 }),
  e: fc.constantFrom(90, 150, 180, 183, 250),
  ef: fc.constantFrom(30, 60, 90),
  divisorias: fc.integer({ min: 0, max: 4 }),
  prateleiras: fc.integer({ min: 0, max: 4 }),
  tipo: fc.constantFrom('fixa' as const, 'regulavel' as const),
  al: fc.integer({ min: 0, max: 300 }),
  af: fc.integer({ min: 0, max: 300 }),
  rfp: fc.integer({ min: 0, max: 600 }),
  rfd: fc.integer({ min: 0, max: 600 }),
});

type ArbEntrada = typeof arbEntrada extends fc.Arbitrary<infer T> ? T : never;

function rodar(x: ArbEntrada): ResultadoModulo {
  const parametros: Record<string, number> = { rfp: x.rfp, rfd: x.rfd, ...(x.montagem === 'tampo_sobre_laterais' ? { al: x.al, af: x.af } : {}) };
  return calcularModulo(modeloPadrao(x.montagem, x.fundo), {
    L: dmm(x.L),
    A: dmm(x.A),
    P: dmm(x.P),
    espessuraEstrutura: dmm(x.e),
    espessuraFundo: dmm(x.ef),
    parametros,
    interior: { divisorias: x.divisorias, prateleiras: { quantidade: x.prateleiras, tipo: x.tipo } },
  });
}

describe('propriedades', () => {
  it('módulo válido não tem peça com medida nula ou negativa', () => {
    fc.assert(
      fc.property(arbEntrada, (x) => {
        const r = rodar(x);
        return !r.valido || r.componentes.every((c) => c.comprimento > 0 && c.largura > 0 && Number.isSafeInteger(c.comprimento) && Number.isSafeInteger(c.largura));
      }),
    );
  });

  it('vãos + divisórias = largura interna, exato', () => {
    fc.assert(
      fc.property(arbEntrada, (x) => {
        const r = rodar(x);
        if (r.vaos.length === 0) return true;
        const soma = r.vaos.reduce((s, v) => s + v.largura, 0) + x.divisorias * x.e;
        return soma === r.medidas.Li;
      }),
    );
  });

  it('nenhuma peça invade outra (só o fundo entra no canal) e todas ficam dentro do módulo', () => {
    fc.assert(
      fc.property(arbEntrada, (x) => {
        const r = rodar(x);
        if (!r.valido) return true;
        const al = x.montagem === 'tampo_sobre_laterais' ? x.al : 0;
        const af = x.montagem === 'tampo_sobre_laterais' ? x.af : 0;
        for (const c of r.componentes) {
          const k = c.caixa;
          if (!caixaConfere(c)) return false;
          if (k.x < -al || k.y < 0 || k.z < -af || k.x + k.dx > x.L + al || k.y + k.dy > x.A || k.z + k.dz > x.P) return false;
        }
        const { c: canal, g } = r.medidas as Record<string, number>;
        for (const col of colisoes(r.componentes)) {
          if (x.fundo !== 'fundo_canal' || (col.a !== 'fundo' && col.b !== 'fundo')) return false;
          // O fundo entra exatamente c − g no canal, com a própria espessura.
          const k = col.regiao;
          if (k.dz !== x.ef) return false;
          if (Math.min(k.dx, k.dy) !== canal! - g!) return false;
        }
        return true;
      }),
    );
  });

  it('prateleiras e divisórias não passam da profundidade livre; regulável = vão − 2 folgas', () => {
    fc.assert(
      fc.property(arbEntrada, (x) => {
        const r = rodar(x);
        if (!r.valido) return true;
        const { Pint, fl } = r.medidas as Record<string, number>;
        return r.componentes.every((c) => {
          if (c.papel === 'divisoria' || c.papel.startsWith('prateleira')) {
            if (c.largura > Pint!) return false;
          }
          if (c.papel === 'prateleira_regulavel') {
            const vao = Number(/_v(\d+)_/.exec(c.id)![1]);
            return c.comprimento === r.vaos[vao - 1]!.largura - 2 * fl!;
          }
          return true;
        });
      }),
    );
  });

  it('fundo em canal entra exatamente (canal − folga) em cada lado', () => {
    fc.assert(
      fc.property(arbEntrada, (x) => {
        if (x.fundo !== 'fundo_canal') return true;
        const r = rodar(x);
        if (!r.valido) return true;
        const fundo = r.componentes.find((c) => c.papel === 'fundo')!;
        const { Hi, Li, c, g } = r.medidas as Record<string, number>;
        return fundo.comprimento - Hi! === 2 * (c! - g!) && fundo.largura - Li! === 2 * (c! - g!);
      }),
    );
  });

  it('aumentar a largura em Δ aumenta tampo e base em Δ e não muda as laterais', () => {
    fc.assert(
      fc.property(arbEntrada, fc.integer({ min: 1, max: 5000 }), (x, delta) => {
        if (x.montagem !== 'tampo_base_entre_laterais' || x.L + delta > 30000) return true;
        const a = rodar(x);
        const b = rodar({ ...x, L: x.L + delta });
        if (!a.valido || !b.valido) return true;
        const peca = (r: ResultadoModulo, id: string) => r.componentes.find((c) => c.id === id)!;
        return (
          peca(b, 'tampo').comprimento - peca(a, 'tampo').comprimento === delta &&
          peca(b, 'base').comprimento - peca(a, 'base').comprimento === delta &&
          peca(b, 'lateral_esquerda').comprimento === peca(a, 'lateral_esquerda').comprimento &&
          peca(b, 'lateral_esquerda').largura === peca(a, 'lateral_esquerda').largura
        );
      }),
    );
  });

  it('é determinístico: mesma entrada, mesmo resultado', () => {
    fc.assert(fc.property(arbEntrada, (x) => JSON.stringify(rodar(x)) === JSON.stringify(rodar(x))));
  });
});
