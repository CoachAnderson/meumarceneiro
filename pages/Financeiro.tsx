import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarReais, hojeBrasil, resumir, somarDias, type TipoLancamento } from '@marcenaria/core';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Campo, Carregando, Cartao, Titulo } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import {
  buscarCategorias,
  buscarContas,
  buscarLancamentos,
  buscarSaldos,
  chavesFinanceiro,
  podeVerFinanceiro,
  salvarCategoria,
  salvarConta,
  type Categoria,
  type ContaFinanceira,
  type Lancamento,
} from '../lib/financeiro';
import { supabase } from '../lib/supabase';
import { CampoReais } from '../financeiro/CampoReais';
import { Fluxo } from '../financeiro/Fluxo';
import { ListaLancamentos } from '../financeiro/ListaLancamentos';
import { BotaoBoleto } from '../financeiro/Boleto';
import { Integracoes } from '../financeiro/Integracoes';
import { buscarIntegracoes, chamarCobranca, chaveIntegracoes } from '../lib/cobranca';

type Aba = 'resumo' | 'receber' | 'pagar' | 'fluxo' | 'cadastros' | 'integracoes';
const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: 'resumo', rotulo: 'Resumo' },
  { id: 'receber', rotulo: 'A receber' },
  { id: 'pagar', rotulo: 'A pagar' },
  { id: 'fluxo', rotulo: 'Fluxo de caixa' },
  { id: 'cadastros', rotulo: 'Contas e categorias' },
  { id: 'integracoes', rotulo: 'Boleto e nota' },
];

/** Sugestões para começar (a marcenaria escolhe quais quer). */
const SUGESTOES: Record<TipoLancamento, string[]> = {
  receber: ['Venda de móveis', 'Montagem', 'Assistência técnica'],
  pagar: ['Chapas e fitas', 'Ferragens', 'Salários', 'Aluguel', 'Energia', 'Impostos', 'Frete', 'Ferramentas e manutenção'],
};

