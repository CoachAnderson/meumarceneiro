import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FotoMedicao as Foto } from '@marcenaria/core';
import { chavesMedicao, lerFotoLocal, linkDaFoto } from '../lib/medicoes';

/** Foto da medição: a do aparelho (ainda não enviada) ou um link temporário da que já subiu. */
export function useEnderecoFoto(foto: Foto): string | null {
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let vivo = true;
    void lerFotoLocal(foto.id).then((b) => {
      if (!vivo || !b) return;
      url = URL.createObjectURL(b);
      setLocal(url);
    });
    return () => {
      vivo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [foto.id]);
  const remota = useQuery({
    queryKey: chavesMedicao.foto(foto.caminho ?? ''),
    queryFn: () => linkDaFoto(foto.caminho!),
    enabled: !!foto.caminho && !local,
    staleTime: 50 * 60 * 1000,
  });
  return local ?? remota.data ?? null;
}

export function MiniaturaFoto({ foto, className = 'h-28 w-full' }: { foto: Foto; className?: string }) {
  const url = useEnderecoFoto(foto);
  return url ? (
    <img src={url} alt={foto.legenda || 'Foto da medição'} className={`rounded-lg object-cover ring-1 ring-stone-200 ${className}`} />
  ) : (
    <div className={`flex items-center justify-center rounded-lg bg-stone-100 text-xs text-stone-500 ring-1 ring-stone-200 ${className}`}>{foto.caminho ? 'Carregando…' : 'Foto no outro aparelho'}</div>
  );
}
