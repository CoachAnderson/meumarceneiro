import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { formatarMm, type Componente, type FerragemNecessaria, type ManualMontagem, type PecaNoPasso } from '@marcenaria/core';
import { Botao, Carregando } from '../components/ui';
import { useImpressao } from '../components/Imprimir';
import { LegendaMarcas, VistaIsometrica } from './VistaIsometrica';

const Cena3D = lazy(() => import('./Cena3D'));

/** "2× Lateral de gaveta" a partir das peças do passo, juntando as de mesmo código. */
function agrupar(pecas: readonly PecaNoPasso[]): Array<{ chave: string; codigo: string | null; nome: string; n: number }> {
  const m = new Map<string, { chave: string; codigo: string | null; nome: string; n: number }>();
  for (const p of pecas) {
    const chave = p.codigo ?? `id:${p.id}`;
    const atual = m.get(chave);
    if (atual) atual.n++;
    else m.set(chave, { chave, codigo: p.codigo, nome: p.nome, n: 1 });
  }
  return [...m.values()];
}

const textoFerragem = (f: FerragemNecessaria) => `${f.descricao}${f.comprimento ? ` (${formatarMm(f.comprimento)} mm)` : ''}`;

function ListaFerragens({ ferragens }: { ferragens: readonly FerragemNecessaria[] }) {
  if (ferragens.length === 0) return <p className="text-sm text-stone-500">Nenhuma ferragem neste passo.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {ferragens.map((f) => (
        <li key={`${f.codigo}-${f.comprimento ?? ''}`} className="flex gap-2">
          <span className="tabular w-10 shrink-0 text-right font-semibold">{f.quantidade}×</span>
          <span>{textoFerragem(f)}</span>
        </li>
      ))}
    </ul>
  );
}

