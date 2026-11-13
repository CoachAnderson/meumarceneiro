import { lerModeloMontagem, type ModeloMontagem } from '@marcenaria/core';
import { supabase } from './supabase';

/** Balde público com os manuais publicados (veja a migration etiquetas_oficina). */
const BALDE = 'manuais';

export const enderecoDoManual = (empresaId: string, id: string) =>
  `${import.meta.env.VITE_SUPABASE_URL as string}/storage/v1/object/public/${BALDE}/${empresaId}/${id}.json`;

/** Publica a fotografia do móvel e devolve o link da página do manual. */
export async function publicarManual(empresaId: string, nome: string, modelo: ModeloMontagem): Promise<string> {
  const id = crypto.randomUUID();
  const corpo = new Blob([JSON.stringify(modelo)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BALDE).upload(`${empresaId}/${id}.json`, corpo, { contentType: 'application/json', cacheControl: '31536000', upsert: false });
  if (error) throw error;
  const titulo = nome.trim().slice(0, 60);
  return `${window.location.origin}/montagem/${empresaId}/${id}${titulo ? `?n=${encodeURIComponent(titulo)}` : ''}`;
}

/** Lê um manual publicado. null: não existe ou o arquivo não é um manual. */
export async function baixarManual(empresaId: string, id: string): Promise<ModeloMontagem | null> {
  const r = await fetch(enderecoDoManual(empresaId, id));
  if (!r.ok) return null;
  try {
    return lerModeloMontagem(await r.json());
  } catch {
    return null;
  }
}
