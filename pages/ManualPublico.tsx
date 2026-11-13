import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { gerarManual, resultadoDoModelo, type ModeloMontagem } from '@marcenaria/core';
import { Marca } from '../components/Marca';
import { Aviso, Carregando } from '../components/ui';
import { idValido } from '../lib/ar';
import { baixarManual } from '../lib/manual';
import { Manual } from '../montagem/Manual';

/** Página pública do manual de montagem (montador, funcionário novo, cliente que monta sozinho). */
export function ManualPublico() {
  const { empresa, id } = useParams();
  const [params] = useSearchParams();
  const titulo = (params.get('n') ?? '').slice(0, 60);
  const valido = idValido(empresa) && idValido(id);
  const [modelo, setModelo] = useState<ModeloMontagem | null | undefined>(valido ? undefined : null);

  useEffect(() => {
    if (!valido || !empresa || !id) return;
    let vivo = true;
    baixarManual(empresa, id)
      .then((m) => vivo && setModelo(m))
      .catch(() => vivo && setModelo(null));
    return () => {
      vivo = false;
    };
  }, [valido, empresa, id]);

  const manual = useMemo(() => (modelo ? gerarManual(resultadoDoModelo(modelo), new Map(Object.entries(modelo.codigos))) : null), [modelo]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">Manual de montagem</p>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{titulo || 'Móvel'}</h1>
        </div>
        <Marca />
      </header>
      {modelo === undefined ? (
        <Carregando texto="Abrindo o manual…" />
      ) : !modelo || !manual ? (
        <Aviso>Não foi possível abrir este manual. Confira o link com a marcenaria.</Aviso>
      ) : (
        <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-stone-200 sm:p-6">
          <Manual manual={manual} componentes={modelo.componentes} titulo={titulo} />
        </section>
      )}
    </main>
  );
}
