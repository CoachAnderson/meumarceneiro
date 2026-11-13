import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarReais, hojeBrasil, situacao } from '@marcenaria/core';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Campo, CampoTexto, Cartao } from '../components/ui';
import { buscarIntegracoes, buscarNotasDoOrcamento, chamarCobranca, chaveIntegracoes, chaveNotas, NOME_STATUS_NOTA, type NotaFiscal } from '../lib/cobranca';
import { buscarCategorias, buscarLancamentosDoOrcamento, chavesFinanceiro } from '../lib/financeiro';
import { numeroOrcamento, type Orcamento } from '../lib/orcamentos';
import { formatarData } from '../lib/projetos';
import { CampoReais } from './CampoReais';
import { FormLancamento } from './FormLancamento';
import { SeloSituacao } from './ListaLancamentos';

const dia = (iso: string) => iso.split('-').reverse().join('/');

/** Recebimento do orçamento aprovado: parcelas a receber. */
function Recebimento({ o }: { o: Orcamento }) {
  const { empresa } = useEmpresaAtual();
  const lista = useQuery({ queryKey: chavesFinanceiro.doOrcamento(o.id), queryFn: () => buscarLancamentosDoOrcamento(o.id) });
  const categorias = useQuery({ queryKey: chavesFinanceiro.categorias(empresa.id), queryFn: () => buscarCategorias(empresa.id) });
  const [gerando, setGerando] = useState(false);
  const hoje = hojeBrasil();
  const ativos = (lista.data ?? []).filter((l) => l.status !== 'cancelado');
  const lancado = ativos.reduce((s, l) => s + (l.status === 'pago' ? (l.valor_pago_centavos ?? l.valor_centavos) : l.valor_centavos), 0);
  const recebido = ativos.filter((l) => l.status === 'pago').reduce((s, l) => s + (l.valor_pago_centavos ?? l.valor_centavos), 0);
  const falta = o.total_centavos - lancado;

  return (
    <Cartao titulo="Recebimento" descricao="As parcelas deste orçamento no financeiro.">
      {ativos.length > 0 && (
        <ul className="mb-3 divide-y divide-stone-100 text-sm">
          {ativos.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {dia(l.vencimento)} · <span className="tabular">{formatarReais(l.valor_centavos)}</span>
              </span>
              <SeloSituacao s={situacao(l, hoje)} />
            </li>
          ))}
        </ul>
      )}
      <p className="mb-3 text-sm text-stone-600">
        Recebido {formatarReais(recebido)} de {formatarReais(o.total_centavos)}
        {falta > 0 && ativos.length > 0 && ` · ${formatarReais(falta)} ainda sem parcela`}
      </p>
      {gerando ? (
        <FormLancamento
          empresaId={empresa.id}
          tipo="receber"
          categorias={categorias.data ?? []}
          pessoas={o.cliente_id ? [{ id: o.cliente_id, nome: o.cliente_nome ?? 'Cliente' }] : []}
          inicial={{ descricao: `${o.projeto_nome} · ${numeroOrcamento(o.numero)}`.slice(0, 180), valorCentavos: Math.max(1, falta > 0 ? falta : o.total_centavos), clienteId: o.cliente_id, orcamentoId: o.id, modo: 'parcelado' }}
          aoFechar={() => setGerando(false)}
        />
      ) : (
        (ativos.length === 0 || falta > 0) && <Botao onClick={() => setGerando(true)}>{ativos.length ? 'Lançar o que falta' : 'Gerar contas a receber'}</Botao>
      )}
    </Cartao>
  );
}

