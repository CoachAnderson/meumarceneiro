import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatarMoeda } from '@marcenaria/catalog';
import { useAuth } from '../auth/AuthProvider';
import { Marca } from '../components/Marca';
import { Aviso, Botao, Carregando, Cartao, Titulo } from '../components/ui';
import { buscarPainel, chaveAdmin, ehAdministrador, estenderTeste, type EmpresaDoPainel, type SituacaoLicenca } from '../lib/admin';
import { mensagemDeErro } from '../lib/erros';
import { baixarTexto, paraCsv } from '../lib/exportar';
import { formatarData, formatarDocumento } from '../lib/validacao';

const NOME_SITUACAO: Record<SituacaoLicenca, string> = { ativa: 'Pagante', teste: 'Em teste', encerrando: 'Encerrando', bloqueada: 'Bloqueada' };
const COR_SITUACAO: Record<SituacaoLicenca, string> = {
  ativa: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  teste: 'bg-amber-50 text-amber-900 ring-amber-200',
  encerrando: 'bg-orange-50 text-orange-900 ring-orange-200',
  bloqueada: 'bg-red-50 text-red-800 ring-red-200',
};
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIA = 86_400_000;

/** Até quando a licença vale e quantos dias faltam, para a coluna "Vale até". */
function validade(e: EmpresaDoPainel, agora: number): { data: string | null; dias: number } {
  const ate = e.situacao === 'teste' ? e.teste_ate : e.situacao === 'bloqueada' ? null : e.paga_ate;
  return { data: ate, dias: ate ? Math.max(0, Math.ceil((Date.parse(ate) - agora) / DIA)) : 0 };
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
      <dt className="text-sm text-stone-500">{rotulo}</dt>
      <dd className="tabular mt-1 text-2xl font-semibold tracking-tight text-stone-900">{valor}</dd>
      {nota && <p className="mt-1 text-xs text-stone-500">{nota}</p>}
    </div>
  );
}

