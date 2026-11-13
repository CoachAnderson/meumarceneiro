import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { gerarManual, resultadoDoModelo, SEM_BORDAS, type ItemLista, type ModeloMontagem } from '@marcenaria/core';
import { Marca } from '../components/Marca';
import { Aviso, Botao, Carregando } from '../components/ui';
import { FuracaoDaPeca, origemDaPeca } from '../editor/FolhaFuracao';
import { useEmpresa } from '../empresa/EmpresaProvider';
import { mensagemDeErro } from '../lib/erros';
import { ACAO_ETAPA, buscarPeca, chavesOficina, ETAPAS, etapasDaPeca, marcarEtapa, NOME_ETAPA, proximaEtapa, UUID, type Etapa } from '../lib/oficina';
import { buscarOrdem, chavesProducao, numeroOrdem, podeTocarOrdem } from '../lib/producao';
import { formatarData } from '../lib/projetos';
import { SeloEtapa } from '../producao/PecasDaOrdem';
import { VistaIsometrica } from '../montagem/VistaIsometrica';

const Cena3D = lazy(() => import('../montagem/Cena3D'));

/** A peça como item da folha de furação (uma unidade). */
function itemDaPeca(modelo: ModeloMontagem, componente: string, codigo: string): ItemLista | null {
  const c = modelo.componentes.find((x) => x.id === componente);
  if (!c?.furos?.length) return null;
  return {
    codigo,
    nome: c.nome,
    papel: c.papel,
    material: c.material,
    comprimento: c.comprimento,
    largura: c.largura,
    espessura: c.espessura,
    bordas: SEM_BORDAS,
    veio: false,
    usinagens: c.furos.map((f) => ({ tipo: 'furos' as const, ...f })),
    quantidade: 1,
    ids: [c.id],
  };
}

/**
 * Oficina pelo celular: a página que abre ao escanear a etiqueta. Mostra a
 * peça, onde ela vai no móvel, a furação e a etapa; quem é da produção marca
 * a etapa com um toque.
 */
