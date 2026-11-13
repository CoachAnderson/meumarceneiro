/**
 * Desenho em perspectiva (vista da frente, pela direita e de cima) feito só
 * com SVG: serve para o manual impresso e para aparelhos sem 3D.
 *
 * Cada peça é uma caixa; desenha-se as três faces visíveis (frente, direita,
 * topo). A ordem de pintura vem de um plano que separa cada par de caixas que
 * se cobrem na tela: a que fica do lado de quem olha é pintada depois.
 */
import type { Caixa } from '@marcenaria/core';

type P3 = { x: number; y: number; z: number };
export type P2 = [number, number];

const TETA = (32 * Math.PI) / 180;
const FI = (24 * Math.PI) / 180;
const R = { x: Math.cos(TETA), y: 0, z: Math.sin(TETA) };
const U = { x: -Math.sin(TETA) * Math.sin(FI), y: Math.cos(FI), z: Math.cos(TETA) * Math.sin(FI) };

/** Ponto do móvel (z cresce para o fundo) na tela (y para baixo). */
export function projetar(p: P3): P2 {
  return [p.x * R.x + p.z * R.z, -(p.x * U.x + p.y * U.y + p.z * U.z)];
}

const cantos = (k: Caixa): P3[] => {
  const r: P3[] = [];
  for (const x of [k.x, k.x + k.dx]) for (const y of [k.y, k.y + k.dy]) for (const z of [k.z, k.z + k.dz]) r.push({ x, y, z });
  return r;
};

/** Contorno convexo (cadeia monótona). */
function contorno(pontos: P2[]): P2[] {
  const p = [...pontos].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const giro = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const baixo: P2[] = [];
  for (const q of p) {
    while (baixo.length >= 2 && giro(baixo.at(-2)!, baixo.at(-1)!, q) <= 0) baixo.pop();
    baixo.push(q);
  }
  const cima: P2[] = [];
  for (const q of [...p].reverse()) {
    while (cima.length >= 2 && giro(cima.at(-2)!, cima.at(-1)!, q) <= 0) cima.pop();
    cima.push(q);
  }
  return [...baixo.slice(0, -1), ...cima.slice(0, -1)];
}

/** Dois polígonos convexos se cobrem (mais que encostar)? */
export function secobrem(a: P2[], b: P2[], folga = 1e-6): boolean {
  for (const poli of [a, b]) {
    for (let i = 0; i < poli.length; i++) {
      const p = poli[i]!;
      const q = poli[(i + 1) % poli.length]!;
      const n: P2 = [q[1] - p[1], p[0] - q[0]];
      const proj = (l: P2[]) => l.map((v) => v[0] * n[0] + v[1] * n[1]);
      const pa = proj(a);
      const pb = proj(b);
      if (Math.max(...pa) <= Math.min(...pb) + folga || Math.max(...pb) <= Math.min(...pa) + folga) return false;
    }
  }
  return true;
}

/** `a` fica atrás de `b` (vista da frente, pela direita, de cima)? */
function atras(a: Caixa, b: Caixa): boolean | null {
  if (a.x + a.dx <= b.x) return true;
  if (b.x + b.dx <= a.x) return false;
  if (a.y + a.dy <= b.y) return true;
  if (b.y + b.dy <= a.y) return false;
  if (a.z >= b.z + b.dz) return true;
  if (b.z >= a.z + a.dz) return false;
  return null; // se cruzam: qualquer ordem
}

/** Ordem de pintura: do fundo para a frente. Devolve os índices. */
export function ordemDePintura(caixas: readonly Caixa[]): number[] {
  const n = caixas.length;
  const silhuetas = caixas.map((k) => contorno(cantos(k).map(projetar)));
  const profundidade = caixas.map((k) => {
    const c = { x: k.x + k.dx / 2, y: k.y + k.dy / 2, z: k.z + k.dz / 2 };
    return c.x * Math.sin(TETA) + c.y * Math.tan(FI) - c.z * Math.cos(TETA);
  });
  const antes: number[][] = Array.from({ length: n }, () => []);
  const grau = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!secobrem(silhuetas[i]!, silhuetas[j]!)) continue;
      const r = atras(caixas[i]!, caixas[j]!);
      if (r === null) continue;
      const [de, para] = r ? [i, j] : [j, i];
      antes[de]!.push(para);
      grau[para]!++;
    }
  }
  const feitos = new Set<number>();
  const ordem: number[] = [];
  while (ordem.length < n) {
    let melhor = -1;
    for (let i = 0; i < n; i++) {
      if (feitos.has(i) || grau[i]! > 0) continue;
      if (melhor < 0 || profundidade[i]! < profundidade[melhor]!) melhor = i;
    }
    // Ciclo (raro): solta a mais funda das que faltam.
    if (melhor < 0) for (let i = 0; i < n; i++) if (!feitos.has(i) && (melhor < 0 || profundidade[i]! < profundidade[melhor]!)) melhor = i;
    feitos.add(melhor);
    ordem.push(melhor);
    for (const k of antes[melhor]!) grau[k]!--;
  }
  return ordem;
}

export interface FacesVisiveis {
  topo: P2[];
  frente: P2[];
  direita: P2[];
}

export function facesVisiveis(k: Caixa): FacesVisiveis {
  const [x0, x1, y0, y1, z0, z1] = [k.x, k.x + k.dx, k.y, k.y + k.dy, k.z, k.z + k.dz];
  const p = (x: number, y: number, z: number) => projetar({ x, y, z });
  return {
    topo: [p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)],
    frente: [p(x0, y0, z0), p(x1, y0, z0), p(x1, y1, z0), p(x0, y1, z0)],
    direita: [p(x1, y0, z0), p(x1, y0, z1), p(x1, y1, z1), p(x1, y1, z0)],
  };
}

/** Retângulo que cabe todas as caixas, na tela. */
export function enquadrar(caixas: readonly Caixa[]): { x: number; y: number; largura: number; altura: number } {
  const pts = caixas.flatMap((k) => cantos(k).map(projetar));
  if (pts.length === 0) return { x: 0, y: 0, largura: 1, altura: 1 };
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, largura: Math.max(...xs) - x || 1, altura: Math.max(...ys) - y || 1 };
}
