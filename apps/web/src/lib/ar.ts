import { enderecoSceneViewer } from '@marcenaria/core';
import { supabase } from './supabase';

/** Balde público com os arquivos 3D (veja a migration ver_no_ambiente). */
const BALDE = 'ar';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const idValido = (v: string | undefined): v is string => !!v && UUID.test(v);

/** Endereços públicos dos dois arquivos de um móvel publicado. */
export function enderecosDoModelo(empresaId: string, id: string): { glb: string; usdz: string } {
  const base = `${import.meta.env.VITE_SUPABASE_URL as string}/storage/v1/object/public/${BALDE}/${empresaId}/${id}`;
  return { glb: `${base}.glb`, usdz: `${base}.usdz` };
}

/** Envia os dois arquivos e devolve o link da página que abre o móvel no ambiente. */
export async function publicarModelo(empresaId: string, nome: string, arquivos: { glb: Blob; usdz: Blob }): Promise<string> {
  const id = crypto.randomUUID();
  const enviar = async (extensao: string, corpo: Blob, tipo: string) => {
    const { error } = await supabase.storage.from(BALDE).upload(`${empresaId}/${id}.${extensao}`, corpo, { contentType: tipo, cacheControl: '31536000', upsert: false });
    if (error) throw error;
  };
  await Promise.all([enviar('glb', arquivos.glb, 'model/gltf-binary'), enviar('usdz', arquivos.usdz, 'model/vnd.usdz+zip')]);
  const titulo = nome.trim().slice(0, 60);
  return `${window.location.origin}/ar/${empresaId}/${id}${titulo ? `?n=${encodeURIComponent(titulo)}` : ''}`;
}

export type Aparelho = 'ios' | 'android' | 'outro';

export function aparelho(): Aparelho {
  const ua = navigator.userAgent;
  // iPad recente se apresenta como Mac; a tela de toque denuncia.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'outro';
}

/** Link que abre o visualizador de realidade aumentada do Android, no tamanho real. */
export const linkAndroid = enderecoSceneViewer;

/** Link do iPhone/iPad (AR Quick Look), no tamanho real. */
export const linkIos = (usdz: string) => `${usdz}#allowsContentScaling=0`;
