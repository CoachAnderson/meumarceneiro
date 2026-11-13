import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Aviso, Botao, Cartao } from '../components/ui';
import { useImpressao } from '../components/Imprimir';
import { mensagemDeErro } from '../lib/erros';
import {
  andamento,
  buscarPecasDaOrdem,
  chavesOficina,
  ETAPAS,
  etapasDaPeca,
  marcarEtapa,
  NOME_ETAPA,
  type Etapa,
  type PecaOrdem,
} from '../lib/oficina';
import { chavesProducao, type Ordem } from '../lib/producao';
import { formatarData } from '../lib/projetos';
import { Etiqueta, EtiquetasParaImprimir, TAMANHOS, type TamanhoEtiqueta } from './Etiquetas';

const CHAVE_TAMANHO = 'marcenaria:etiqueta-tamanho';

function tamanhoGuardado(): TamanhoEtiqueta {
  try {
    const v = localStorage.getItem(CHAVE_TAMANHO);
    if (v && v in TAMANHOS) return v as TamanhoEtiqueta;
  } catch {
    // Sem armazenamento: usa o padrão.
  }
  return '60x40';
}

export const COR_ETAPA: Record<Etapa, string> = {
  a_cortar: 'bg-stone-100 text-stone-700 ring-stone-300',
  cortada: 'bg-sky-50 text-sky-800 ring-sky-200',
  fitada: 'bg-violet-50 text-violet-800 ring-violet-200',
  furada: 'bg-amber-50 text-amber-900 ring-amber-200',
  montada: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
};

