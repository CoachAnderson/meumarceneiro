/**
 * Contas do cômodo e da postura nos óculos (sem three.js, para testar fácil).
 * Metros; o móvel centrado em x = 0, costas na parede em z = 0, frente para +z.
 */
import type { ComodoImersivo } from '@marcenaria/core';

export type Ponto2 = { x: number; z: number };

/** Profundidade desenhada quando a medição não trouxe a profundidade livre. */
export const PROFUNDIDADE_ILUSTRATIVA = 2.5;

export interface PlantaComodo {
  /** Cantos da parede do móvel. */
  esquerdo: Ponto2;
  direito: Ponto2;
  /** Pontas das paredes laterais (até a profundidade desenhada). */
  fimEsquerdo: Ponto2;
  fimDireito: Ponto2;
  altura: number;
  profundidade: number;
  /** O que foi desenhado sem ter sido medido (para avisar na cena). */
  ilustrativo: { altura: boolean; profundidade: boolean; cantos: boolean };
}

const rad = (g: number) => (g * Math.PI) / 180;

/**
 * Planta do cômodo: a parede do móvel em z = 0 e as paredes laterais saindo
 * dos cantos no ângulo medido (90° se o esquadro não foi medido).
 */
export function plantaDoComodo(c: ComodoImersivo, larguraMovel: number, alturaMovel: number): PlantaComodo {
  const xe = -larguraMovel / 2 - c.posicaoMovel;
  const xd = xe + c.largura;
  const profundidade = c.profundidade ?? PROFUNDIDADE_ILUSTRATIVA;
  const ae = rad(c.anguloEsquerdo ?? 90);
  const ad = rad(c.anguloDireito ?? 90);
  // Ângulo interno do canto, entre a parede do móvel e a lateral.
  const fimEsquerdo = { x: xe + Math.cos(ae) * profundidade, z: Math.sin(ae) * profundidade };
  const fimDireito = { x: xd - Math.cos(ad) * profundidade, z: Math.sin(ad) * profundidade };
  return {
    esquerdo: { x: xe, z: 0 },
    direito: { x: xd, z: 0 },
    fimEsquerdo,
    fimDireito,
    altura: c.altura ?? Math.max(2.6, alturaMovel + 0.3),
    profundidade,
    ilustrativo: { altura: c.altura === null, profundidade: c.profundidade === null, cantos: c.anguloEsquerdo === null || c.anguloDireito === null },
  };
}

/**
 * Para onde o móvel olha ao ser colocado, pela normal da superfície tocada:
 * - parede (normal quase horizontal): costas na parede, frente para dentro da sala;
 * - chão: de frente para quem está colocando.
 * Devolve o giro em torno do eixo vertical (radianos) ou null se a superfície é inclinada demais.
 */
export function giroAoColocar(normal: { x: number; y: number; z: number }, ponto: Ponto2, quemOlha: Ponto2): { giro: number; parede: boolean } | null {
  const n = Math.hypot(normal.x, normal.y, normal.z) || 1;
  const ny = normal.y / n;
  if (Math.abs(ny) < 0.3) return { giro: Math.atan2(normal.x, normal.z), parede: true };
  if (ny > 0.7) return { giro: Math.atan2(quemOlha.x - ponto.x, quemOlha.z - ponto.z), parede: false };
  return null;
}

/** Converte a orientação do celular (graus) no quaternion da câmera (x, y, z, w). Fórmula do antigo DeviceOrientationControls do three.js. */
export function quaternionDoCelular(alfa: number, beta: number, gama: number, orientacaoTela: number): [number, number, number, number] {
  const a = rad(alfa);
  const b = rad(beta);
  const g = rad(-gama);
  // Euler 'YXZ' (beta em x, alfa em y, −gama em z) → quaternion.
  const c1 = Math.cos(b / 2), c2 = Math.cos(a / 2), c3 = Math.cos(g / 2);
  const s1 = Math.sin(b / 2), s2 = Math.sin(a / 2), s3 = Math.sin(g / 2);
  let x = s1 * c2 * c3 + c1 * s2 * s3;
  let y = c1 * s2 * c3 - s1 * c2 * s3;
  let z = c1 * c2 * s3 - s1 * s2 * c3;
  let w = c1 * c2 * c3 + s1 * s2 * s3;
  // A câmera olha para fora da tela, não para cima: −90° em x.
  [x, y, z, w] = multiplicar([x, y, z, w], [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
  // Tela deitada: gira pelo ângulo da tela em z.
  const o = rad(-orientacaoTela) / 2;
  return multiplicar([x, y, z, w], [0, 0, Math.sin(o), Math.cos(o)]);
}

export function multiplicar(p: [number, number, number, number], q: [number, number, number, number]): [number, number, number, number] {
  const [ax, ay, az, aw] = p;
  const [bx, by, bz, bw] = q;
  return [ax * bw + aw * bx + ay * bz - az * by, ay * bw + aw * by + az * bx - ax * bz, az * bw + aw * bz + ax * by - ay * bx, aw * bw - ax * bx - ay * by - az * bz];
}

/** Giro em torno do eixo vertical (rumo) de um quaternion, em radianos. */
export function rumo([x, y, z, w]: [number, number, number, number]): number {
  // Direção para onde a câmera olha (−z) projetada no chão.
  const fx = -(2 * (x * z + w * y));
  const fz = -(1 - 2 * (x * x + y * y));
  return Math.atan2(-fx, -fz);
}
