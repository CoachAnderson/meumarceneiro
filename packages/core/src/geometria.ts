/**
 * Geometria do módulo: interseção de peças, envelope e projeções 2D.
 * Tudo inteiro, em décimos de mm.
 */
import type { Caixa, Componente } from './modulo';
import { dmm } from './unidades';

/** Interseção com volume positivo, ou null (encostar não conta). */
export function intersecao(a: Caixa, b: Caixa): Caixa | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const z = Math.max(a.z, b.z);
  const dx = Math.min(a.x + a.dx, b.x + b.dx) - x;
  const dy = Math.min(a.y + a.dy, b.y + b.dy) - y;
  const dz = Math.min(a.z + a.dz, b.z + b.dz) - z;
  if (dx <= 0 || dy <= 0 || dz <= 0) return null;
  return { x: dmm(x), y: dmm(y), z: dmm(z), dx: dmm(dx), dy: dmm(dy), dz: dmm(dz) };
}

export interface Colisao {
  a: string;
  b: string;
  regiao: Caixa;
}

/** Todos os pares de peças que ocupam o mesmo espaço. */
export function colisoes(componentes: readonly Pick<Componente, 'id' | 'caixa'>[]): Colisao[] {
  const r: Colisao[] = [];
  for (let i = 0; i < componentes.length; i++) {
    for (let j = i + 1; j < componentes.length; j++) {
      const a = componentes[i]!;
      const b = componentes[j]!;
      const regiao = intersecao(a.caixa, b.caixa);
      if (regiao) r.push({ a: a.id, b: b.id, regiao });
    }
  }
  return r;
}

/** Menor caixa que contém todas as peças. */
export function envelope(componentes: readonly Pick<Componente, 'caixa'>[]): Caixa {
  if (componentes.length === 0) return { x: dmm(0), y: dmm(0), z: dmm(0), dx: dmm(0), dy: dmm(0), dz: dmm(0) };
  const xs = componentes.map((c) => c.caixa);
  const x0 = Math.min(...xs.map((c) => c.x));
  const y0 = Math.min(...xs.map((c) => c.y));
  const z0 = Math.min(...xs.map((c) => c.z));
  const x1 = Math.max(...xs.map((c) => c.x + c.dx));
  const y1 = Math.max(...xs.map((c) => c.y + c.dy));
  const z1 = Math.max(...xs.map((c) => c.z + c.dz));
  return { x: dmm(x0), y: dmm(y0), z: dmm(z0), dx: dmm(x1 - x0), dy: dmm(y1 - y0), dz: dmm(z1 - z0) };
}

export type Vista = 'frente' | 'lateral' | 'planta';

export interface RetanguloVista {
  id: string;
  /** Horizontal, da esquerda para a direita no desenho. */
  u: number;
  /** Vertical, de baixo para cima no desenho. */
  v: number;
  du: number;
  dv: number;
}

/**
 * Projeta as peças numa vista, já na ordem de desenho (do mais distante para
 * o mais próximo de quem olha), para que as peças da frente cubram as de trás.
 *
 * - frente: olhando de frente; u = x, v = y.
 * - lateral: olhando do lado direito; u = profundidade com a frente à
 *   direita, v = y.
 * - planta: olhando de cima; u = x, v = profundidade com a frente embaixo.
 */
export function projetar(componentes: readonly Pick<Componente, 'id' | 'caixa'>[], vista: Vista): RetanguloVista[] {
  const env = envelope(componentes);
  const fundoZ = env.z + env.dz;
  const itens = componentes.map((c) => {
    const k = c.caixa;
    switch (vista) {
      case 'frente':
        return { prof: k.z, prof2: k.z + k.dz, r: { id: c.id, u: k.x, v: k.y, du: k.dx, dv: k.dy } };
      case 'lateral':
        // Quem olha da direita vê primeiro as peças de x maior.
        return { prof: -(k.x + k.dx), prof2: -k.x, r: { id: c.id, u: fundoZ - (k.z + k.dz), v: k.y, du: k.dz, dv: k.dy } };
      case 'planta':
        return { prof: -(k.y + k.dy), prof2: -k.y, r: { id: c.id, u: k.x, v: fundoZ - (k.z + k.dz), du: k.dx, dv: k.dz } };
    }
  });
  // Mais distante primeiro: compara a face mais próxima de quem olha, depois a
  // mais distante; empate mantém a ordem original.
  return itens
    .map((it, i) => ({ ...it, i }))
    .sort((a, b) => b.prof - a.prof || b.prof2 - a.prof2 || a.i - b.i)
    .map((it) => it.r);
}

export type Eixo = 'x' | 'y' | 'z';

export interface Face {
  eixo: Eixo;
  lado: 'min' | 'max';
}

export interface FacesDasBordas {
  frente: Face;
  tras: Face;
  ext1: Face;
  ext2: Face;
}

const TAMANHO: Record<Eixo, 'dx' | 'dy' | 'dz'> = { x: 'dx', y: 'dy', z: 'dz' };

// Ordem de preferência [comprimento, largura, espessura] quando há medidas
// iguais: largura na profundidade (z) primeiro, como em laterais e tampos.
const ORIENTACOES: ReadonlyArray<readonly [Eixo, Eixo, Eixo]> = [
  ['y', 'z', 'x'],
  ['x', 'z', 'y'],
  ['y', 'x', 'z'],
  ['x', 'y', 'z'],
  ['z', 'x', 'y'],
  ['z', 'y', 'x'],
];

/**
 * Em que face da caixa fica cada borda da peça. As bordas `frente`/`tras`
 * correm no sentido do comprimento e ficam nas pontas do eixo da largura;
 * `frente` é a do lado menor (para largura na profundidade, a face da frente
 * do móvel). `ext1`/`ext2` ficam nas pontas do eixo do comprimento.
 * Null se a caixa não tem o tamanho da peça.
 */
/** Eixos do móvel em que correm o comprimento, a largura e a espessura da peça. Null se a caixa não confere. */
export function orientacaoDaPeca(peca: Pick<Componente, 'comprimento' | 'largura' | 'espessura' | 'caixa'>): readonly [Eixo, Eixo, Eixo] | null {
  return (
    ORIENTACOES.find(
      ([c, l, e]) => peca.caixa[TAMANHO[c]] === peca.comprimento && peca.caixa[TAMANHO[l]] === peca.largura && peca.caixa[TAMANHO[e]] === peca.espessura,
    ) ?? null
  );
}

export function facesDasBordas(
  peca: Pick<Componente, 'comprimento' | 'largura' | 'espessura' | 'caixa'>,
): FacesDasBordas | null {
  const orientacao = ORIENTACOES.find(
    ([c, l, e]) =>
      peca.caixa[TAMANHO[c]] === peca.comprimento &&
      peca.caixa[TAMANHO[l]] === peca.largura &&
      peca.caixa[TAMANHO[e]] === peca.espessura,
  );
  if (!orientacao) return null;
  const [c, l] = orientacao;
  return {
    frente: { eixo: l, lado: 'min' },
    tras: { eixo: l, lado: 'max' },
    ext1: { eixo: c, lado: 'min' },
    ext2: { eixo: c, lado: 'max' },
  };
}
