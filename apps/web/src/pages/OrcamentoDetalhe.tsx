import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarMoeda } from '@marcenaria/catalog';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { useImpressao } from '../components/Imprimir';
import { Aviso, Botao, Carregando, Cartao } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import {
  NOME_STATUS,
  buscarOrcamento,
  chavesOrcamentos,
  formatarDia,
  mudarStatus,
  numeroOrcamento,
  podeVerOrcamentos,
  type Orcamento,
  type StatusOrcamento,
} from '../lib/orcamentos';
import { COR_STATUS } from './Orcamentos';

const percentual = (centesimos: number) => `${(centesimos / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** A proposta que o cliente recebe: só descrição, preço e condições (sem custos). */
function Proposta({ o }: { o: Orcamento }) {
  const d = o.dados;
  return (
    <article className="mx-auto max-w-2xl bg-white p-8 text-stone-900 sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-nogueira pb-5">
        <div>
          <p className="text-xl font-bold tracking-tight">{d.empresa}</p>
          <p className="text-sm text-stone-500">Proposta comercial</p>
        </div>
        <div className="text-right text-sm">
          <p className="tabular font-semibold">{numeroOrcamento(o.numero)}</p>
          <p className="text-stone-500">Emitida em {formatarDia(o.created_at)}</p>
          <p className="text-stone-500">Válida até {formatarDia(o.validade)}</p>
        </div>
      </header>

      <section className="mt-6 grid gap-1 text-sm">
        <p>
          <span className="text-stone-500">Cliente: </span>
          <span className="font-medium">{o.cliente_nome ?? '—'}</span>
        </p>
        <p>
          <span className="text-stone-500">Projeto: </span>
          <span className="font-medium">{o.projeto_nome}</span>
        </p>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-semibold tracking-widest text-freijo-escuro uppercase">O que está incluído</h2>
        <ul className="list-inside list-disc space-y-1 text-sm">
          {d.descricao.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-xl bg-creme p-5">
        {d.descontoCentavos > 0 && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-stone-600">Valor</span>
              <span className="tabular">{formatarMoeda(d.precoCentavos)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-600">Desconto ({percentual(d.descontoCentesimos)})</span>
              <span className="tabular">− {formatarMoeda(d.descontoCentavos)}</span>
            </div>
          </>
        )}
        <div className="flex items-baseline justify-between">
          <span className="font-medium">Total</span>
          <span className="tabular text-2xl font-bold">{formatarMoeda(d.totalCentavos)}</span>
        </div>
      </section>

      {d.condicoes && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold tracking-widest text-freijo-escuro uppercase">Condições</h2>
          <p className="text-sm whitespace-pre-line">{d.condicoes}</p>
        </section>
      )}

      <footer className="mt-10 grid grid-cols-2 gap-10 text-center text-xs text-stone-500">
        <div className="border-t border-stone-400 pt-2">{d.empresa}</div>
        <div className="border-t border-stone-400 pt-2">{o.cliente_nome ?? 'Cliente'}</div>
      </footer>
      <p className="mt-8 flex items-center justify-center gap-1.5 text-[10px] text-stone-400">
        <img src="/favicon.svg" alt="" className="size-3.5" /> Feito com Meu Marceneiro
      </p>
    </article>
  );
}

export function OrcamentoDetalhe() {
  const { id = '' } = useParams();
  const { empresa, papel } = useEmpresaAtual();
  const queryClient = useQueryClient();
  const pode = podeVerOrcamentos(papel);
  const consulta = useQuery({ queryKey: chavesOrcamentos.um(id), queryFn: () => buscarOrcamento(id), enabled: pode });
  const { imprimir, Area } = useImpressao();
  const [erro, setErro] = useState<string | null>(null);

  if (!pode) return <Aviso tipo="info">Sua função não tem acesso aos orçamentos.</Aviso>;
  if (consulta.isPending) return <Carregando />;
  if (consulta.error) return <Aviso>{mensagemDeErro(consulta.error)}</Aviso>;
  const o = consulta.data;
  if (!o) {
    return (
      <Aviso>
        Orçamento não encontrado. <Link to="/orcamentos" className="underline">Voltar</Link>
      </Aviso>
    );
  }
  const d = o.dados;
  const vencido = o.status === 'emitido' && o.validade < new Date().toISOString().slice(0, 10);

  async function definir(status: StatusOrcamento) {
    setErro(null);
    try {
      await mudarStatus(o!.id, status);
      await queryClient.invalidateQueries({ queryKey: chavesOrcamentos.um(o!.id) });
      await queryClient.invalidateQueries({ queryKey: chavesOrcamentos.lista(empresa.id) });
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <Link to="/orcamentos" className="text-stone-500 hover:text-stone-900">
            ← Orçamentos
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${COR_STATUS[o.status]}`}>
            {NOME_STATUS[o.status]}
            {vencido && ' · vencido'}
          </span>
          {o.status !== 'aprovado' && (
            <Botao variante="secundario" onClick={() => definir('aprovado')}>
              Marcar aprovado
            </Botao>
          )}
          {o.status !== 'recusado' && (
            <Botao variante="secundario" onClick={() => definir('recusado')}>
              Marcar recusado
            </Botao>
          )}
          {o.status !== 'emitido' && (
            <Botao variante="discreto" onClick={() => definir('emitido')}>
              Voltar para emitido
            </Botao>
          )}
          <Botao onClick={imprimir}>Imprimir / PDF</Botao>
        </div>
      </div>
      {erro && (
        <div className="mb-4">
          <Aviso>{erro}</Aviso>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="overflow-hidden rounded-2xl shadow-sm ring-1 ring-stone-200">
          <Proposta o={o} />
        </div>

        <Cartao titulo="Uso interno" descricao="Não aparece na proposta do cliente.">
          <dl className="space-y-1 text-sm">
            {d.linhas.map((l, i) => (
              <div key={i} className="flex justify-between gap-3">
                <dt className="min-w-0 text-stone-600">
                  {l.descricao}
                  {l.quantidade && <span className="text-stone-400"> · {l.quantidade}</span>}
                </dt>
                <dd className="tabular whitespace-nowrap">{l.custoCentavos === null ? '–' : formatarMoeda(l.custoCentavos)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-stone-200 pt-2 font-medium">
              <dt>Custo</dt>
              <dd className="tabular">{formatarMoeda(d.custoCentavos)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-600">Margem ({percentual(d.margemCentesimos)})</dt>
              <dd className="tabular">{formatarMoeda(d.margemCentavos)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-600">Lucro depois do desconto</dt>
              <dd className="tabular font-medium text-pinho">{formatarMoeda(d.totalCentavos - d.custoCentavos)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-stone-500">
            Versão {o.projeto_versao} do projeto
            {o.projeto_id ? (
              <>
                {' · '}
                <Link to={`/projetos/${o.projeto_id}`} className="underline">
                  abrir projeto
                </Link>
              </>
            ) : (
              ' (projeto excluído)'
            )}
            {o.autor && ` · emitido por ${o.autor.nome ?? o.autor.email}`}
          </p>
        </Cartao>
      </div>

      <Area>
        <Proposta o={o} />
      </Area>
    </>
  );
}