export function OficinaPeca() {
  const { id = '' } = useParams();
  const valido = UUID.test(id);
  const queryClient = useQueryClient();
  const { vinculos } = useEmpresa();
  const consulta = useQuery({ queryKey: chavesOficina.peca(id), queryFn: () => buscarPeca(id), enabled: valido });
  const ordemId = consulta.data?.peca.ordem_id;
  const ordem = useQuery({ queryKey: chavesProducao.uma(ordemId ?? ''), queryFn: () => buscarOrdem(ordemId!), enabled: !!ordemId });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [modo, setModo] = useState<'3d' | 'desenho'>('3d');

  const peca = consulta.data?.peca;
  const modelo = ordem.data?.dados.modelo;
  const passo = useMemo(() => {
    if (!modelo || !peca) return null;
    const manual = gerarManual(resultadoDoModelo(modelo), new Map(Object.entries(modelo.codigos)));
    const p = manual?.passos.find((x) => x.novas.some((n) => n.id === peca.componente));
    return p && manual ? { passo: p, total: manual.passos.length } : null;
  }, [modelo, peca]);

  const cabecalho = (
    <header className="mb-4 flex items-center justify-between gap-3">
      <Marca />
      <Link to="/producao" className="inline-flex min-h-11 items-center text-sm text-stone-600 underline underline-offset-4">
        Produção
      </Link>
    </header>
  );

  if (!valido) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-5">
        {cabecalho}
        <Aviso>Este link de etiqueta não é válido.</Aviso>
      </main>
    );
  }
  if (consulta.isPending || (ordemId && ordem.isPending)) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-5">
        {cabecalho}
        <Carregando texto="Abrindo a peça…" />
      </main>
    );
  }
  const falha = consulta.error ?? ordem.error;
  if (falha || !peca || !ordem.data) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-5">
        {cabecalho}
        <Aviso>{falha ? mensagemDeErro(falha) : 'Peça não encontrada. Ela pode ser de outra marcenaria ou a ordem foi apagada; entre com a conta da equipe.'}</Aviso>
      </main>
    );
  }

  const o = ordem.data;
  const papel = vinculos.find((v) => v.empresa.id === peca.empresa_id)?.papel;
  const pode = !!papel && podeTocarOrdem(papel) && o.status !== 'cancelada';
  const etapas = etapasDaPeca(peca);
  const proxima = proximaEtapa(peca);
  const anterior = [...etapas].reverse().find((e) => ETAPAS.indexOf(e) < ETAPAS.indexOf(peca.etapa)) ?? null;
  const item = o.dados.itens.find((i) => i.codigo === peca.codigo);
  const furacao = modelo ? itemDaPeca(modelo, peca.componente, peca.codigo) : null;
  const componente = modelo?.componentes.find((c) => c.id === peca.componente);
  const varios = o.dados.quantidadeModulos > 1;

  async function marcar(etapa: Etapa) {
    setErro(null);
    setFeito(null);
    setOcupado(true);
    try {
      await marcarEtapa([peca!.id], etapa);
      setFeito(`Marcada como ${NOME_ETAPA[etapa].toLowerCase()}.`);
      await queryClient.invalidateQueries({ queryKey: chavesOficina.peca(peca!.id) });
      await queryClient.invalidateQueries({ queryKey: chavesOficina.daOrdem(peca!.ordem_id) });
      await queryClient.invalidateQueries({ queryKey: chavesProducao.uma(peca!.ordem_id) });
      await queryClient.invalidateQueries({ queryKey: ['andamento-ordens'] });
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }

  const nova = new Set([peca.componente]);
  const nenhuma = new Set<string>();

  return (
    <main className="mx-auto max-w-5xl px-4 py-5">
      {cabecalho}

      <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-stone-200 sm:p-6">
        <p className="text-sm text-stone-500">
          <Link to={`/producao/${o.id}`} className="underline underline-offset-4">
            {numeroOrdem(o.numero)}
          </Link>{' '}
          · {o.projeto_nome}
          {o.cliente_nome ? ` · ${o.cliente_nome}` : ''}
        </p>
        <h1 className="mt-1 flex flex-wrap items-baseline gap-x-3 text-2xl font-semibold tracking-tight text-stone-900">
          <span className="font-mono text-3xl font-extrabold">{peca.codigo}</span>
          <span>{peca.nome}</span>
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Etiqueta nº {peca.seq}
          {varios ? ` · módulo ${peca.unidade} de ${o.dados.quantidadeModulos}` : ''}
          {o.status === 'cancelada' ? ' · ordem cancelada' : ''}
        </p>

        <ol className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Etapas da peça">
          {etapas.map((e, k) => {
            const atual = e === peca.etapa;
            const passou = ETAPAS.indexOf(e) < ETAPAS.indexOf(peca.etapa);
            return (
              <li key={e} className="flex items-center gap-1.5">
                {k > 0 && <span className={`h-0.5 w-3 ${passou || atual ? 'bg-amber-600' : 'bg-stone-300'}`} aria-hidden />}
                <span
                  aria-current={atual ? 'step' : undefined}
                  className={`rounded-full px-2.5 py-1 text-sm font-medium ring-1 ring-inset ${atual ? 'bg-amber-600 text-white ring-amber-700' : passou ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-white text-stone-500 ring-stone-300'}`}
                >
                  {NOME_ETAPA[e]}
                </span>
              </li>
            );
          })}
        </ol>

        {pode ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {proxima ? (
              <Botao onClick={() => marcar(proxima)} carregando={ocupado} className="min-h-14 flex-1 text-base sm:flex-none sm:px-8">
                {ACAO_ETAPA[proxima]}
              </Botao>
            ) : (
              <p className="flex min-h-14 items-center text-base font-medium text-emerald-800">Peça montada.</p>
            )}
            {anterior && (
              <Botao variante="secundario" onClick={() => marcar(anterior)} disabled={ocupado} className="min-h-14">
                Voltar para {NOME_ETAPA[anterior].toLowerCase()}
              </Botao>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-stone-500">
            Etapa atual: <SeloEtapa etapa={peca.etapa} />
            {o.status !== 'cancelada' && ' · Só a produção, o projetista e o dono marcam a etapa.'}
          </p>
        )}
        {feito && (
          <div className="mt-3">
            <Aviso tipo="sucesso">{feito}</Aviso>
          </div>
        )}
        {erro && (
          <div className="mt-3">
            <Aviso>{erro}</Aviso>
          </div>
        )}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="min-w-0 rounded-xl bg-white p-4 shadow-sm ring-1 ring-stone-200 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Onde vai</h2>
            {modelo && (
              <div className="inline-flex rounded-lg bg-stone-100 p-1" role="tablist" aria-label="Como ver">
                {(['3d', 'desenho'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={modo === m}
                    onClick={() => setModo(m)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${modo === m ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'}`}
                  >
                    {m === '3d' ? '3D' : 'Desenho'}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!modelo || !componente ? (
            <p className="text-sm text-stone-500">Esta ordem foi criada sem o modelo 3D (versão antiga ou projeto grande demais). Veja a peça na folha da ordem.</p>
          ) : modo === '3d' ? (
            <Suspense fallback={<div className="flex h-[22rem] items-center justify-center"><Carregando texto="Carregando 3D…" /></div>}>
              <Cena3D componentes={modelo.componentes} montadas={nenhuma} novas={nova} contexto chave={peca.id} rotulo={`${peca.nome} no móvel`} />
            </Suspense>
          ) : (
            <div className="rounded-lg bg-stone-50 p-2 ring-1 ring-stone-200">
              <VistaIsometrica componentes={modelo.componentes} montadas={nenhuma} novas={nova} contexto rotulo={`${peca.nome} no móvel`} className="mx-auto max-h-[24rem] w-full" />
            </div>
          )}
          {passo && (
            <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm ring-1 ring-amber-200">
              <p className="font-medium text-amber-950">
                Manual de montagem: passo {passo.passo.numero} de {passo.total} · {passo.passo.titulo}
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-950">
                {passo.passo.instrucoes.filter((t) => t.includes(`(${peca.codigo})`)).slice(0, 6).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div className="min-w-0 space-y-5">
          {item && (
            <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-stone-200 sm:p-6">
              <h2 className="mb-3 text-base font-semibold">Medidas</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-stone-500">Corte (mm)</dt>
                  <dd className="tabular text-lg font-semibold">{item.corte}</dd>
                </div>
                <div>
                  <dt className="text-stone-500">Acabada (mm)</dt>
                  <dd className="tabular">{item.acabada}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-stone-500">Material</dt>
                  <dd>{item.material}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-stone-500">Fita</dt>
                  <dd>{item.fita}</dd>
                </div>
                {item.usinagem && (
                  <div className="col-span-2">
                    <dt className="text-stone-500">Usinagem</dt>
                    <dd className="text-stone-700">{item.usinagem}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-stone-200 sm:p-6">
            <h2 className="mb-3 text-base font-semibold">Histórico</h2>
            {consulta.data!.eventos.length === 0 ? (
              <p className="text-sm text-stone-500">Nenhuma etapa marcada ainda.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {consulta.data!.eventos.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-2">
                    <SeloEtapa etapa={e.para} />
                    <span className="text-stone-500">
                      {formatarData(e.em)}
                      {e.quem?.nome ? ` · ${e.quem.nome}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {furacao && componente && (
        <section className="mt-5">
          <h2 className="mb-3 text-base font-semibold">Furação</h2>
          <FuracaoDaPeca item={furacao} origem={origemDaPeca(componente)} />
        </section>
      )}
    </main>
  );
}