function Indicador({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: number; detalhe?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-lg p-4 ring-1 ${alerta && valor > 0 ? 'bg-red-50 ring-red-200' : 'bg-white ring-stone-200'}`}>
      <p className="text-sm text-stone-600">{rotulo}</p>
      <p className={`tabular mt-1 text-xl font-semibold ${alerta && valor > 0 ? 'text-red-800' : 'text-stone-900'}`}>{formatarReais(valor)}</p>
      {detalhe && <p className="mt-0.5 text-xs text-stone-500">{detalhe}</p>}
    </div>
  );
}

function Resumo({ lancamentos, contas, saldos }: { lancamentos: readonly Lancamento[]; contas: readonly ContaFinanceira[]; saldos: Map<string, number> }) {
  const hoje = hojeBrasil();
  const r = resumir(lancamentos, hoje);
  const total = contas.filter((c) => c.ativa).reduce((s, c) => s + (saldos.get(c.id) ?? c.saldo_inicial_centavos), 0);
  return (
    <div className="space-y-6">
      <Cartao titulo="A receber">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador rotulo="Vencido" valor={r.receber.vencido} detalhe={r.receber.qtdVencidos ? `${r.receber.qtdVencidos} conta${r.receber.qtdVencidos === 1 ? '' : 's'}` : 'nada vencido'} alerta />
          <Indicador rotulo="Vence hoje" valor={r.receber.hoje} />
          <Indicador rotulo="Próximos 7 dias" valor={r.receber.proximos7} detalhe="inclui hoje" />
          <Indicador rotulo="Recebido no mês" valor={r.receber.noMes} />
        </div>
      </Cartao>
      <Cartao titulo="A pagar">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador rotulo="Vencido" valor={r.pagar.vencido} detalhe={r.pagar.qtdVencidos ? `${r.pagar.qtdVencidos} conta${r.pagar.qtdVencidos === 1 ? '' : 's'}` : 'nada vencido'} alerta />
          <Indicador rotulo="Vence hoje" valor={r.pagar.hoje} />
          <Indicador rotulo="Próximos 7 dias" valor={r.pagar.proximos7} detalhe="inclui hoje" />
          <Indicador rotulo="Pago no mês" valor={r.pagar.noMes} />
        </div>
      </Cartao>
      <Cartao titulo="Saldo das contas" descricao="Saldo inicial mais o que foi recebido e menos o que foi pago por cada conta.">
        {contas.length === 0 ? (
          <p className="text-sm text-stone-500">Cadastre o caixa e as contas do banco em "Contas e categorias".</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {contas
              .filter((c) => c.ativa)
              .map((c) => {
                const v = saldos.get(c.id) ?? c.saldo_inicial_centavos;
                return (
                  <li key={c.id} className="flex justify-between gap-3 py-2">
                    <span>{c.nome}</span>
                    <span className={`tabular font-medium ${v < 0 ? 'text-red-700' : ''}`}>{formatarReais(v)}</span>
                  </li>
                );
              })}
            <li className="flex justify-between gap-3 py-2 font-semibold">
              <span>Total</span>
              <span className="tabular">{formatarReais(total)}</span>
            </li>
          </ul>
        )}
        <p className="mt-3 text-xs text-stone-500">Próximos 30 dias: {formatarReais(r.receber.proximos30)} a receber e {formatarReais(r.pagar.proximos30)} a pagar.</p>
      </Cartao>
    </div>
  );
}

function Cadastros({ empresaId, contas, categorias }: { empresaId: string; contas: readonly ContaFinanceira[]; categorias: readonly Categoria[] }) {
  const queryClient = useQueryClient();
  const [nomeConta, setNomeConta] = useState('');
  const [saldo, setSaldo] = useState<number | null>(0);
  const [nomeCat, setNomeCat] = useState<Record<TipoLancamento, string>>({ receber: '', pagar: '' });
  const [erro, setErro] = useState<string | null>(null);

  async function agir(f: () => Promise<void>) {
    setErro(null);
    try {
      await f();
      await queryClient.invalidateQueries({ queryKey: chavesFinanceiro.contas(empresaId) });
      await queryClient.invalidateQueries({ queryKey: chavesFinanceiro.categorias(empresaId) });
      await queryClient.invalidateQueries({ queryKey: chavesFinanceiro.saldos(empresaId) });
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <div className="space-y-6">
      {erro && <Aviso>{erro}</Aviso>}
      <Cartao titulo="Contas" descricao="Onde o dinheiro fica: o caixa da oficina, cada conta no banco. O saldo inicial é o que havia no dia em que começou a usar o financeiro.">
        <ul className="mb-4 divide-y divide-stone-100 text-sm">
          {contas.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className={c.ativa ? '' : 'text-stone-400 line-through'}>
                {c.nome} <span className="text-stone-500">· saldo inicial {formatarReais(c.saldo_inicial_centavos)}</span>
              </span>
              <Botao variante="discreto" onClick={() => void agir(() => salvarConta(empresaId, { ...c, ativa: !c.ativa }))}>
                {c.ativa ? 'Desativar' : 'Reativar'}
              </Botao>
            </li>
          ))}
        </ul>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_12rem_auto]">
          <Campo rotulo="Nova conta" value={nomeConta} maxLength={80} placeholder="Caixa da oficina" onChange={(e) => setNomeConta(e.target.value)} />
          <CampoReais rotulo="Saldo inicial" valor={saldo} aoMudar={setSaldo} />
          <Botao
            onClick={() =>
              nomeConta.trim() &&
              void agir(async () => {
                await salvarConta(empresaId, { nome: nomeConta.trim(), saldo_inicial_centavos: saldo ?? 0, ativa: true });
                setNomeConta('');
                setSaldo(0);
              })
            }
          >
            Adicionar
          </Botao>
        </div>
      </Cartao>
      <div className="grid gap-6 lg:grid-cols-2">
        {(['receber', 'pagar'] as const).map((tipo) => {
          const lista = categorias.filter((c) => c.tipo === tipo);
          const faltam = SUGESTOES[tipo].filter((n) => !lista.some((c) => c.nome.toLocaleLowerCase('pt-BR') === n.toLocaleLowerCase('pt-BR')));
          return (
            <Cartao key={tipo} titulo={tipo === 'receber' ? 'Categorias de receita' : 'Categorias de despesa'}>
              <ul className="mb-3 flex flex-wrap gap-2">
                {lista.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      title={c.ativa ? 'Desativar' : 'Reativar'}
                      onClick={() => void agir(() => salvarCategoria(empresaId, { ...c, ativa: !c.ativa }))}
                      className={`min-h-9 rounded-full px-3 text-sm ring-1 ${c.ativa ? 'bg-white text-stone-800 ring-stone-300' : 'bg-stone-100 text-stone-400 line-through ring-stone-200'}`}
                    >
                      {c.nome}
                    </button>
                  </li>
                ))}
              </ul>
              {faltam.length > 0 && (
                <p className="mb-3 text-xs text-stone-500">
                  Sugestões:{' '}
                  {faltam.map((n, i) => (
                    <span key={n}>
                      {i > 0 && ', '}
                      <button type="button" className="underline" onClick={() => void agir(() => salvarCategoria(empresaId, { tipo, nome: n, ativa: true }))}>
                        {n}
                      </button>
                    </span>
                  ))}
                </p>
              )}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Campo rotulo="Nova categoria" value={nomeCat[tipo]} maxLength={80} onChange={(e) => setNomeCat((x) => ({ ...x, [tipo]: e.target.value }))} />
                </div>
                <Botao
                  variante="secundario"
                  onClick={() =>
                    nomeCat[tipo].trim() &&
                    void agir(async () => {
                      await salvarCategoria(empresaId, { tipo, nome: nomeCat[tipo].trim(), ativa: true });
                      setNomeCat((x) => ({ ...x, [tipo]: '' }));
                    })
                  }
                >
                  Adicionar
                </Botao>
              </div>
            </Cartao>
          );
        })}
      </div>
    </div>
  );
}

/** Financeiro: resumo, contas a receber e a pagar, fluxo de caixa, cadastros. Só o dono. */
export function Financeiro() {
  const { empresa, papel } = useEmpresaAtual();
  const pode = podeVerFinanceiro(papel);
  const [params, setParams] = useSearchParams();
  const aba = (ABAS.find((a) => a.id === params.get('aba'))?.id ?? 'resumo') as Aba;
  const desde = somarDias(hojeBrasil(), -400);
  const lancamentos = useQuery({ queryKey: chavesFinanceiro.lancamentos(empresa.id), queryFn: () => buscarLancamentos(empresa.id, desde), enabled: pode });
  const contas = useQuery({ queryKey: chavesFinanceiro.contas(empresa.id), queryFn: () => buscarContas(empresa.id), enabled: pode });
  const categorias = useQuery({ queryKey: chavesFinanceiro.categorias(empresa.id), queryFn: () => buscarCategorias(empresa.id), enabled: pode });
  const saldos = useQuery({ queryKey: chavesFinanceiro.saldos(empresa.id), queryFn: () => buscarSaldos(empresa.id), enabled: pode });
  const pessoas = useQuery({
    queryKey: ['pessoas-financeiro', empresa.id],
    enabled: pode,
    queryFn: async () => {
      const [c, f] = await Promise.all([
        supabase.from('clientes').select('id, nome').eq('empresa_id', empresa.id).order('nome').limit(2000),
        supabase.from('fornecedores').select('id, nome').eq('empresa_id', empresa.id).order('nome').limit(2000),
      ]);
      if (c.error) throw c.error;
      if (f.error) throw f.error;
      return { clientes: c.data ?? [], fornecedores: f.data ?? [] };
    },
  });

  // Boletos em aberto: confere no Mercado Pago ao abrir (no máximo a cada 10 minutos).
  const integracoes = useQuery({ queryKey: chaveIntegracoes(empresa.id), queryFn: () => buscarIntegracoes(empresa.id), enabled: pode });
  const temBoleto = !!integracoes.data?.some((i) => i.provedor === 'mercado_pago') && !!lancamentos.data?.some((l) => l.status === 'aberto' && l.boleto);
  const queryClient = useQueryClient();
  useQuery({
    queryKey: ['conferir-boletos', empresa.id],
    enabled: pode && temBoleto,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const r = await chamarCobranca({ acao: 'conferir_boletos', empresa: empresa.id }).catch(() => ({ pagos: 0 }));
      if (Number(r.pagos) > 0) {
        await queryClient.invalidateQueries({ queryKey: chavesFinanceiro.lancamentos(empresa.id) });
        await queryClient.invalidateQueries({ queryKey: chavesFinanceiro.saldos(empresa.id) });
      }
      return r;
    },
  });

  if (!pode) return <Aviso tipo="info">O financeiro é só do dono da marcenaria.</Aviso>;
  const erro = lancamentos.error ?? contas.error ?? categorias.error ?? saldos.error;
  const pronto = lancamentos.data && contas.data && categorias.data && saldos.data;
  const saldoAtual = (contas.data ?? []).filter((c) => c.ativa).reduce((s, c) => s + (saldos.data?.get(c.id) ?? c.saldo_inicial_centavos), 0);

  return (
    <>
      <Titulo subtitulo="Contas a receber e a pagar, baixa, fluxo de caixa e a planilha para o contador.">Financeiro</Titulo>
      <nav aria-label="Financeiro" className="mb-6">
        {/* Quebra em linhas no celular: todas as abas ficam à vista. */}
        <ol className="flex flex-wrap gap-2">
          {ABAS.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setParams(a.id === 'resumo' ? {} : { aba: a.id }, { replace: true })}
                aria-current={aba === a.id ? 'page' : undefined}
                className={`min-h-10 rounded-full px-4 text-sm font-medium ring-1 ${aba === a.id ? 'bg-amber-600 text-white ring-amber-700' : 'bg-white text-stone-700 ring-stone-300'}`}
              >
                {a.rotulo}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {erro ? (
        <Aviso>{mensagemDeErro(erro)}</Aviso>
      ) : !pronto ? (
        <Carregando />
      ) : aba === 'resumo' ? (
        <Resumo lancamentos={lancamentos.data} contas={contas.data} saldos={saldos.data} />
      ) : aba === 'fluxo' ? (
        <Fluxo lancamentos={lancamentos.data} saldoAtual={saldoAtual} />
      ) : aba === 'integracoes' ? (
        <Integracoes contas={contas.data} />
      ) : aba === 'cadastros' ? (
        <Cadastros empresaId={empresa.id} contas={contas.data} categorias={categorias.data} />
      ) : (
        <ListaLancamentos
          key={aba}
          empresaId={empresa.id}
          tipo={aba}
          lancamentos={lancamentos.data}
          contas={contas.data}
          categorias={categorias.data}
          pessoas={(aba === 'receber' ? pessoas.data?.clientes : pessoas.data?.fornecedores) ?? []}
          extra={aba === 'receber' ? (l) => <BotaoBoleto l={l} /> : undefined}
        />
      )}
    </>
  );
}

