import { useSyncExternalStore } from 'react';

/**
 * Tema claro ou escuro. É preferência de cada pessoa, neste aparelho: fica no
 * navegador (localStorage), não no banco. "Automático" segue o celular ou o
 * computador. As cores do modo escuro estão em index.css.
 */

export type PreferenciaTema = 'claro' | 'escuro' | 'automatico';

const CHAVE = 'marcenaria:tema';
const COR_BARRA = { claro: '#3B2416', escuro: '#16100B' } as const;

export const NOME_TEMA: Record<PreferenciaTema, string> = {
  claro: 'Claro',
  escuro: 'Escuro',
  automatico: 'Automático',
};

const valida = (v: unknown): v is PreferenciaTema => v === 'claro' || v === 'escuro' || v === 'automatico';

export function lerPreferenciaTema(): PreferenciaTema {
  try {
    const v = localStorage.getItem(CHAVE);
    return valida(v) ? v : 'claro';
  } catch {
    return 'claro';
  }
}

const sistemaEscuro = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;

/** Tema que vale agora para esta preferência. */
export function temaEfetivo(p: PreferenciaTema, escuroNoSistema = sistemaEscuro()): 'claro' | 'escuro' {
  return p === 'automatico' ? (escuroNoSistema ? 'escuro' : 'claro') : p;
}

let preferencia: PreferenciaTema = 'claro';
const ouvintes = new Set<() => void>();

function aplicar() {
  if (typeof document === 'undefined') return;
  const tema = temaEfetivo(preferencia);
  document.documentElement.dataset.tema = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COR_BARRA[tema]);
}

/** Chamado uma vez, antes da primeira tela: evita piscar claro antes do escuro. */
export function iniciarTema() {
  preferencia = lerPreferenciaTema();
  aplicar();
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (preferencia === 'automatico') aplicar();
  });
}

export function mudarTema(p: PreferenciaTema) {
  preferencia = p;
  try {
    localStorage.setItem(CHAVE, p);
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  aplicar();
  ouvintes.forEach((f) => f());
}

export function usePreferenciaTema(): PreferenciaTema {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => preferencia,
    () => 'claro',
  );
}
