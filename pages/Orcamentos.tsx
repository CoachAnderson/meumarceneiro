import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { formatarMoeda } from '@marcenaria/catalog';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Carregando, Cartao, Titulo } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import { NOME_STATUS, buscarOrcamentos, chavesOrcamentos, formatarDia, numeroOrcamento, podeVerOrcamentos, type StatusOrcamento } from '../lib/orcamentos';

export const COR_STATUS: Record<StatusOrcamento, string> = {
  emitido: 'bg-amber-100 text-amber-900',
  aprovado: 'bg-emerald-100 text-emerald-900',
  recusado: 'bg-stone-200 text-stone-700',
  cancelado: 'bg-stone-200 text-stone-500',
};

export function Orcamentos() {
  const { empresa, papel } = useEmpresaAtual();
  const pode = podeVerOrcamentos(papel);
  const consulta = useQuery({ queryKey: chavesOrcamentos.lista(empresa.id), queryFn: () => buscarOrcamentos(empresa.id), enabled: pode });
  const [filtro, setFiltro] = useState<StatusOrcamento | 'todos'>('todos');

  if (!pode) return <Aviso tipo="info">Sua função não tem acesso aos orçamentos.</Aviso>;

  const todos = consulta.data ?? [];
  const lista = todos.filter((o) => filtro === 'todos' || o.status === filtro);

  // Relatório dos últimos 30 dias, pelo que foi emitido no período.
  const corte = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentes = todos.filter((o) => new Date(o.created_at).getTime() >= corte && o.status !== 'cancelado');
  const aprovados = recentes.filter((o) => o.status === 'aprovado');
  const decididos = recentes.filter((o) => o.status === 'aprovado' || o.status === 'recusado');
  const soma = (l: typeof todos, campo: 'total_centavos' | 'custo_centavos') => l.reduce((s, o) => s + o[campo], 0);
  const resumo = [
    { rotulo: 'Emitidos', valor: String(recentes.length), detalhe: formatarMoeda(soma(recentes, 'total_centavos')) },
    { rotulo: 'Aprovados', valor: String(aprovados.length), detalhe: formatarMoeda(soma(aprovados, 'total_centavos')) },
    { rotulo: 'Taxa de aprovação', valor: decididos.length ? `${Math.round((aprovados.length * 100) / decididos.length)}%` : '–', detalhe: decididos.length ? `${decididos.length} com resposta` : 'nenhum com resposta ainda' },
    { rotulo: 'Lucro dos aprovados', valor: formatarMoeda(soma(aprovados, 'total_centavos') - soma(aprovados, 'custo_centavos')), detalhe: 'total − custo' },
  ];

  return (
    <>
      <Titulo subtitulo="Orçamentos emitidos. O conteúdo de cada um não muda depois de emitido; só a situação.">Orçamentos</Titulo>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {resumo.map((r) => (
          <div key={r.rotulo} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
            <p className="text-sm text-stone-500">{r.rotulo} · 30 dias</p>
            <p className="tabular mt-1 text-xl font-semibold">{r.valor}</p>
            <p className="tabular text-sm text-stone-500">{r.detalhe}</p>
          </div>
        ))}
      </div>

      <Cartao titulo="Todos">
        <label className="mb-4 flex items-center gap-2 text-sm text-stone-600">
          Situação
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as StatusOrcamento | 'todos')} className="rounded-lg border-0 bg-white py-1.5 pr-8 pl-3 text-sm ring-1 ring-inset ring-stone-300">
            <option value="todos">Todas</option>
            {(Object.keys(NOME_STATUS) as StatusOrcamento[]).map((s) => (
              <option key={s} value={s}>
                {NOME_STATUS[s]}
              </option>
            ))}
          </select>
        </label>
        {consulta.isPending ? (
          <Carregando />
        ) : consulta.error ? (
          <Aviso>{mensagemDeErro(consulta.error)}</Aviso>
        ) : lista.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-500">{todos.length === 0 ? 'Nenhum orçamento emitido. Abra um projeto e use "Emitir orçamento".' : 'Nenhum orçamento nessa situação.'}</p>
        ) : (
          <ul className="-mx-5 divide-y divide-stone-100 sm:-mx-6">
            {lista.map((o) => (
              <li key={o.id}>
                <Link to={`/orcamentos/${o.id}`} className="grid grid-cols-[4rem_1fr] items-baseline gap-x-3 gap-y-1 px-5 py-3 hover:bg-stone-50 sm:grid-cols-[4.5rem_1fr_auto] sm:gap-x-4 sm:px-6">
                  <span className="tabular text-sm text-stone-500">{numeroOrcamento(o.numero)}</span>
                  <span className="min-w-0">
                    <span className="font-medium text-stone-900">{o.projeto_nome}</span>
                    <span className="block text-sm text-stone-500 sm:ml-2 sm:inline">
                      {o.cliente_nome ?? 'Sem cliente'} · {formatarDia(o.created_at)}
                    </span>
                  </span>
                  <span className="col-start-2 flex items-center gap-3 sm:col-start-auto">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COR_STATUS[o.status]}`}>{NOME_STATUS[o.status]}</span>
                    <span className="tabular font-medium">{formatarMoeda(o.total_centavos)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </>
  );
}
