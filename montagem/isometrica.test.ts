import { describe, expect, it } from 'vitest';
import type { Caixa } from '@marcenaria/core';
import { ordemDePintura, projetar, secobrem } from './isometrica';

const caixa = (x: number, y: number, z: number, dx: number, dy: number, dz: number) => ({ x, y, z, dx, dy, dz }) as Caixa;

describe('desenho em perspectiva', () => {
  it('quem está na frente, em cima ou à direita é pintado depois', () => {
    const fundo = caixa(0, 0, 500, 1000, 1000, 60);
    const frente = caixa(0, 0, 0, 1000, 1000, 180);
    expect(ordemDePintura([frente, fundo])).toEqual([1, 0]);
    const base = caixa(0, 0, 0, 1000, 180, 500);
    const tampo = caixa(0, 820, 0, 1000, 180, 500);
    const lateral = caixa(1000, 0, 0, 180, 1000, 500);
    const ordem = ordemDePintura([lateral, tampo, base]);
    expect(ordem.indexOf(2)).toBeLessThan(ordem.indexOf(0));
  });

  it('frente do móvel, à direita e para cima: as direções da tela', () => {
    const [x0, y0] = projetar({ x: 0, y: 0, z: 0 });
    expect(projetar({ x: 100, y: 0, z: 0 })[0]).toBeGreaterThan(x0);
    expect(projetar({ x: 0, y: 100, z: 0 })[1]).toBeLessThan(y0);
    expect(projetar({ x: 0, y: 0, z: 100 })[1]).toBeLessThan(y0);
  });

  it('polígonos que só encostam não se cobrem', () => {
    const a: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(secobrem(a, [[1, 0], [2, 0], [2, 1], [1, 1]])).toBe(false);
    expect(secobrem(a, [[0.5, 0.5], [2, 0.5], [2, 2], [0.5, 2]])).toBe(true);
  });
});
