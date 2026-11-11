import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Carregando, Titulo } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import { formatarDia } from '../lib/orcamentos';
import { FLUXO, NOME_STATUS_ORDEM, buscarOrdens, chavesProducao, numeroOrdem } from '../lib/producao';

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Quadro da oficina: uma coluna por etapa. */
export function Producao() {
  const { empresa } = useEmpresaAtual();
  const consulta = useQuery({ queryKey: chavesProducao.lista(empresa.id), queryFn: () => buscarOrdens(empresa.id) });
  const [canceladas, setCanceladas] = useState(false);

  if (consulta.isPending) return <Carregando />;
  if (consulta.error) return <Aviso>{mensagemDeErro(consulta.error)}</Aviso>;
  const ordens = consulta.data;
  const dia = hoje();
  // Concluídas: só as 10 mais recentes, para o quadro não crescer sem fim.
  const daColuna = (st: string) => ordens.filter((o) => o.status === st).slice(0, st === 'concluida' ? 10 : undefined);

  return (
    <>
      <Titulo subtitulo="Ordens de produção por etapa. Abra uma ordem para ver peças, plano de corte e dar baixa no estoque.">Produção</Titulo>
      {ordens.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-stone-500 ring-1 ring-stone-200">Nenhuma ordem ainda. Abra um projeto salvo e use "Enviar para produção".</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {FLUXO.map((st) => {
            const lista = daColuna(st);
            return (
              <section key={st} className="rounded-2xl bg-white/60 p-3 ring-1 ring-stone-200">
                <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-semibold">
                  {NOME_STATUS_ORDEM[st]}
                  <span className="tabular rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700">{ordens.filter((o) => o.status === st).length}</span>
                </h2>
                <ul className="space-y-2">
                  {lista.map((o) => {
                    const atrasada = o.prazo !== null && o.prazo < dia && st !== 'concluida';
                    return (
                      <li key={o.id}>
                        <Link to={`/producao/${o.id}`} className="block rounded-xl bg-white p-3 shadow-sm ring-1 ring-stone-200 hover:ring-amber-400">
                          <p className="tabular text-xs text-stone-500">{numeroOrdem(o.numero)}</p>
                          <p className="font-medium text-stone-900">{o.projeto_nome}</p>
                          <p className="text-sm text-stone-500">{o.cliente_nome ?? 'Sem cliente'}</p>
                          <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
                            {o.prazo && <span className={`rounded-full px-2 py-0.5 ${atrasada ? 'bg-red-100 text-red-800' : 'bg-stone-100 text-stone-700'}`}>{atrasada ? 'Atrasada · ' : 'Prazo '}{formatarDia(o.prazo)}</span>}
                            <span className={`rounded-full px-2 py-0.5 ${o.baixa_em ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>{o.baixa_em ? 'Estoque baixado' : 'Sem baixa'}</span>
                          </p>
                        </Link>
                      </li>
                    );
                  })}
                  {lista.length === 0 && <li className="px-1 py-4 text-center text-xs text-stone-400">Nada aqui.</li>}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {ordens.some((o) => o.status === 'cancelada') && (
        <div className="mt-6">
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={canceladas} onChange={(e) => setCanceladas(e.target.checked)} className="accent-amber-600" />
            Ver canceladas
          </label>
          {canceladas && (
            <ul className="mt-2 divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
              {ordens
                .filter((o) => o.status === 'cancelada')
                .map((o) => (
                  <li key={o.id}>
                    <Link to={`/producao/${o.id}`} className="flex justify-between px-4 py-2 text-sm text-stone-500 hover:bg-stone-50">
                      <span>
                        {numeroOrdem(o.numero)} · {o.projeto_nome}
                      </span>
                      <span>{formatarDia(o.created_at)}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
