import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dmm } from '@marcenaria/core';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { useImpressao } from '../components/Imprimir';
import { Aviso, Botao, Carregando, Cartao, Titulo } from '../components/ui';
import { FolhaCorte } from '../editor/PlanoCorte';
import { buscarSaldos, chaveRetalhos, chaves } from '../lib/catalogo';
import { mensagemDeErro } from '../lib/erros';
import { metros } from '../lib/exportar';
import { formatarDia } from '../lib/orcamentos';
import {
  FLUXO,
  NOME_STATUS_ORDEM,
  baixarEstoque,
  buscarOrdem,
  chavesProducao,
  estornarBaixa,
  mudarStatusOrdem,
  numeroOrdem,
  podeEstornar,
  podeTocarOrdem,
  type Falta,
  type Ordem,
  type StatusOrdem,
} from '../lib/producao';
import { formatarData } from '../lib/projetos';
import { PecasDaOrdem } from '../producao/PecasDaOrdem';

const quantidadeFalta = (f: Falta, v: number) => (f.tipo === 'fita' ? `${metros(dmm(v))} m` : String(v));

/** Peças e plano de corte: o que vai impresso para a oficina. */
function FolhaDaOrdem({ o }: { o: Ordem }) {
  const d = o.dados;
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-2 font-medium">Peças</h2>
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="cartoes-celular min-w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-500">
                <th className="px-5 py-1.5 font-medium sm:px-6">Peça</th>
                <th className="px-3 py-1.5 font-medium">Material</th>
                <th className="px-3 py-1.5 text-right font-medium">Qtd</th>
                <th className="px-3 py-1.5 font-medium whitespace-nowrap">Corte (mm)</th>
                <th className="px-3 py-1.5 font-medium whitespace-nowrap">Acabada (mm)</th>
                <th className="px-3 py-1.5 font-medium">Fita</th>
                <th className="px-5 py-1.5 font-medium sm:px-6">Usinagem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {d.itens.map((i) => (
                <tr key={i.codigo}>
                  <td className="px-5 py-1.5 sm:px-6">
                    <span className="tabular text-stone-500">{i.codigo}</span> {i.nome}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{i.material}</td>
                  <td className="tabular px-3 py-1.5 text-right">{i.quantidade}</td>
                  <td className="tabular px-3 py-1.5 font-medium whitespace-nowrap">{i.corte}</td>
                  <td className="tabular px-3 py-1.5 whitespace-nowrap text-stone-500">{i.acabada}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{i.fita}</td>
                  <td className="px-5 py-1.5 text-xs text-stone-600 sm:px-6">{i.usinagem || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {d.ferragens.length > 0 && (
        <section>
          <h2 className="mb-2 font-medium">Ferragens</h2>
          <ul className="text-sm">
            {d.ferragens.map((f, i) => (
              <li key={i} className="flex justify-between border-b border-stone-100 py-1.5">
                <span>
                  {f.descricao}
                  {f.item && <span className="text-stone-500"> · {f.item}</span>}
                </span>
                <span className="tabular font-medium">{f.quantidade}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.grupos.map((g) => {
        const nomes = new Map(g.pecas.map((p) => [p.id, p]));
        return (
          <section key={g.material}>
            <h2 className="mb-3 font-medium">Plano de corte · {g.material}</h2>
            <div className="folhas grid gap-6 xl:grid-cols-2">
              {g.chapas.map((ch, i) => (
                <FolhaCorte key={i} numero={i + 1} chapa={ch} nomes={nomes} veio={g.veio} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function OrdemDetalhe() {
  const { id = '' } = useParams();
  const { empresa, papel } = useEmpresaAtual();
  const queryClient = useQueryClient();
  const consulta = useQuery({ queryKey: chavesProducao.uma(id), queryFn: () => buscarOrdem(id) });
  const saldos = useQuery({ queryKey: chaves.saldos(empresa.id), queryFn: () => buscarSaldos(empresa.id) });
  const { imprimir, Area } = useImpressao();
  const [erro, setErro] = useState<string | null>(null);
  const [faltas, setFaltas] = useState<Falta[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  if (consulta.isPending) return <Carregando />;
  if (consulta.error) return <Aviso>{mensagemDeErro(consulta.error)}</Aviso>;
  const o = consulta.data;
  if (!o) {
    return (
      <Aviso>
        Ordem não encontrada. <Link to="/producao" className="inline-block py-3 -my-3 underline">Voltar</Link>
      </Aviso>
    );
  }
  const c = o.dados.consumo;
  const tocar = podeTocarOrdem(papel);
  const posicao = FLUXO.indexOf(o.status);
  const proximo = posicao >= 0 && posicao < FLUXO.length - 1 ? FLUXO[posicao + 1] : null;
  const anterior = posicao > 0 ? FLUXO[posicao - 1] : null;

  async function recarregar() {
    await queryClient.invalidateQueries({ queryKey: chavesProducao.uma(o!.id) });
    await queryClient.invalidateQueries({ queryKey: chavesProducao.lista(empresa.id) });
    await queryClient.invalidateQueries({ queryKey: chaves.saldos(empresa.id) });
    await queryClient.invalidateQueries({ queryKey: chaveRetalhos(empresa.id) });
  }

  async function executar(acao: () => Promise<void>) {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      await acao();
      await recarregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }

  const status = (s: StatusOrdem) => executar(() => mudarStatusOrdem(o.id, s));
  const baixar = (forcar: boolean) =>
    executar(async () => {
      const r = await baixarEstoque(o.id, forcar);
      if (r.baixado) {
        setFaltas(null);
        setAviso(`Estoque baixado.${r.sobras_guardadas ? ` ${r.sobras_guardadas} sobra(s) guardada(s) como retalho.` : ''}`);
      } else {
        setFaltas(r.faltas);
      }
    });
  const estornar = () => {
    if (!window.confirm('Estornar a baixa? O material volta para o estoque e as sobras guardadas por esta ordem saem dos retalhos.')) return;
    void executar(async () => {
      await estornarBaixa(o.id);
      setAviso('Baixa estornada.');
    });
  };

  const linhasConsumo = [
    ...c.chapas.map((x) => ({ nome: x.nome, qtd: `${x.quantidade}`, saldo: saldos.data?.chapas.get(x.id), precisa: x.quantidade, unidade: '' })),
    ...c.retalhos.map((x) => ({ nome: x.nome, qtd: `${x.quantidade}`, saldo: undefined, precisa: 0, unidade: '' })),
    ...c.fitas.map((x) => ({ nome: x.nome, qtd: `${metros(dmm(x.dmm))} m`, saldo: saldos.data?.fitas.get(x.id), precisa: x.dmm, unidade: 'm' })),
    ...c.ferragens.map((x) => ({ nome: x.nome, qtd: `${x.quantidade}`, saldo: saldos.data?.ferragens.get(x.id), precisa: x.quantidade, unidade: '' })),
  ];

  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/producao" className="inline-flex min-h-11 items-center text-stone-500 hover:text-stone-900 lg:min-h-0">
          ← Produção
        </Link>
      </div>
      <Titulo
        subtitulo={
          <>
            {numeroOrdem(o.numero)} · {o.cliente_nome ?? 'Sem cliente'} · versão {o.projeto_versao} do projeto
            {o.dados.quantidadeModulos > 1 && ` · ${o.dados.quantidadeModulos} módulos`}
            {o.prazo && ` · prazo ${formatarDia(o.prazo)}`}
          </>
        }
      >
        {o.projeto_nome}
      </Titulo>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-stone-900 px-3 py-1 text-sm font-medium text-white">{NOME_STATUS_ORDEM[o.status]}</span>
        {tocar && proximo && (
          <Botao onClick={() => status(proximo)} disabled={ocupado}>
            Passar para {NOME_STATUS_ORDEM[proximo].toLowerCase()}
          </Botao>
        )}
        {tocar && anterior && (
          <Botao variante="discreto" onClick={() => status(anterior)} disabled={ocupado}>
            Voltar para {NOME_STATUS_ORDEM[anterior].toLowerCase()}
          </Botao>
        )}
        {tocar && o.status !== 'cancelada' && o.status !== 'concluida' && (
          <Botao variante="discreto" onClick={() => status('cancelada')} disabled={ocupado}>
            Cancelar ordem
          </Botao>
        )}
        {tocar && o.status === 'cancelada' && (
          <Botao variante="secundario" onClick={() => status('aguardando')} disabled={ocupado}>
            Reabrir
          </Botao>
        )}
        <span className="ml-auto" />
        <Botao variante="secundario" onClick={imprimir}>
          Imprimir / PDF
        </Botao>
      </div>

      {o.observacao && (
        <div className="mb-6">
          <Aviso tipo="info">{o.observacao}</Aviso>
        </div>
      )}
      {erro && (
        <div className="mb-6">
          <Aviso>{erro}</Aviso>
        </div>
      )}
      {aviso && (
        <div className="mb-6">
          <Aviso tipo="sucesso">{aviso}</Aviso>
        </div>
      )}

      <div className="mb-6">
        <PecasDaOrdem ordem={o} podeMarcar={tocar && o.status !== 'cancelada'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Cartao titulo="Para a oficina">
          <FolhaDaOrdem o={o} />
        </Cartao>

        <div className="space-y-6">
          <Cartao titulo="Estoque" descricao={o.baixa_em ? `Baixado em ${formatarData(o.baixa_em)}.` : 'O que esta ordem tira do estoque. A baixa é feita de uma vez.'}>
            {linhasConsumo.length === 0 ? (
              <p className="text-sm text-stone-500">Esta ordem não tem itens de estoque ligados.</p>
            ) : (
              <ul className="text-sm">
                {linhasConsumo.map((l, i) => {
                  const falta = !o.baixa_em && l.saldo !== undefined && l.saldo < l.precisa;
                  return (
                    <li key={i} className="flex justify-between gap-3 border-b border-stone-100 py-1.5">
                      <span className="min-w-0">
                        {l.nome}
                        {!o.baixa_em && l.precisa > 0 && (
                          <span className={`block text-xs ${falta ? 'text-red-700' : 'text-stone-500'}`}>
                            em estoque: {l.saldo === undefined ? 'sem registro' : l.unidade === 'm' ? `${metros(dmm(l.saldo))} m` : l.saldo}
                          </span>
                        )}
                      </span>
                      <span className="tabular font-medium whitespace-nowrap">{l.qtd}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {c.sobras.length > 0 && (
              <>
                <p className="mt-4 mb-1 text-sm font-medium">Sobras que viram retalho</p>
                <ul className="text-sm text-stone-600">
                  {c.sobras.map((x, i) => (
                    <li key={i} className="flex justify-between gap-3 py-0.5">
                      <span>{x.nome}</span>
                      <span className="tabular">{x.quantidade}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {faltas && faltas.length > 0 && !o.baixa_em && (
              <div className="mt-4">
                <Aviso>
                  <p className="mb-1 font-medium">Falta estoque; nada foi baixado:</p>
                  <ul className="list-inside list-disc">
                    {faltas.map((f) => (
                      <li key={f.nome}>
                        {f.nome}: precisa de {quantidadeFalta(f, f.precisa)}, tem {quantidadeFalta(f, f.tem)}
                      </li>
                    ))}
                  </ul>
                </Aviso>
              </div>
            )}

            {tocar && o.status !== 'cancelada' && (
              <div className="mt-4 flex flex-wrap gap-2">
                {!o.baixa_em ? (
                  <>
                    <Botao onClick={() => baixar(false)} carregando={ocupado} disabled={linhasConsumo.length === 0}>
                      Dar baixa no estoque
                    </Botao>
                    {faltas && faltas.length > 0 && (
                      <Botao variante="perigo" onClick={() => baixar(true)} disabled={ocupado} title="O saldo fica negativo até a compra ser lançada.">
                        Baixar mesmo assim
                      </Botao>
                    )}
                  </>
                ) : (
                  podeEstornar(papel) && (
                    <Botao variante="secundario" onClick={estornar} disabled={ocupado}>
                      Estornar baixa
                    </Botao>
                  )
                )}
              </div>
            )}
          </Cartao>

          {o.projeto_id && (
            <p className="text-sm text-stone-500">
              <Link to={`/projetos/${o.projeto_id}`} className="underline">
                Abrir o projeto
              </Link>{' '}
              (a ordem é uma fotografia da versão {o.projeto_versao}; mudanças no projeto pedem uma ordem nova).
            </p>
          )}
        </div>
      </div>

      <Area>
        <h1 className="text-lg font-semibold">
          {numeroOrdem(o.numero)} · {o.projeto_nome}
        </h1>
        <p className="mb-4 text-xs">
          {o.cliente_nome ?? 'Sem cliente'}
          {o.prazo && ` · prazo ${formatarDia(o.prazo)}`}
          {o.observacao && ` · ${o.observacao}`}
        </p>
        <FolhaDaOrdem o={o} />
      </Area>
    </>
  );
}