export function SeloEtapa({ etapa }: { etapa: Etapa }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${COR_ETAPA[etapa]}`}>{NOME_ETAPA[etapa]}</span>;
}

function Barra({ rotulo, feito, total }: { rotulo: string; feito: number; total: number }) {
  if (total === 0) return null;
  const pct = Math.round((feito / total) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-stone-700">{rotulo}</span>
        <span className="tabular font-medium">
          {feito}/{total}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label={rotulo} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-amber-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Andamento por etapa (cortadas, fitadas, furadas, montadas). */
export function BarrasAndamento({ pecas }: { pecas: readonly PecaOrdem[] }) {
  const a = andamento(pecas);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Barra rotulo="Cortadas" feito={a.cortadas} total={a.total} />
      <Barra rotulo="Fitadas" feito={a.fitadas} total={a.com_fita} />
      <Barra rotulo="Furadas" feito={a.furadas} total={a.com_furo} />
      <Barra rotulo="Montadas" feito={a.montadas} total={a.total} />
    </div>
  );
}

/** Peças da ordem na oficina: etapa de cada uma, etiquetas com QR e marcação em lote. */
export function PecasDaOrdem({ ordem, podeMarcar }: { ordem: Ordem; podeMarcar: boolean }) {
  const queryClient = useQueryClient();
  const consulta = useQuery({ queryKey: chavesOficina.daOrdem(ordem.id), queryFn: () => buscarPecasDaOrdem(ordem.id) });
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Etapa | ''>('');
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [etapaLote, setEtapaLote] = useState<Etapa>('cortada');
  const [tamanho, setTamanho] = useState<TamanhoEtiqueta>(tamanhoGuardado);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [imprimirSo, setImprimirSo] = useState<'todas' | 'marcadas'>('todas');
  const { imprimir, Area } = useImpressao();

  const pecas = useMemo(() => consulta.data ?? [], [consulta.data]);
  const visiveis = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase('pt-BR');
    return pecas.filter((p) => (!filtro || p.etapa === filtro) && (!q || p.nome.toLocaleLowerCase('pt-BR').includes(q) || p.codigo.toLocaleLowerCase('pt-BR').includes(q) || String(p.seq) === q));
  }, [pecas, busca, filtro]);

  if (consulta.isPending) return null;
  if (consulta.error) return <Aviso>{mensagemDeErro(consulta.error)}</Aviso>;
  if (pecas.length === 0) {
    return (
      <Cartao titulo="Peças na oficina">
        <p className="text-sm text-stone-500">Esta ordem foi criada antes das etiquetas com QR. Para acompanhar peça por peça, envie o projeto para a produção de novo.</p>
      </Cartao>
    );
  }

  const varios = ordem.dados.quantidadeModulos > 1;
  const paraImprimir = imprimirSo === 'marcadas' ? pecas.filter((p) => marcadas.has(p.id)) : pecas;

  function escolherTamanho(t: TamanhoEtiqueta) {
    setTamanho(t);
    try {
      localStorage.setItem(CHAVE_TAMANHO, t);
    } catch {
      // Sem armazenamento: vale só agora.
    }
  }

  function alternar(id: string) {
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function aplicarLote() {
    setErro(null);
    setOcupado(true);
    try {
      await marcarEtapa([...marcadas], etapaLote);
      setMarcadas(new Set());
      await queryClient.invalidateQueries({ queryKey: chavesOficina.daOrdem(ordem.id) });
      await queryClient.invalidateQueries({ queryKey: chavesProducao.uma(ordem.id) });
      await queryClient.invalidateQueries({ queryKey: ['andamento-ordens'] });
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }

  const todasVisiveisMarcadas = visiveis.length > 0 && visiveis.every((p) => marcadas.has(p.id));

  return (
    <Cartao
      titulo="Peças na oficina"
      descricao="Cada peça tem uma etiqueta com QR. Quem escaneia com o celular vê onde a peça vai, a furação dela e marca a etapa."
    >
      <BarrasAndamento pecas={pecas} />

      <div className="mt-5 grid items-end gap-3 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200 sm:grid-cols-[auto_auto_1fr]">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-800">Etiqueta</span>
          <select value={tamanho} onChange={(e) => escolherTamanho(e.target.value as TamanhoEtiqueta)} className="block w-full rounded-lg border-0 bg-white px-3 py-2 ring-1 ring-stone-300 ring-inset">
            {Object.entries(TAMANHOS).map(([k, t]) => (
              <option key={k} value={k}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-800">Quais</span>
          <select value={imprimirSo} onChange={(e) => setImprimirSo(e.target.value as 'todas' | 'marcadas')} className="block w-full rounded-lg border-0 bg-white px-3 py-2 ring-1 ring-stone-300 ring-inset">
            <option value="todas">Todas ({pecas.length})</option>
            <option value="marcadas" disabled={marcadas.size === 0}>
              Só as marcadas ({marcadas.size})
            </option>
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <Botao onClick={imprimir} disabled={paraImprimir.length === 0}>
            Imprimir {paraImprimir.length} etiqueta{paraImprimir.length === 1 ? '' : 's'}
          </Botao>
        </div>
        <div className="sm:col-span-3">
          <p className="mb-2 text-xs text-stone-500">
            Na impressora térmica, escolha o mesmo tamanho de papel e margem zero. Cada etiqueta sai em uma página. Prévia da primeira:
          </p>
          <div className="inline-block shadow-sm ring-1 ring-stone-300">
            <Etiqueta peca={paraImprimir[0] ?? pecas[0]!} ordem={ordem} tamanho={tamanho} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label className="block text-sm">
          <span className="sr-only">Procurar peça</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar peça: nome, código ou nº da etiqueta"
            className="block w-full rounded-lg border-0 bg-white px-3 py-2 text-base ring-1 ring-stone-300 ring-inset placeholder:text-stone-400 sm:text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="sr-only">Filtrar por etapa</span>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as Etapa | '')} className="block w-full rounded-lg border-0 bg-white px-3 py-2 ring-1 ring-stone-300 ring-inset">
            <option value="">Todas as etapas</option>
            {ETAPAS.map((e) => (
              <option key={e} value={e}>
                {NOME_ETAPA[e]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {podeMarcar && marcadas.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm ring-1 ring-amber-200">
          <span className="font-medium">
            {marcadas.size} peça{marcadas.size === 1 ? '' : 's'} marcada{marcadas.size === 1 ? '' : 's'}:
          </span>
          <select value={etapaLote} onChange={(e) => setEtapaLote(e.target.value as Etapa)} aria-label="Nova etapa" className="rounded-lg border-0 bg-white px-3 py-2 ring-1 ring-stone-300 ring-inset">
            {ETAPAS.map((e) => (
              <option key={e} value={e}>
                {NOME_ETAPA[e]}
              </option>
            ))}
          </select>
          <Botao onClick={aplicarLote} carregando={ocupado}>
            Aplicar
          </Botao>
          <Botao variante="discreto" onClick={() => setMarcadas(new Set())}>
            Desmarcar
          </Botao>
        </div>
      )}
      {erro && (
        <div className="mt-3">
          <Aviso>{erro}</Aviso>
        </div>
      )}

      <div className="-mx-5 mt-3 overflow-x-auto sm:-mx-6">
        <table className="cartoes-celular min-w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-stone-500">
              <th className="px-5 py-1.5 font-medium sm:px-6">
                <span className="flex items-center gap-3">
                  <input
                  type="checkbox"
                  aria-label="Marcar todas as peças da lista"
                  checked={todasVisiveisMarcadas}
                  onChange={() => setMarcadas((m) => (todasVisiveisMarcadas ? new Set([...m].filter((id) => !visiveis.some((p) => p.id === id))) : new Set([...m, ...visiveis.map((p) => p.id)])))}
                  className="size-4 accent-amber-600"
                />
                  Peça
                </span>
              </th>
              <th className="px-3 py-1.5 font-medium">Nº</th>
              <th className="px-3 py-1.5 font-medium">Etapa</th>
              <th className="px-3 py-1.5 font-medium">Última mudança</th>
              <th className="px-5 py-1.5 sm:px-6" aria-label="Abrir" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {visiveis.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-1.5 sm:px-6">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={marcadas.has(p.id)} onChange={() => alternar(p.id)} aria-label={`Marcar ${p.codigo} ${p.nome}`} className="size-4 shrink-0 accent-amber-600" />
                    <span>
                      <span className="font-mono text-xs font-bold text-stone-500">{p.codigo}</span> {p.nome}
                      {varios && <span className="text-stone-500"> · módulo {p.unidade}</span>}
                    </span>
                  </label>
                </td>
                <td className="tabular px-3 py-1.5 text-stone-500">{p.seq}</td>
                <td className="px-3 py-1.5">
                  <SeloEtapa etapa={p.etapa} />
                  {etapasDaPeca(p).length < ETAPAS.length && (
                    <span className="ml-1 text-xs text-stone-400">{!p.tem_fita && !p.tem_furo ? 'sem fita e sem furo' : !p.tem_fita ? 'sem fita' : 'sem furo'}</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-xs text-stone-500">{p.etapa_em ? `${formatarData(p.etapa_em)}${p.quem?.nome ? ` · ${p.quem.nome}` : ''}` : '–'}</td>
                <td className="px-5 py-1.5 text-right sm:px-6">
                  <Link to={`/oficina/p/${p.id}`} className="inline-flex min-h-10 items-center text-sm font-medium underline underline-offset-4 lg:min-h-0">
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visiveis.length === 0 && <p className="px-5 py-4 text-sm text-stone-500 sm:px-6">Nenhuma peça com esse filtro.</p>}
      </div>

      <Area>
        <EtiquetasParaImprimir pecas={paraImprimir} ordem={ordem} tamanho={tamanho} />
      </Area>
    </Cartao>
  );
}
