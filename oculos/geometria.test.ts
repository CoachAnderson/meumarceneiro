import { describe, expect, it } from 'vitest';
import { Euler, Quaternion, Vector3 } from 'three';
import { giroAoColocar, plantaDoComodo, quaternionDoCelular, rumo, PROFUNDIDADE_ILUSTRATIVA } from './geometria';

const comodo = { largura: 3, altura: 2.6, anguloEsquerdo: 90, anguloDireito: 90, profundidade: 1.8, posicaoMovel: 0.5, pontos: [] };

describe('planta do cômodo', () => {
  it('parede do móvel em z = 0, com o móvel na distância medida do canto esquerdo', () => {
    const p = plantaDoComodo(comodo, 1, 2);
    expect(p.esquerdo).toEqual({ x: -1, z: 0 });
    expect(p.direito).toEqual({ x: 2, z: 0 });
    expect(p.fimEsquerdo.x).toBeCloseTo(-1, 9);
    expect(p.fimEsquerdo.z).toBeCloseTo(1.8, 9);
    expect(p.ilustrativo).toEqual({ altura: false, profundidade: false, cantos: false });
  });

  it('canto fechado (85°) traz a parede lateral para dentro da sala', () => {
    const p = plantaDoComodo({ ...comodo, anguloEsquerdo: 85, anguloDireito: 95 }, 1, 2);
    expect(p.fimEsquerdo.x).toBeGreaterThan(p.esquerdo.x);
    expect(p.fimDireito.x).toBeGreaterThan(p.direito.x);
  });

  it('o que não foi medido é desenhado, mas marcado como ilustrativo', () => {
    const p = plantaDoComodo({ ...comodo, altura: null, profundidade: null, anguloDireito: null }, 1, 2.4);
    expect(p.profundidade).toBe(PROFUNDIDADE_ILUSTRATIVA);
    expect(p.altura).toBeCloseTo(2.7, 9);
    expect(p.ilustrativo).toEqual({ altura: true, profundidade: true, cantos: true });
  });
});

describe('colocar o móvel', () => {
  it('na parede: as costas na parede e a frente para a normal', () => {
    const r = giroAoColocar({ x: 1, y: 0, z: 0 }, { x: 0, z: 0 }, { x: 5, z: 5 })!;
    expect(r.parede).toBe(true);
    // Girado +90°: a frente (+z) passa a apontar para +x.
    const frente = new Vector3(0, 0, 1).applyEuler(new Euler(0, r.giro, 0));
    expect(frente.x).toBeCloseTo(1, 9);
  });

  it('no chão: de frente para quem está colocando', () => {
    const r = giroAoColocar({ x: 0, y: 1, z: 0 }, { x: 0, z: 0 }, { x: 0, z: -2 })!;
    expect(r.parede).toBe(false);
    const frente = new Vector3(0, 0, 1).applyEuler(new Euler(0, r.giro, 0));
    expect(frente.z).toBeCloseTo(-1, 9);
  });

  it('rampa ou teto: não coloca', () => {
    expect(giroAoColocar({ x: 0.7, y: 0.5, z: 0 }, { x: 0, z: 0 }, { x: 1, z: 1 })).toBeNull();
    expect(giroAoColocar({ x: 0, y: -1, z: 0 }, { x: 0, z: 0 }, { x: 1, z: 1 })).toBeNull();
  });
});

describe('orientação do celular nos óculos de encaixar', () => {
  it('é a mesma conta do three.js (Euler YXZ, −90° em x e giro da tela)', () => {
    for (const [a, b, g, o] of [[0, 90, 0, 0], [30, 80, -10, 90], [200, 45, 20, -90], [359, 120, 60, 0]] as const) {
      const ref = new Quaternion().setFromEuler(new Euler((b * Math.PI) / 180, (a * Math.PI) / 180, (-g * Math.PI) / 180, 'YXZ'));
      ref.multiply(new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2));
      ref.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), (-o * Math.PI) / 180));
      const q = quaternionDoCelular(a, b, g, o);
      expect(q[0]).toBeCloseTo(ref.x, 9);
      expect(q[1]).toBeCloseTo(ref.y, 9);
      expect(q[2]).toBeCloseTo(ref.z, 9);
      expect(q[3]).toBeCloseTo(ref.w, 9);
    }
  });

  it('celular em pé olhando para a frente (beta 90°) olha para o horizonte; o rumo acompanha a bússola', () => {
    const q = quaternionDoCelular(0, 90, 0, 0);
    const olhar = new Vector3(0, 0, -1).applyQuaternion(new Quaternion(...q));
    expect(olhar.y).toBeCloseTo(0, 9);
    expect(rumo(q)).toBeCloseTo(0, 9);
    const q90 = quaternionDoCelular(90, 90, 0, 0);
    expect(rumo(q90)).toBeCloseTo(Math.PI / 2, 9);
  });
});
