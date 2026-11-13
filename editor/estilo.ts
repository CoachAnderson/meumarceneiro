import type { MaterialComponente, PapelComponente } from '@marcenaria/core';

/** Cores por papel, iguais no 2D e no 3D. */
export const ESTILO: Record<PapelComponente, { fill: string; stroke: string }> = {
  lateral: { fill: '#e7e5e4', stroke: '#57534e' },
  tampo: { fill: '#e7e5e4', stroke: '#57534e' },
  base: { fill: '#e7e5e4', stroke: '#57534e' },
  travessa: { fill: '#d6d3d1', stroke: '#57534e' },
  fundo: { fill: '#f5f5f4', stroke: '#a8a29e' },
  divisoria: { fill: '#d6d3d1', stroke: '#57534e' },
  prateleira_fixa: { fill: '#fde68a', stroke: '#92400e' },
  prateleira_regulavel: { fill: '#fef3c7', stroke: '#b45309' },
  // Frentes em tom de madeira da marca; caixa de gaveta em areia.
  porta: { fill: '#d9bf9f', stroke: '#5b3a21' },
  frente_gaveta: { fill: '#d9bf9f', stroke: '#5b3a21' },
  lateral_gaveta: { fill: '#efe3d3', stroke: '#9e5724' },
  contrafrente_gaveta: { fill: '#efe3d3', stroke: '#9e5724' },
  traseira_gaveta: { fill: '#efe3d3', stroke: '#9e5724' },
  fundo_gaveta: { fill: '#f6efe6', stroke: '#b98552' },
  // Mesa
  pe: { fill: '#e7e5e4', stroke: '#57534e' },
  saia: { fill: '#d6d3d1', stroke: '#57534e' },
  engrosso: { fill: '#d6d3d1', stroke: '#57534e' },
  // Comprados e referência (não são cortados)
  pe_comprado: { fill: '#44403c', stroke: '#1c1917' },
  suporte: { fill: '#78716c', stroke: '#292524' },
  gabinete_ref: { fill: '#f5f5f4', stroke: '#a8a29e' },
};

export const PAPEIS_FRENTE = new Set(['porta', 'frente_gaveta']);

export const COR_SELECAO = { fill: '#f59e0b', stroke: '#b45309' };
export const COR_FITA = '#b45309';

export const NOME_MATERIAL: Record<MaterialComponente, string> = {
  estrutura: 'Estrutura',
  fundo: 'Fundo',
  frente: 'Frente',
  gaveta: 'Caixa de gaveta',
};