/** Painel do dono do sistema: licenças e receita. Fora do menu das marcenarias. */
export function Admin() {
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const admin = useQuery({ queryKey: chaveAdmin(usuario?.id), queryFn: () => ehAdministrador(usuario!.id), enabled: !!usuario });
  const painel = useQuery({ queryKey: ['admin-painel'], queryFn: buscarPainel, enabled: admin.data === true });
  const [filtro, setFiltro] = useState<SituacaoLicenca | 'todas' | 'vencendo'>('todas');
  const [busca, setBusca] = useState('');
  const [estendendo, setEstendendo] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<{ erro: boolean; texto: string } | null>(null);

  const agora = painel.data ? Date.parse(painel.data.resumo.agora) : 0;
  const empresas = painel.data?.empresas ?? [];
  const contagem = useMemo(() => {
    const c: Record<SituacaoLicenca, number> = { ativa: 0, teste: 0, encerrando: 0, bloqueada: 0 };
    for (const e of empresas) c[e.situacao]++;
    return c;
  }, [empresas]);
  // Oportunidade de venda: teste acabando em até 3 dias.
  const vencendo = (e: EmpresaDoPainel) => e.situacao === 'teste' && validade(e, agora).dias <= 3;
  const visiveis = empresas.filter((e) => {
    if (filtro === 'vencendo' ? !vencendo(e) : filtro !== 'todas' && e.situacao !== filtro) return false;
    const t = busca.trim().toLowerCase();
    return !t || [e.nome, e.dono_nome, e.dono_email, e.cnpj].some((x) => x?.toLowerCase().includes(t));
  });

  async function aoEstender(e: EmpresaDoPainel, dias: number) {
    if (estendendo) return;
    setEstendendo(e.id);
    setMensagem(null);
    try {
      await estenderTeste(e.id, dias);
      await queryClient.invalidateQueries({ queryKey: ['admin-painel'] });
      setMensagem({ erro: false, texto: `${e.nome}: mais ${dias} dias de teste.` });
    } catch (erro) {
      setMensagem({ erro: true, texto: mensagemDeErro(erro) });
    } finally {
      setEstendendo(null);
    }
  }

  function exportarCsv() {
    const linhas: Array<Array<string | number>> = [
      ['Marcenaria', 'CNPJ', 'Dono', 'E-mail', 'Cadastro', 'Situação', 'Vale até', 'Usuários', 'Projetos', 'Última atividade', 'Mensalidade (R$)', 'Última cobrança', 'Próxima cobrança', 'Total pago (R$)'],
      ...visiveis.map((e) => [
        e.nome,
        formatarDocumento(e.cnpj),
        e.dono_nome ?? '',
        e.dono_email ?? '',
        formatarData(e.criada_em),
        NOME_SITUACAO[e.situacao],
        validade(e, agora).data ? formatarData(validade(e, agora).data!) : '',
        e.usuarios,
        e.projetos,
        e.ultima_atividade ? formatarData(e.ultima_atividade) : '',
        e.valor_centavos ? (e.valor_centavos / 100).toFixed(2).replace('.', ',') : '',
        e.ultima_cobranca ? formatarData(e.ultima_cobranca) : '',
        e.proxima_cobranca ? formatarData(e.proxima_cobranca) : '',
        (e.total_pago_centavos / 100).toFixed(2).replace('.', ','),
      ]),
    ];
    baixarTexto('meu-marceneiro-licencas.csv', paraCsv(linhas), 'text/csv');
  }

  const moldura = (conteudo: React.ReactNode) => (
    <div className="min-h-dvh">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Marca />
          <span className="rounded-md bg-stone-900 px-2 py-0.5 text-xs font-medium text-white">Administração</span>
          <Link to="/" className="ml-auto text-sm font-medium text-stone-600 underline-offset-4 hover:underline">
            Voltar ao sistema
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{conteudo}</main>
    </div>
  );

  if (admin.isPending || (admin.data && painel.isPending)) return moldura(<Carregando texto="Carregando o painel…" />);
  if (admin.isError || painel.isError) return moldura(<Aviso>{mensagemDeErro(admin.error ?? painel.error)}</Aviso>);
  if (!admin.data || !painel.data) return moldura(<Aviso>Esta área é só do administrador do sistema.</Aviso>);

  const { resumo } = painel.data;
  const maior = Math.max(1, ...resumo.meses.map((m) => m.centavos));

  return moldura(
    <>
      <Titulo subtitulo="Marcenarias cadastradas, situação de cada licença e receita. Os dados de trabalho de cada marcenaria não aparecem aqui.">Vendas e licenças</Titulo>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Numero rotulo="Marcenarias" valor={String(empresas.length)} nota={`${resumo.empresas_novas_30d} nos últimos 30 dias`} />
        <Numero rotulo="Pagantes" valor={String(contagem.ativa)} nota={contagem.encerrando ? `${contagem.encerrando} encerrando` : undefined} />
        <Numero rotulo="Em teste" valor={String(contagem.teste)} nota={`${empresas.filter(vencendo).length} acabam em até 3 dias`} />
        <Numero rotulo="Bloqueadas" valor={String(contagem.bloqueada)} nota="Teste vencido ou pagamento parado" />
        <Numero rotulo="Receita mensal recorrente" valor={formatarMoeda(resumo.recorrente_centavos)} nota="Assinaturas ativas e em dia" />
        <Numero rotulo="Recebido neste mês" valor={formatarMoeda(resumo.recebido_mes_centavos)} nota={`${resumo.cancelamentos_30d} cancelamento(s) em 30 dias`} />
      </dl>

      <div className="mt-6 space-y-6">
        <Cartao titulo="Receita por mês" descricao="Cobranças aprovadas pelo Mercado Pago, valor cheio (antes da tarifa dele).">
          <div className="overflow-x-auto">
            <table className="w-full max-w-xl text-sm">
              <tbody>
                {resumo.meses.map((m) => {
                  const [ano, mes] = m.mes.split('-');
                  return (
                    <tr key={m.mes}>
                      <th scope="row" className="w-20 py-1 pr-3 text-left font-normal whitespace-nowrap text-stone-500">
                        {MESES[Number(mes) - 1]}/{ano?.slice(2)}
                      </th>
                      <td className="py-1">
                        <div className="h-5 rounded bg-amber-500" style={{ width: `${Math.max(m.centavos ? 2 : 0, (m.centavos / maior) * 100)}%` }} aria-hidden />
                      </td>
                      <td className="tabular w-40 py-1 pl-3 text-right whitespace-nowrap">
                        {formatarMoeda(m.centavos)} <span className="text-stone-500">· {m.cobrancas}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Cartao>

        <Cartao
          titulo="Marcenarias"
          descricao={`${visiveis.length} de ${empresas.length}`}
          acoes={
            <Botao variante="secundario" onClick={exportarCsv} disabled={visiveis.length === 0}>
              Baixar CSV
            </Botao>
          }
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(
              [
                ['todas', `Todas (${empresas.length})`],
                ['ativa', `Pagantes (${contagem.ativa})`],
                ['teste', `Em teste (${contagem.teste})`],
                ['vencendo', `Teste acabando (${empresas.filter(vencendo).length})`],
                ['encerrando', `Encerrando (${contagem.encerrando})`],
                ['bloqueada', `Bloqueadas (${contagem.bloqueada})`],
              ] as const
            ).map(([id, rotulo]) => (
              <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)} className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${filtro === id ? 'bg-stone-900 text-white ring-stone-900' : 'bg-white text-stone-700 ring-stone-300 hover:bg-stone-100'}`}>
                {rotulo}
              </button>
            ))}
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, dono ou e-mail"
              aria-label="Buscar marcenaria"
              className="ml-auto block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-amber-500 sm:w-72"
            />
          </div>
          {mensagem && (
            <div className="mb-4">
              <Aviso tipo={mensagem.erro ? 'erro' : 'sucesso'}>{mensagem.texto}</Aviso>
            </div>
          )}
          {visiveis.length === 0 ? (
            <p className="py-6 text-sm text-stone-500">{empresas.length === 0 ? 'Nenhuma marcenaria cadastrada ainda.' : 'Nenhuma marcenaria neste filtro.'}</p>
          ) : (
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="w-full min-w-[60rem] text-left text-sm">
                <thead className="border-y border-stone-200 bg-stone-50 text-xs text-stone-500">
                  <tr>
                    <th className="px-5 py-2 font-medium sm:px-6">Marcenaria</th>
                    <th className="px-3 py-2 font-medium">Dono</th>
                    <th className="px-3 py-2 font-medium">Situação</th>
                    <th className="px-3 py-2 font-medium">Vale até</th>
                    <th className="px-3 py-2 text-right font-medium">Uso</th>
                    <th className="px-3 py-2 text-right font-medium">Total pago</th>
                    <th className="px-5 py-2 font-medium sm:px-6">Teste</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {visiveis.map((e) => {
                    const v = validade(e, agora);
                    return (
                      <tr key={e.id} className="align-top">
                        <td className="px-5 py-3 sm:px-6">
                          <div className="font-medium text-stone-900">{e.nome}</div>
                          <div className="text-xs text-stone-500">Desde {formatarData(e.criada_em)}{e.cnpj ? ` · ${formatarDocumento(e.cnpj)}` : ''}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div>{e.dono_nome ?? '–'}</div>
                          {e.dono_email && (
                            <a href={`mailto:${e.dono_email}`} className="text-xs text-stone-500 underline-offset-2 hover:underline">
                              {e.dono_email}
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${COR_SITUACAO[e.situacao]}`}>{NOME_SITUACAO[e.situacao]}</span>
                          {e.assinatura_status === 'pendente' && <div className="mt-1 text-xs text-stone-500">Iniciou a assinatura e não pagou</div>}
                          {e.assinatura_status === 'pausada' && <div className="mt-1 text-xs text-stone-500">Assinatura pausada</div>}
                        </td>
                        <td className="tabular px-3 py-3 whitespace-nowrap">
                          {v.data ? (
                            <>
                              {formatarData(v.data)}
                              <div className={`text-xs ${vencendo(e) ? 'font-medium text-red-700' : 'text-stone-500'}`}>{v.dias === 1 ? 'falta 1 dia' : `faltam ${v.dias} dias`}</div>
                            </>
                          ) : (
                            '–'
                          )}
                        </td>
                        <td className="tabular px-3 py-3 text-right whitespace-nowrap">
                          {e.projetos} {e.projetos === 1 ? 'projeto' : 'projetos'}
                          <div className="text-xs text-stone-500">
                            {e.usuarios} {e.usuarios === 1 ? 'usuário' : 'usuários'}
                            {e.ultima_atividade ? ` · ${formatarData(e.ultima_atividade)}` : ''}
                          </div>
                        </td>
                        <td className="tabular px-3 py-3 text-right whitespace-nowrap">
                          {formatarMoeda(e.total_pago_centavos)}
                          {e.ultima_cobranca && <div className="text-xs text-stone-500">última em {formatarData(e.ultima_cobranca)}</div>}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap sm:px-6">
                          {e.situacao === 'ativa' ? (
                            <span className="text-xs text-stone-400">–</span>
                          ) : (
                            <span className="flex gap-1">
                              {[7, 15, 30].map((d) => (
                                <button
                                  key={d}
                                  type="button"
                                  disabled={!!estendendo}
                                  onClick={() => aoEstender(e, d)}
                                  aria-label={`Dar mais ${d} dias de teste a ${e.nome}`}
                                  className="rounded-md px-2 py-1 text-xs font-medium text-stone-700 ring-1 ring-inset ring-stone-300 hover:bg-stone-100 disabled:opacity-50"
                                >
                                  +{d} d
                                </button>
                              ))}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Cartao>
      </div>
    </>,
  );
}
