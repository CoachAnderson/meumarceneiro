import { describe, expect, it } from 'vitest';
import {
  calcularModulo,
  colisoes,
  compilarModelo,
  envelope,
  facesDasBordas,
  ErroRegra,
  FUNDO_CANAL,
  gerarPecas,
  intersecao,
  mm,
  modeloPadrao,
  MONTAGEM_TAMPO_BASE_ENTRE_LATERAIS,
  projetar,
  type Caixa,
  type EntradaModulo,
} from '../src';

const c = (x: number, y: number, z: number, dx: number, dy: number, dz: number) => ({ x, y, z, dx, dy, dz }) as Caixa;

describe('intersecao()', () => {
  it('peças que só encostam não colidem', () => {
    expect(intersecao(c(0, 0, 0, 10, 10, 10), c(10, 0, 0, 10, 10, 10))).toBeNull();
  });
  it('devolve a região comum', () => {
    expect(intersecao(c(0, 0, 0, 10, 10, 10), c(5, 2, -3, 10, 4, 6))).toEqual(c(5, 2, 0, 5, 4, 3));
  });
});

const REF: EntradaModulo = {
  L: mm(600), A: mm(700), P: mm(550), espessuraEstrutura: mm(18), espessuraFundo: mm(6),
  parametros: { c: 80, g: 10, r: 100 },
  interior: { divisorias: 1, prateleiras: { quantidade: 2, tipo: 'regulavel' } },
};

describe('posição das peças no caso de referência (conferido à mão)', () => {
  const r = calcularModulo(modeloPadrao('tampo_base_entre_laterais', 'fundo_canal'), REF);
  const por = Object.fromEntries(r.componentes.map((k) => [k.id, k.caixa]));

  it('laterais, tampo e base', () => {
    expect(por['lateral_direita']).toEqual(c(5820, 0, 0, 180, 7000, 5500));
    expect(por['tampo']).toEqual(c(180, 6820, 0, 5640, 180, 5500));
  });

  it('fundo em canal: 7 mm dentro de cada peça, a 10 mm da traseira', () => {
    // x = 18 − 7; z = 550 − 10 − 6
    expect(por['fundo']).toEqual(c(110, 110, 5340, 5780, 6780, 60));
  });

  it('divisória no meio, da frente até o fundo', () => {
    // vãos (564 − 18) / 2 = 273; divisória em 18 + 273
    expect(por['divisoria_1']).toEqual(c(2910, 180, 0, 180, 6640, 5340));
  });

  it('só o fundo colide, e só com laterais, tampo e base', () => {
    const pares = colisoes(r.componentes).map((k) => [k.a, k.b].sort().join('+')).sort();
    expect(pares).toEqual(['base+fundo', 'fundo+lateral_direita', 'fundo+lateral_esquerda', 'fundo+tampo']);
  });

  it('envelope = medidas externas', () => {
    expect(envelope(r.componentes)).toEqual(c(0, 0, 0, 6000, 7000, 5500));
  });
});

describe('canal sai da geometria', () => {
  it('gabinete com travessas: canal também na travessa traseira, não na frontal', () => {
    const e = { ...REF, parametros: { c: 80, g: 10, r: 100, t: 1000 } };
    const resultado = calcularModulo(modeloPadrao('base_entre_laterais_travessas', 'fundo_canal'), e);
    expect(resultado.erros).toEqual([]);
    const pecas = gerarPecas({ resultado, montagem: 'base_entre_laterais_travessas', fundo: 'fundo_canal', espessuraFundo: mm(6) });
    const canais = pecas.flatMap((p) => p.usinagens.filter((u) => u.tipo === 'canal_fundo').map((u) => ({ id: p.id, u })));
    expect(canais.map((c) => c.id).sort()).toEqual(['base', 'lateral_direita', 'lateral_esquerda', 'travessa_traseira']);
    for (const { u } of canais) if (u.tipo === 'canal_fundo') expect(u.distanciaTras).toBe(mm(10));
  });
});

describe('projetar()', () => {
  const r = calcularModulo(modeloPadrao('tampo_base_entre_laterais', 'fundo_sobreposto'), { ...REF, parametros: {} });

  it('frente: o fundo (mais distante) é desenhado primeiro', () => {
    expect(projetar(r.componentes, 'frente')[0]!.id).toBe('fundo');
  });

  it('lateral: frente à direita; a lateral direita é desenhada por último', () => {
    const v = projetar(r.componentes, 'lateral');
    expect(v.at(-1)!.id).toBe('lateral_direita');
    const fundo = v.find((x) => x.id === 'fundo')!;
    expect(fundo.u).toBe(0); // o fundo fica no extremo de trás (esquerda do desenho)
  });

  it('planta: o tampo cobre tudo, desenhado por último', () => {
    expect(projetar(r.componentes, 'planta').at(-1)!.id).toBe('tampo');
  });
});

describe('regra sem posição é recusada', () => {
  it('falta caixa', () => {
    const { caixa: _c, ...semCaixa } = MONTAGEM_TAMPO_BASE_ENTRE_LATERAIS.componentes[0]!;
    const regra = { ...MONTAGEM_TAMPO_BASE_ENTRE_LATERAIS, componentes: [semCaixa as never, ...MONTAGEM_TAMPO_BASE_ENTRE_LATERAIS.componentes.slice(1)] };
    expect(() => compilarModelo(regra, FUNDO_CANAL)).toThrow(ErroRegra);
  });

  it('posição que não bate com a peça vira erro do módulo', () => {
    const tampo = MONTAGEM_TAMPO_BASE_ENTRE_LATERAIS.componentes.find((k) => k.id === 'tampo')!;
    const errado = { ...tampo, caixa: { ...tampo.caixa, dx: 'L' } };
    const regra = { ...MONTAGEM_TAMPO_BASE_ENTRE_LATERAIS, componentes: MONTAGEM_TAMPO_BASE_ENTRE_LATERAIS.componentes.map((k) => (k.id === 'tampo' ? errado : k)) };
    const r = calcularModulo(compilarModelo(regra, FUNDO_CANAL), REF);
    expect(r.valido).toBe(false);
    expect(r.erros.map((e) => e.codigo)).toContain('geometria_inconsistente');
  });
});

describe('facesDasBordas()', () => {
  const r = calcularModulo(modeloPadrao('tampo_base_entre_laterais', 'fundo_canal'), REF);
  const peca = (id: string) => r.componentes.find((k) => k.id === id)!;

  it('lateral: frente na face da frente (z menor), pontas embaixo e em cima', () => {
    expect(facesDasBordas(peca('lateral_esquerda'))).toEqual({
      frente: { eixo: 'z', lado: 'min' },
      tras: { eixo: 'z', lado: 'max' },
      ext1: { eixo: 'y', lado: 'min' },
      ext2: { eixo: 'y', lado: 'max' },
    });
  });

  it('tampo e prateleira: frente na face da frente, pontas à esquerda e à direita', () => {
    for (const id of ['tampo', 'prateleira_v1_1']) {
      const f = facesDasBordas(peca(id))!;
      expect(f.frente).toEqual({ eixo: 'z', lado: 'min' });
      expect(f.ext1.eixo).toBe('x');
    }
  });

  it('toda peça de módulo válido tem orientação', () => {
    for (const k of r.componentes) expect(facesDasBordas(k), k.id).not.toBeNull();
  });
});