function LinhaNota({ n, aoMudar }: { n: NotaFiscal; aoMudar: () => Promise<void> }) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function agir(corpo: Record<string, unknown>) {
    setErro(null);
    setOcupado(true);
    try {
      await chamarCobranca(corpo);
      await aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível.');
    } finally {
      setOcupado(false);
    }
  }
  const autorizada = n.status === 'autorizado';
  return (
    <li className="space-y-1 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {n.tipo === 'nfe' ? 'NF-e' : 'NFS-e'}
          {n.numero ? ` nº ${n.numero}${n.serie ? `/${n.serie}` : ''}` : ''} · <span className="tabular">{formatarReais(n.valor_centavos)}</span>
          {n.ambiente === 'teste' && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-950">homologação</span>}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${autorizada ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : n.status.startsWith('erro') || n.status === 'denegado' ? 'bg-red-50 text-red-800 ring-red-200' : 'bg-stone-100 text-stone-700 ring-stone-200'}`}>
          {NOME_STATUS_NOTA[n.status] ?? n.status}
        </span>
      </div>
      <p className="text-xs text-stone-500">{formatarData(n.created_at)}</p>
      {n.mensagem && <p className="text-xs text-stone-600">{n.mensagem}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        {n.url_pdf && (
          <a href={n.url_pdf} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center text-sm font-medium underline underline-offset-4 lg:min-h-0">
            {n.tipo === 'nfe' ? 'DANFE (PDF)' : 'Nota (PDF)'}
          </a>
        )}
        {n.url_xml && (
          <a href={n.url_xml} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center text-sm font-medium underline underline-offset-4 lg:min-h-0">
            XML
          </a>
        )}
        {!autorizada && n.status !== 'cancelado' && (
          <Botao variante="discreto" onClick={() => void agir({ acao: 'consultar_nota', nota: n.id })} carregando={ocupado}>
            Atualizar situação
          </Botao>
        )}
        {autorizada && (
          <Botao
            variante="discreto"
            disabled={ocupado}
            onClick={() => {
              const j = window.prompt('Motivo do cancelamento (de 15 a 255 letras):');
              if (j) void agir({ acao: 'cancelar_nota', nota: n.id, justificativa: j });
            }}
          >
            Cancelar nota
          </Botao>
        )}
      </div>
      {erro && <p className="text-xs text-red-700">{erro}</p>}
    </li>
  );
}

/** Nota fiscal do orçamento aprovado: NF-e do móvel e NFS-e da montagem, pela Focus NFe da marcenaria. */
function NotaFiscalDoOrcamento({ o }: { o: Orcamento }) {
  const { empresa } = useEmpresaAtual();
  const queryClient = useQueryClient();
  const notas = useQuery({ queryKey: chaveNotas(o.id), queryFn: () => buscarNotasDoOrcamento(o.id) });
  const integracoes = useQuery({ queryKey: chaveIntegracoes(empresa.id), queryFn: () => buscarIntegracoes(empresa.id) });
  const focus = integracoes.data?.find((i) => i.provedor === 'focus_nfe');
  const temNfse = !!(focus?.dados as { nfse?: unknown } | undefined)?.nfse;
  const [tipo, setTipo] = useState<'nfe' | 'nfse' | null>(null);
  const [descricao, setDescricao] = useState(o.projeto_nome);
  const [quantidade, setQuantidade] = useState('1');
  const [valor, setValor] = useState<number | null>(o.total_centavos);
  const [ncm, setNcm] = useState('');
  const [discriminacao, setDiscriminacao] = useState(`Montagem de ${o.projeto_nome} (${numeroOrcamento(o.numero)})`);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const recarregar = () => queryClient.invalidateQueries({ queryKey: chaveNotas(o.id) });

  async function emitir() {
    if (!valor) return setErro('Informe o valor.');
    setErro(null);
    setOcupado(true);
    try {
      const corpo =
        tipo === 'nfe'
          ? { acao: 'emitir_nota', orcamento: o.id, tipo, itens: [{ codigo: `ORC${o.numero}`, descricao, quantidade: Number(quantidade) || 1, valor_centavos: valor, ...(ncm ? { ncm } : {}) }] }
          : { acao: 'emitir_nota', orcamento: o.id, tipo, valor_centavos: valor, discriminacao };
      await chamarCobranca(corpo);
      setTipo(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível emitir.');
    } finally {
      setOcupado(false);
      await recarregar();
    }
  }

  return (
    <Cartao titulo="Nota fiscal">
      {!focus ? (
        <p className="text-sm text-stone-500">Ligue a Focus NFe da marcenaria em Financeiro → Boleto e nota para emitir daqui.</p>
      ) : (
        <>
          {(notas.data ?? []).length > 0 && (
            <ul className="mb-3 divide-y divide-stone-100 text-sm">
              {notas.data!.map((n) => (
                <LinhaNota key={n.id} n={n} aoMudar={recarregar} />
              ))}
            </ul>
          )}
          {tipo === null ? (
            <div className="flex flex-wrap gap-2">
              <Botao variante="secundario" onClick={() => setTipo('nfe')}>
                Emitir NF-e (móvel)
              </Botao>
              {temNfse && (
                <Botao variante="secundario" onClick={() => { setTipo('nfse'); setValor(null); }}>
                  Emitir NFS-e (montagem)
                </Botao>
              )}
            </div>
          ) : (
            <div className="space-y-3 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200">
              {focus.ambiente === 'teste' && <p className="text-xs text-amber-900">Homologação: a nota é de teste e não vale.</p>}
              {tipo === 'nfe' ? (
                <>
                  <Campo rotulo="Descrição do item" value={descricao} maxLength={120} onChange={(e) => setDescricao(e.target.value)} />
                  <div className="grid grid-cols-2 gap-3">
                    <Campo rotulo="Quantidade" inputMode="numeric" value={quantidade} onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                    <Campo rotulo="NCM deste item" inputMode="numeric" value={ncm} placeholder="padrão" maxLength={8} onChange={(e) => setNcm(e.target.value.replace(/\D/g, ''))} ajuda="Vazio: o NCM padrão." />
                  </div>
                </>
              ) : (
                <CampoTexto rotulo="Descrição do serviço" value={discriminacao} maxLength={2000} onChange={(e) => setDiscriminacao(e.target.value)} />
              )}
              <CampoReais rotulo={tipo === 'nfe' ? 'Valor dos produtos' : 'Valor do serviço'} valor={valor} aoMudar={setValor} ajuda={`O orçamento é de ${formatarReais(o.total_centavos)}.`} />
              {erro && <Aviso>{erro}</Aviso>}
              <div className="flex flex-wrap gap-2">
                <Botao onClick={() => void emitir()} carregando={ocupado}>
                  Emitir
                </Botao>
                <Botao variante="secundario" onClick={() => setTipo(null)}>
                  Voltar
                </Botao>
              </div>
            </div>
          )}
        </>
      )}
    </Cartao>
  );
}

/** No orçamento aprovado, para o dono: recebimento e nota fiscal. */
export function FinanceiroDoOrcamento({ o }: { o: Orcamento }) {
  return (
    <>
      <Recebimento o={o} />
      <NotaFiscalDoOrcamento o={o} />
    </>
  );
}
