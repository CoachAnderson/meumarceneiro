import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatarReais, hojeBrasil, NOME_FORMA, NOME_SITUACAO, situacao, somarDias, somarMeses, type Situacao, type TipoLancamento } from '@marcenaria/core';
import { Aviso, Botao, Cartao } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import {
  cancelarLancamento,
  chavesFinanceiro,
  csvDosLancamentos,
  estornarLancamento,
  excluirLancamento,
  type Categoria,
  type ContaFinanceira,
  type Lancamento,
} from '../lib/financeiro';
import { Baixa } from './Baixa';
import { FormLancamento, type Pessoa } from './FormLancamento';

const COR: Record<Situacao, string> = {
  pago: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  cancelado: 'bg-stone-100 text-stone-500 ring-stone-200',
  vencido: 'bg-red-50 text-red-800 ring-red-200',
  vence_hoje: 'bg-amber-100 text-amber-950 ring-amber-300',
  a_vencer: 'bg-white text-stone-700 ring-stone-300',
};

type Filtro = 'abertos' | 'vencidos' | 'pagos' | 'todos';
const dia = (iso: string) => iso.split('-').reverse().join('/');

export function SeloSituacao({ s }: { s: Situacao }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${COR[s]}`}>{NOME_SITUACAO[s]}</span>;
}

/** Contas a receber ou a pagar: filtro, total, baixa, edição, estorno e planilha. */
export function ListaLancamentos({
  empresaId,
  tipo,
  lancamentos,
  contas,
  categorias,
  pessoas,
  extra,
}: {
  empresaId: string;
  tipo: TipoLancamento;
  lancamentos: readonly Lancamento[];
  contas: readonly ContaFinanceira[];
  categorias: readonly Categoria[];
  pessoas: readonly Pessoa[];
  /** Ações a mais por linha (boleto). */
  extra?: (l: Lancamento) => ReactNode;
}) {
  const queryClient = useQueryClient();
  const hoje = hojeBrasil();
  const [filtro, setFiltro] = useState<Filtro>('abertos');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);
  const [aberto, setAberto] = useState<{ id: string; acao: 'baixa' | 'editar' } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const nome = tipo === 'receber' ? 'A receber' : 'A pagar';

  const lista = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase('pt-BR');
    return lancamentos
      .filter((l) => l.tipo === tipo)
      .filter((l) => {
        const s = situacao(l, hoje);
        if (filtro === 'abertos' && l.status !== 'aberto') return false;
        if (filtro === 'vencidos' && s !== 'vencido') return false;
        if (filtro === 'pagos' && l.status !== 'pago') return false;
        const data = l.status === 'pago' && filtro === 'pagos' ? l.pago_em! : l.vencimento;
        if (de && data < de) return false;
        if (ate && data > ate) return false;
        if (q && !`${l.descricao} ${l.cliente?.nome ?? ''} ${l.fornecedor?.nome ?? ''} ${l.documento ?? ''}`.toLocaleLowerCase('pt-BR').includes(q)) return false;
        return true;
      })
      .sort((a, b) => (filtro === 'pagos' ? (b.pago_em ?? '').localeCompare(a.pago_em ?? '') : a.vencimento.localeCompare(b.vencimento)));
  }, [lancamentos, tipo, filtro, de, ate, busca, hoje]);

  const total = lista.reduce((s, l) => s + (l.status === 'pago' ? (l.valor_pago_centavos ?? l.valor_centavos) : l.status === 'aberto' ? l.valor_centavos : 0), 0);
  const nomeConta = (id: string | null) => contas.find((c) => c.id === id)?.nome ?? '';

  async function agir(f: () => Promise<void>) {
    setErro(null);
    try {
      await f();
      await queryClient.invalidateQueries({ queryKey: chavesFinanceiro.lancamentos(empresaId) });
      await queryClient.invalidateQueries({ queryKey: chavesFinanceiro.saldos(empresaId) });
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  function baixarPlanilha() {
    const blob = new Blob([csvDosLancamentos(lista, nomeConta)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${tipo === 'receber' ? 'contas-a-receber' : 'contas-a-pagar'}-${hoje}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <Cartao
      titulo={nome}
      acoes={
        <div className="flex flex-wrap gap-2">
          <Botao variante="secundario" onClick={baixarPlanilha} disabled={lista.length === 0}>
            Planilha
          </Botao>
          <Botao onClick={() => setNovo((v) => !v)}>{novo ? 'Fechar' : tipo === 'receber' ? 'Nova conta a receber' : 'Nova conta a pagar'}</Botao>
        </div>
      }
    >
      {novo && (
        <div className="mb-6 border-b border-stone-200 pb-6">
          <FormLancamento empresaId={empresaId} tipo={tipo} categorias={categorias} pessoas={pessoas} aoFechar={() => setNovo(false)} />
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-[auto_1fr_1fr_2fr] sm:items-end">
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Quais contas">
          {(
            [
              ['abertos', 'Em aberto'],
              ['vencidos', 'Vencidas'],
              ['pagos', tipo === 'receber' ? 'Recebidas' : 'Pagas'],
              ['todos', 'Todas'],
            ] as const
          ).map(([f, r]) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filtro === f}
              onClick={() => setFiltro(f)}
              className={`min-h-10 rounded-full px-3 text-sm font-medium ring-1 ${filtro === f ? 'bg-stone-900 text-white ring-stone-900' : 'bg-white text-stone-700 ring-stone-300'}`}
            >
              {r}
            </button>
          ))}
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-stone-600">De</span>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="block w-full rounded-lg border-0 bg-white px-3 py-2 ring-1 ring-stone-300 ring-inset" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-stone-600">Até</span>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="block w-full rounded-lg border-0 bg-white px-3 py-2 ring-1 ring-stone-300 ring-inset" />
        </label>
        <label className="block text-sm">
          <span className="sr-only">Procurar</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={`Procurar: descrição, ${tipo === 'receber' ? 'cliente' : 'fornecedor'}, documento`}
            className="block w-full rounded-lg border-0 bg-white px-3 py-2 text-base ring-1 ring-stone-300 ring-inset sm:text-sm"
          />
        </label>
      </div>
      {!de && !ate && (
        <p className="mb-3 text-xs text-stone-500">
          Atalho:{' '}
          <button type="button" className="underline" onClick={() => { setDe(hoje); setAte(somarDias(hoje, 7)); }}>
            próximos 7 dias
          </button>{' '}
          ·{' '}
          <button type="button" className="underline" onClick={() => { const um = `${hoje.slice(0, 7)}-01`; setDe(um); setAte(somarDias(somarMeses(um, 1), -1)); }}>
            este mês
          </button>
        </p>
      )}
      {erro && (
        <div className="mb-3">
          <Aviso>{erro}</Aviso>
        </div>
      )}

      <div className="-mx-5 overflow-x-auto sm:-mx-6">
        <table className="cartoes-celular min-w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-stone-500">
              <th className="px-5 py-1.5 font-medium sm:px-6">Conta</th>
              <th className="px-3 py-1.5 font-medium">Vencimento</th>
              <th className="px-3 py-1.5 text-right font-medium">Valor</th>
              <th className="px-3 py-1.5 font-medium">Situação</th>
              <th className="px-5 py-1.5 sm:px-6" aria-label="Ações" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {lista.map((l) => {
              const s = situacao(l, hoje);
              return (
                <Fragment key={l.id}>
                  <tr>
                    <td className="px-5 py-2 sm:px-6">
                      <span className="block font-medium text-stone-900">{l.descricao}</span>
                      <span className="block text-xs text-stone-500">
                        {[l.cliente?.nome ?? l.fornecedor?.nome, l.categoria?.nome, l.documento].filter(Boolean).join(' · ') || '–'}
                      </span>
                    </td>
                    <td className="tabular px-3 py-2 whitespace-nowrap">{dia(l.vencimento)}</td>
                    <td className="tabular px-3 py-2 text-right whitespace-nowrap">
                      {formatarReais(l.valor_centavos)}
                      {l.status === 'pago' && l.valor_pago_centavos !== l.valor_centavos && (
                        <span className="block text-xs text-stone-500">pago {formatarReais(l.valor_pago_centavos ?? 0)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <SeloSituacao s={s} />
                      {l.status === 'pago' && (
                        <span className="block text-xs text-stone-500">
                          {dia(l.pago_em!)} · {l.forma ? NOME_FORMA[l.forma] : ''}
                          {l.conta_id ? ` · ${nomeConta(l.conta_id)}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2 sm:px-6">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {l.status === 'aberto' && (
                          <>
                            <Botao onClick={() => setAberto(aberto?.id === l.id && aberto.acao === 'baixa' ? null : { id: l.id, acao: 'baixa' })}>{tipo === 'receber' ? 'Recebi' : 'Paguei'}</Botao>
                            {extra?.(l)}
                            <Botao variante="discreto" onClick={() => setAberto(aberto?.id === l.id && aberto.acao === 'editar' ? null : { id: l.id, acao: 'editar' })}>
                              Editar
                            </Botao>
                            <Botao variante="discreto" onClick={() => window.confirm('Cancelar esta conta? Ela sai dos totais, mas fica no histórico.') && void agir(() => cancelarLancamento(l.id))}>
                              Cancelar
                            </Botao>
                          </>
                        )}
                        {l.status === 'pago' && (
                          <Botao variante="discreto" onClick={() => window.confirm('Estornar? A conta volta para em aberto.') && void agir(() => estornarLancamento(l.id))}>
                            Estornar
                          </Botao>
                        )}
                        {l.status === 'cancelado' && (
                          <>
                            <Botao variante="discreto" onClick={() => void agir(() => cancelarLancamento(l.id, false))}>
                              Reabrir
                            </Botao>
                            <Botao variante="discreto" onClick={() => window.confirm('Excluir de vez?') && void agir(() => excluirLancamento(l.id))}>
                              Excluir
                            </Botao>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {aberto?.id === l.id && (
                    <tr>
                      <td colSpan={5} className="px-5 pb-4 sm:px-6">
                        {aberto.acao === 'baixa' ? (
                          <Baixa
                            l={l}
                            contas={contas}
                            aoCancelar={() => setAberto(null)}
                            aoConcluir={() => {
                              setAberto(null);
                              void agir(async () => undefined);
                            }}
                          />
                        ) : (
                          <div className="rounded-lg p-4 ring-1 ring-stone-200">
                            <FormLancamento empresaId={empresaId} tipo={tipo} categorias={categorias} pessoas={pessoas} editando={l} aoFechar={() => setAberto(null)} />
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {lista.length > 0 && (
            <tfoot>
              <tr className="border-t border-stone-300 font-semibold">
                <td className="px-5 py-2 sm:px-6">
                  {lista.length} conta{lista.length === 1 ? '' : 's'}
                </td>
                <td />
                <td className="tabular px-3 py-2 text-right whitespace-nowrap">{formatarReais(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
        {lista.length === 0 && <p className="px-5 py-6 text-sm text-stone-500 sm:px-6">Nenhuma conta com esse filtro.</p>}
      </div>
    </Cartao>
  );
}
