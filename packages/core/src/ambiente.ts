/**
 * "Ver no ambiente": o móvel em tamanho real para a câmera do celular
 * (realidade aumentada). Aqui fica só a geometria, em metros, pronta para
 * virar arquivo 3D; a gravação do arquivo é feita na tela.
 *
 * Posição: o móvel apoiado no chão (y = 0), centrado na largura, com as
 * costas na parede (z = 0) e a frente virada para quem olha (z positivo).
 */
import { envelope } from './geometria';
import type { Componente } from './modulo';
import type { PapelComponente } from './regra';

export interface CaixaAmbiente {
  id: string;
  papel: PapelComponente;
  /** Centro da peça, em metros. */
  centro: [number, number, number];
  /** Largura, altura e profundidade, em metros. */
  tamanho: [number, number, number];
}

export interface ModeloAmbiente {
  caixas: CaixaAmbiente[];
  /** Tamanho total do móvel em metros: largura, altura, profundidade. */
  dimensoes: [number, number, number];
}

/** Décimos de mm → metros (divisão, para 180 virar exatamente 0,018). */
const m = (v: number) => v / 10_000;

export function modeloParaAmbiente(componentes: readonly Pick<Componente, 'id' | 'papel' | 'caixa'>[]): ModeloAmbiente {
  const env = envelope(componentes);
  const meioX = env.x + env.dx / 2;
  const fundo = env.z + env.dz;
  return {
    dimensoes: [m(env.dx), m(env.dy), m(env.dz)],
    caixas: componentes.map((c) => {
      const k = c.caixa;
      return {
        id: c.id,
        papel: c.papel,
        centro: [m(k.x + k.dx / 2 - meioX), m(k.y + k.dy / 2 - env.y), m(fundo - (k.z + k.dz / 2))],
        tamanho: [m(k.dx), m(k.dy), m(k.dz)],
      };
    }),
  };
}

/**
 * Endereço que abre o visualizador de realidade aumentada do Android (Scene
 * Viewer) com um arquivo .glb. `resizable=false` trava o tamanho real: o
 * cliente não consegue esticar o móvel com os dedos.
 */
export function enderecoSceneViewer(arquivo: string, titulo: string, voltar: string): string {
  if (!/^https:\/\/[^\s/]+\/\S*$/.test(arquivo)) throw new Error('O arquivo 3D precisa estar em endereço https.');
  const c = encodeURIComponent;
  const parametros = `file=${c(arquivo)}&mode=ar_preferred&resizable=false&title=${c(titulo.slice(0, 60))}`;
  return `intent://arvr.google.com/scene-viewer/1.0?${parametros}#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=${c(voltar)};end;`;
}