function ListaPecasDoPasso({ pecas }: { pecas: readonly PecaNoPasso[] }) {
  if (pecas.length === 0) return <p className="text-sm text-stone-500">Nenhuma peça nova neste passo.</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {agrupar(pecas).map((p) => (
        <li key={p.chave} className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-sm ring-1 ring-amber-200">
          {p.codigo && <span className="font-mono text-xs font-bold text-amber-900">{p.codigo}</span>}
          <span>
            {p.n > 1 ? `${p.n}× ` : ''}
            {p.nome}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Manual de montagem passo a passo: 3D (ou desenho) do passo, as peças que
 * entram com o código da etiqueta, onde vai cada ferragem e o que usar.
 */
export function Manual({ manual, componentes, titulo, acoes }: { manual: ManualMontagem; componentes: readonly Componente[]; titulo: string; acoes?: ReactNode }) {
  const [i, setI] = useState(0);
  const [modo, setModo] = useState<'3d' | 'desenho'>('3d');
  const { imprimir, Area } = useImpressao();
  const passo = manual.passos[Math.min(i, manual.passos.length - 1)]!;
  const montadas = useMemo(() => new Set(passo.montadas.filter((id) => !passo.novas.some((n) => n.id === id))), [passo]);
  const novas = useMemo(() => new Set(passo.novas.map((n) => n.id)), [passo]);
  const total = manual.passos.length;
  const rotulo = `Passo ${passo.numero}: ${passo.titulo}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-stone-100 p-1" role="tablist" aria-label="Como ver o passo">
          {(['3d', 'desenho'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modo === m}
              onClick={() => setModo(m)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${modo === m ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'}`}
            >
              {m === '3d' ? '3D' : 'Desenho'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao variante="secundario" onClick={imprimir}>
            Imprimir manual
          </Botao>
          {acoes}
        </div>
      </div>

      <nav aria-label="Passos" className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {manual.passos.map((p, k) => (
          <button
            key={p.numero}
            type="button"
            onClick={() => setI(k)}
            aria-current={k === i ? 'step' : undefined}
            title={p.titulo}
            className={`tabular size-9 shrink-0 rounded-full text-sm font-semibold ring-1 ${k === i ? 'bg-amber-600 text-white ring-amber-700' : k < i ? 'bg-amber-100 text-amber-900 ring-amber-200' : 'bg-white text-stone-600 ring-stone-300'}`}
          >
            {p.numero}
          </button>
        ))}
      </nav>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          {modo === '3d' ? (
            <Suspense fallback={<div className="flex h-[22rem] items-center justify-center"><Carregando texto="Carregando 3D…" /></div>}>
              <Cena3D componentes={componentes} montadas={montadas} novas={novas} marcas={passo.marcas} chave={String(passo.numero)} rotulo={rotulo} />
            </Suspense>
          ) : (
            <div className="rounded-lg bg-stone-50 p-2 ring-1 ring-stone-200">
              <VistaIsometrica componentes={componentes} montadas={montadas} novas={novas} marcas={passo.marcas} rotulo={rotulo} className="mx-auto max-h-[26rem] w-full" />
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5 text-xs text-stone-600">
              <span className="inline-block h-2.5 w-4 rounded-sm bg-amber-400 ring-1 ring-amber-700" /> peças deste passo
            </span>
            <LegendaMarcas marcas={passo.marcas} />
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">
              Passo {passo.numero} de {total}
            </p>
            <h3 className="text-lg font-semibold text-stone-900">{passo.titulo}</h3>
          </div>
          {i === 0 && (
            <ul className="list-inside list-disc space-y-1 rounded-lg bg-stone-50 p-3 text-sm text-stone-700 ring-1 ring-stone-200">
              {manual.antes.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          <ol className="list-decimal space-y-2 pl-5 text-sm text-stone-800">
            {passo.instrucoes.map((t, k) => (
              <li key={k}>{t}</li>
            ))}
          </ol>
          <div>
            <h4 className="mb-2 text-sm font-semibold text-stone-900">Peças</h4>
            <ListaPecasDoPasso pecas={passo.novas} />
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold text-stone-900">Ferragens</h4>
            <ListaFerragens ferragens={passo.ferragens} />
          </div>
          <div className="flex gap-2 pt-2">
            <Botao variante="secundario" onClick={() => setI((k) => Math.max(0, k - 1))} disabled={i === 0}>
              Voltar
            </Botao>
            <Botao onClick={() => setI((k) => Math.min(total - 1, k + 1))} disabled={i >= total - 1}>
              {i >= total - 1 ? 'Pronto' : 'Próximo passo'}
            </Botao>
          </div>
        </div>
      </div>

      <Area>
        <ManualImpresso manual={manual} componentes={componentes} titulo={titulo} />
      </Area>
    </div>
  );
}

/** Versão para imprimir: lista de conferência e um desenho por passo. */
export function ManualImpresso({ manual, componentes, titulo }: { manual: ManualMontagem; componentes: readonly Componente[]; titulo: string }) {
  const aCortar = manual.pecas.filter((p) => p.codigo);
  return (
    <div className="text-sm">
      <h1 className="mb-1 text-xl font-semibold">Manual de montagem{titulo ? ` · ${titulo}` : ''}</h1>
      <p className="mb-4 text-stone-600">{manual.passos.length} passos. As peças têm o código da etiqueta entre parênteses.</p>
      <ul className="mb-4 list-inside list-disc space-y-1">
        {manual.antes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <div className="mb-6 grid grid-cols-2 gap-6">
        <figure>
          <h2 className="mb-1 font-semibold">Peças</h2>
          <ul className="space-y-0.5">
            {agrupar(aCortar).map((p) => (
              <li key={p.chave}>
                <span className="font-mono font-bold">{p.codigo}</span> · {p.n > 1 ? `${p.n}× ` : ''}
                {p.nome}
              </li>
            ))}
          </ul>
        </figure>
        <figure>
          <h2 className="mb-1 font-semibold">Ferragens</h2>
          <ListaFerragens ferragens={manual.ferragens} />
        </figure>
      </div>
      {manual.passos.map((p) => {
        const novas = new Set(p.novas.map((n) => n.id));
        const montadas = new Set(p.montadas.filter((id) => !novas.has(id)));
        return (
          <figure key={p.numero} className="mb-6 grid grid-cols-[1fr_1fr] items-start gap-4 border-t border-stone-300 pt-3">
            <VistaIsometrica componentes={componentes} montadas={montadas} novas={novas} marcas={p.marcas} rotulo={`Passo ${p.numero}`} className="w-full" />
            <div>
              <h2 className="mb-1 font-semibold">
                {p.numero}. {p.titulo}
              </h2>
              <ol className="mb-2 list-decimal space-y-1 pl-5">
                {p.instrucoes.map((t, k) => (
                  <li key={k}>{t}</li>
                ))}
              </ol>
              {p.ferragens.length > 0 && <ListaFerragens ferragens={p.ferragens} />}
              <div className="mt-2">
                <LegendaMarcas marcas={p.marcas} />
              </div>
            </div>
          </figure>
        );
      })}
    </div>
  );
}
