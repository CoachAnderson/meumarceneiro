import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  dmm,
  emM2,
  formatarMm,
  lerMm,
  medidaDeCorte,
  type ChapaCortada,
  type ChapaDisponivel,
  type Dmm,
  type Dmm2,
  type ItemLista,
  type ParametrosCorte,
  type PecaCorte,
  type ResultadoOtimizacao,
  type VeioChapa,
} from '@marcenaria/core';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Campo, CampoSelecao, Carregando, Cartao } from '../components/ui';
import { buscarFitas, buscarRetalhos, buscarSaldos, chaveRetalhos, chaves, type Material } from '../lib/catalogo';
import { baixarTexto, metros, paraCsv } from '../lib/exportar';
import { lerCampo } from '../lib/formulario';
import type { CorteForm, Formulario } from './formulario';
import type { PedidoPlano, RespostaPlano } from './plano.worker';
import type { Calculo } from './useCalculo';
import { NOME_MATERIAL } from './estilo';

/** "0,45" → 45 centésimos de mm. Aceita até duas casas. */
function lerCmm(texto: string): number | null {
  const t = texto.trim().replace(',', '.');
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return null;
  const [inteiro, frac = ''] = t.split('.');
  return Number(inteiro) * 100 + Number(frac.padEnd(2, '0'));
}

const porcento = (mil: number) => `${(mil / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const m2 = (a: number) => emM2(a as Dmm2).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** O que o plano informa ao resto do editor: custo de chapas (orçamento) e o plano em si (produção). */
export interface ResumoPlano {
  custo: Array<{ chapaId: string; descricao: string; quantidade: number; precoCentavos: number | null }>;
  grupos: GrupoProducao[];
}

export interface GrupoProducao {
  materialId: string;
  material: string;
  veio: VeioChapa;
  pecas: PecaCorte[];
  chapas: ChapaCortada[];
}

interface Grupo {
  chave: string;
  material: Material;
  itens: ItemLista[];
  pecas: PecaCorte[];
  chapas: ChapaDisponivel[];
  parametros: ParametrosCorte;
  /** Itens cuja medida de corte foi arredondada para cima. */
  arredondados: string[];
}

export function PlanoCorte({
  f,
  atualizar,
  calculo,
  somenteLeitura,
  nomeArquivo,
  aoPlanejar,
}: {
  f: Formulario;
  atualizar: (parcial: Partial<Formulario>) => void;
  calculo: Calculo;
  somenteLeitura: boolean;
  nomeArquivo: string;
  /** Avisa quantas chapas o plano usa, para o orçamento. Null = plano incompleto. */
  aoPlanejar?: (resumo: ResumoPlano | null) => void;
}) {
  const { empresa } = useEmpresaAtual();
  const fitas = useQuery({ queryKey: chaves.fitas(empresa.id), queryFn: () => buscarFitas(empresa.id) });
  const retalhos = useQuery({ queryKey: chaveRetalhos(empresa.id), queryFn: () => buscarRetalhos(empresa.id) });
  const saldos = useQuery({ queryKey: chaves.saldos(empresa.id), queryFn: () => buscarSaldos(empresa.id) });
  const c = f.corte;
  const mudar = (parcial: Partial<CorteForm>) => atualizar({ corte: { ...c, ...parcial } });

  // ---- Parâmetros
  const erros: string[] = [];
  const mmCampo = (texto: string, nome: string) => {
    const r = lerCampo(texto, lerMm, { obrigatorio: true, nome });
    if (r.erro) erros.push(r.erro);
    return r.valor as Dmm | undefined;
  };
  const serra = mmCampo(c.serra, 'Serra');
  const refilo = mmCampo(c.refilo, 'Refilo da chapa');
  const refiloRetalho = mmCampo(c.refiloRetalho, 'Refilo do retalho');
  const sobraC = mmCampo(c.sobraMinComprimento, 'Sobra mínima (comprimento)');
  const sobraL = mmCampo(c.sobraMinLargura, 'Sobra mínima (largura)');

  const fitaCatalogo = (fitas.data ?? []).find((x) => x.id === c.fita);
  let espessuraFitaCmm = 0;
  if (c.fita === 'manual') {
    const v = lerCmm(c.espessuraFita);
    if (v === null) erros.push('Espessura da fita: use mm com até duas casas, por exemplo 0,45.');
    else espessuraFitaCmm = v;
  } else if (fitaCatalogo) {
    espessuraFitaCmm = fitaCatalogo.espessura_cmm;
  }
  const sobremedida = c.fita === 'nenhuma' ? 0 : lerCmm(c.sobremedidaFita);
  if (sobremedida === null) erros.push('Sobremedida da fita: use mm com até duas casas.');

  // ---- Grupos por material
  const { lista, matEstrutura, matFundo, matFrente, matGaveta } = calculo;
  const materialDe = { estrutura: matEstrutura, fundo: matFundo, frente: matFrente, gaveta: matGaveta };
  const grupos: Grupo[] = [];
  const semMaterial: string[] = [];
  if (lista && erros.length === 0) {
    const porMaterial = new Map<string, { material: Material; itens: ItemLista[] }>();
    for (const it of lista.itens) {
      const material = materialDe[it.material];
      if (!material) {
        if (!semMaterial.includes(it.material)) semMaterial.push(it.material);
        continue;
      }
      const g = porMaterial.get(material.id) ?? { material, itens: [] };
      g.itens.push(it);
      porMaterial.set(material.id, g);
    }
    for (const [chave, { material, itens }] of porMaterial) {
      const arredondados: string[] = [];
      const pecas = itens.map((it) => {
        const m = medidaDeCorte(it, { espessuraFitaCmm, sobremedidaCmm: sobremedida ?? 0 });
        if (m.arredondamentoCmm.comprimento || m.arredondamentoCmm.largura) arredondados.push(it.codigo);
        return { id: it.codigo, nome: `${it.codigo} ${it.nome}`, comprimento: m.comprimento, largura: m.largura, quantidade: it.quantidade, veio: it.veio };
      });
      // Formatos com mais chapas em estoque primeiro: em empate, o otimizador fica com o primeiro.
      const estoque = (id: string) => saldos.data?.chapas.get(id) ?? 0;
      const chapas: ChapaDisponivel[] = material.chapas
        .filter((x) => x.ativo)
        .sort((a, b) => estoque(b.id) - estoque(a.id) || a.id.localeCompare(b.id))
        .map((x) => ({ id: x.id, tipo: 'chapa', nome: `${formatarMm(dmm(x.comprimento_dmm))} × ${formatarMm(dmm(x.largura_dmm))}`, comprimento: dmm(x.comprimento_dmm), largura: dmm(x.largura_dmm), quantidade: null }));
      if (c.usarRetalhos) {
        for (const r of retalhos.data ?? []) {
          if (r.material_id !== material.id || r.quantidade <= 0) continue;
          chapas.push({ id: r.id, tipo: 'retalho', nome: `Retalho ${formatarMm(dmm(r.comprimento_dmm))} × ${formatarMm(dmm(r.largura_dmm))}`, comprimento: dmm(r.comprimento_dmm), largura: dmm(r.largura_dmm), quantidade: r.quantidade });
        }
      }
      grupos.push({
        chave,
        material,
        itens,
        pecas,
        chapas,
        arredondados,
        parametros: {
          serra: serra!,
          refilo: refilo!,
          refiloRetalho: refiloRetalho!,
          sobraMinima: { comprimento: sobraC!, largura: sobraL! },
          veio: material.veio as VeioChapa,
        },
      });
    }
  }

  // ---- Otimização num worker, refeita quando a entrada muda
  // Texto do pedido: muda só quando peças, chapas ou parâmetros mudam.
  const pedido = JSON.stringify(grupos.filter((g) => g.chapas.some((x) => x.tipo === 'chapa')).map(({ chave, pecas, chapas, parametros }) => ({ chave, pecas, chapas, parametros })));
  const worker = useRef<Worker | null>(null);
  const contador = useRef(0);
  const [resposta, setResposta] = useState<{ pedido: string; dados: RespostaPlano } | null>(null);
  const [erroWorker, setErroWorker] = useState<string | null>(null);

  useEffect(() => {
    return () => worker.current?.terminate();
  }, []);

  useEffect(() => {
    if (pedido === '[]') return;
    const id = ++contador.current;
    const t = setTimeout(() => {
      // Pedido novo: o anterior, se ainda rodando, é descartado.
      worker.current?.terminate();
      const w = new Worker(new URL('./plano.worker.ts', import.meta.url), { type: 'module' });
      worker.current = w;
      w.onmessage = (e: MessageEvent<RespostaPlano>) => {
        if (e.data.id === contador.current) setResposta({ pedido, dados: e.data });
        w.terminate();
        if (worker.current === w) worker.current = null;
      };
      w.onerror = (e) => setErroWorker(e.message || 'Falha ao calcular o plano de corte.');
      setErroWorker(null);
      w.postMessage({ id, grupos: JSON.parse(pedido) } satisfies PedidoPlano);
    }, 300);
    return () => clearTimeout(t);
  }, [pedido]);

  const atualizado = resposta?.pedido === pedido;

  // Impressão: copia só o plano para uma área no fim da página e chama o navegador.
  const [imprimindo, setImprimindo] = useState(false);
  useEffect(() => {
    if (!imprimindo) return;
    const fim = () => setImprimindo(false);
    window.addEventListener('afterprint', fim);
    const t = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', fim);
    };
  }, [imprimindo]);
  const resultados = new Map((atualizado ? resposta.dados.grupos : []).map((g) => [g.chave, g]));

  // Resumo para o orçamento: chapas inteiras usadas, por material.
  const completo = !!lista && erros.length === 0 && semMaterial.length === 0 && grupos.length > 0 && grupos.every((g) => resultados.get(g.chave)?.resultado?.plano);
  const resumo: ResumoPlano | null = completo
    ? {
        custo: grupos.flatMap((g) =>
          resultados
            .get(g.chave)!
            .resultado!.plano!.usoPorChapa.filter((u) => u.tipo === 'chapa')
            .map((u) => ({
              chapaId: u.chapaId,
              descricao: `${g.material.nome} ${formatarMm(dmm(g.material.espessura_nominal_dmm))} mm · chapa ${u.nome}`,
              quantidade: u.quantidade,
              precoCentavos: g.material.chapas.find((x) => x.id === u.chapaId)?.preco_centavos ?? null,
            })),
        ),
        grupos: grupos.map((g) => ({
          materialId: g.material.id,
          material: `${g.material.nome} ${formatarMm(dmm(g.material.espessura_nominal_dmm))} mm`,
          veio: g.parametros.veio,
          pecas: g.pecas,
          chapas: resultados.get(g.chave)!.resultado!.plano!.chapas,
        })),
      }
    : null;
  const resumoTexto = JSON.stringify(resumo);
  useEffect(() => {
    aoPlanejar?.(JSON.parse(resumoTexto) as ResumoPlano | null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumoTexto]);


  function exportarCsv() {
    const linhas: Array<Array<string | number>> = [['Material', 'Chapa', 'Origem', 'Medida da chapa (mm)', 'Peça', 'X (mm)', 'Y (mm)', 'Comprimento na chapa (mm)', 'Largura na chapa (mm)', 'Girada']];
    for (const g of grupos) {
      const plano = resultados.get(g.chave)?.resultado?.plano;
      if (!plano) continue;
      const nomes = new Map(g.pecas.map((p) => [p.id, p.nome]));
      plano.chapas.forEach((ch, i) => {
        for (const p of ch.pecas) {
          linhas.push([
            `${g.material.nome} ${formatarMm(dmm(g.material.espessura_nominal_dmm))} mm`,
            i + 1,
            ch.tipo === 'chapa' ? 'Chapa' : 'Retalho',
            `${formatarMm(ch.comprimento)} × ${formatarMm(ch.largura)}`,
            nomes.get(p.pecaId) ?? p.pecaId,
            formatarMm(p.x),
            formatarMm(p.y),
            formatarMm(p.dx),
            formatarMm(p.dy),
            p.girada ? 'sim' : 'não',
          ]);
        }
      });
    }
    baixarTexto(`${nomeArquivo}-plano-de-corte.csv`, paraCsv(linhas));
  }

  if (!lista) {
    return (
      <Cartao titulo="Plano de corte">
        <p className="text-sm text-stone-500">O plano sai da lista de peças; corrija os problemas do módulo primeiro.</p>
      </Cartao>
    );
  }

  const prontos = grupos.every((g) => resultados.get(g.chave)?.resultado?.plano);

  return (
    <Cartao
      titulo="Plano de corte"
      descricao="Cortes de guilhotina (de ponta a ponta), como na seccionadora. Cada plano é conferido peça por peça antes de aparecer."
      acoes={
        prontos && grupos.length > 0 ? (
          <div className="nao-imprimir flex gap-2">
            <Botao variante="secundario" onClick={exportarCsv}>
              CSV
            </Botao>
            <Botao variante="secundario" onClick={() => setImprimindo(true)}>
              Imprimir / PDF
            </Botao>
          </div>
        ) : undefined
      }
    >
      <fieldset disabled={somenteLeitura} className="nao-imprimir mb-5 grid gap-3 sm:grid-cols-3">
        <CampoSelecao
          rotulo="Fita de borda (desconto)"
          value={c.fita}
          onChange={(e) => mudar({ fita: e.target.value })}
          ajuda={c.fita === 'nenhuma' ? 'Corte = medida acabada.' : `Desconta ${(espessuraFitaCmm / 100).toLocaleString('pt-BR')} mm por borda com fita.`}
        >
          <option value="nenhuma">Não descontar</option>
          {(fitas.data ?? [])
            .filter((x) => x.ativo)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome} ({(x.espessura_cmm / 100).toLocaleString('pt-BR')} mm)
              </option>
            ))}
          <option value="manual">Informar espessura…</option>
        </CampoSelecao>
        {c.fita === 'manual' && <Campo rotulo="Espessura da fita (mm)" inputMode="decimal" value={c.espessuraFita} onChange={(e) => mudar({ espessuraFita: e.target.value })} />}
        {c.fita !== 'nenhuma' && (
          <Campo rotulo="Sobremedida p/ coladeira (mm)" inputMode="decimal" value={c.sobremedidaFita} onChange={(e) => mudar({ sobremedidaFita: e.target.value })} ajuda="Por borda com fita." />
        )}
        <Campo rotulo="Serra (mm)" inputMode="decimal" value={c.serra} onChange={(e) => mudar({ serra: e.target.value })} ajuda="Largura do corte." />
        <Campo rotulo="Refilo da chapa (mm)" inputMode="decimal" value={c.refilo} onChange={(e) => mudar({ refilo: e.target.value })} ajuda="Por borda, para esquadrejar." />
        <Campo rotulo="Refilo do retalho (mm)" inputMode="decimal" value={c.refiloRetalho} onChange={(e) => mudar({ refiloRetalho: e.target.value })} />
        <Campo rotulo="Retalho mínimo: compr. (mm)" inputMode="decimal" value={c.sobraMinComprimento} onChange={(e) => mudar({ sobraMinComprimento: e.target.value })} />
        <Campo rotulo="Retalho mínimo: larg. (mm)" inputMode="decimal" value={c.sobraMinLargura} onChange={(e) => mudar({ sobraMinLargura: e.target.value })} />
        <label className="flex items-center gap-2 self-center text-sm text-stone-700">
          <input type="checkbox" checked={c.usarRetalhos} onChange={(e) => mudar({ usarRetalhos: e.target.checked })} className="accent-amber-600" />
          Usar retalhos do estoque
        </label>
      </fieldset>

      {erros.length > 0 && (
        <Aviso>
          <ul className="list-inside list-disc">
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Aviso>
      )}
      {semMaterial.length > 0 && (
        <Aviso tipo="info">
          Para gerar o plano, escolha um material cadastrado (com formato de chapa) para {semMaterial.map((m) => NOME_MATERIAL[m as keyof typeof NOME_MATERIAL].toLowerCase()).join(', ')}.{' '}
          <Link to="/materiais" className="underline">
            Materiais
          </Link>
        </Aviso>
      )}
      {erroWorker && <Aviso>{erroWorker}</Aviso>}

      <div className="space-y-8">
        {grupos.map((g) => (
          <GrupoPlano key={g.chave} grupo={g} resultado={resultados.get(g.chave)} carregando={!atualizado} saldos={saldos.data?.chapas} />
        ))}
      </div>

      {imprimindo &&
        createPortal(
          <div className="area-impressao space-y-6 text-stone-900">
            <h1 className="text-lg font-semibold">Plano de corte — {nomeArquivo}</h1>
            <p className="text-xs">
              Serra {c.serra} mm · refilo {c.refilo} mm · {c.fita === 'nenhuma' ? 'medidas sem desconto de fita' : `desconto de fita ${(espessuraFitaCmm / 100).toLocaleString('pt-BR')} mm por borda`}
            </p>
            {grupos.map((g) => (
              <GrupoPlano key={g.chave} grupo={g} resultado={resultados.get(g.chave)} carregando={!atualizado} saldos={saldos.data?.chapas} />
            ))}
          </div>,
          document.body,
        )}
    </Cartao>
  );
}

function GrupoPlano({
  grupo,
  resultado,
  carregando,
  saldos,
}: {
  grupo: Grupo;
  resultado: { resultado?: ResultadoOtimizacao; erro?: string } | undefined;
  carregando: boolean;
  saldos: Map<string, number> | undefined;
}) {
  const { material } = grupo;
  const titulo = `${material.nome} ${formatarMm(dmm(material.espessura_nominal_dmm))} mm${material.veio !== 'sem_veio' ? ' · com veio' : ''}`;
  const temChapa = grupo.chapas.some((x) => x.tipo === 'chapa');
  const plano = resultado?.resultado?.plano;
  const porId = new Map(grupo.itens.map((i) => [i.codigo, i]));
  const corte = new Map(grupo.pecas.map((p) => [p.id, p]));

  return (
    <section>
      <h3 className="mb-3 font-medium text-stone-900">{titulo}</h3>

      {/* Lista de corte: medida acabada e medida que vai para a serra. */}
      <div className="-mx-5 mb-4 overflow-x-auto sm:-mx-6">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-stone-500">
              <th className="px-5 py-1.5 font-medium sm:px-6">Peça</th>
              <th className="px-3 py-1.5 text-right font-medium">Qtd</th>
              <th className="px-3 py-1.5 font-medium whitespace-nowrap">Acabada (mm)</th>
              <th className="px-5 py-1.5 font-medium whitespace-nowrap sm:px-6">Corte (mm)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {grupo.pecas.map((p) => {
              const it = porId.get(p.id)!;
              const mudou = it.comprimento !== p.comprimento || it.largura !== p.largura;
              return (
                <tr key={p.id}>
                  <td className="px-5 py-1.5 sm:px-6">{p.nome}</td>
                  <td className="tabular px-3 py-1.5 text-right">{p.quantidade}</td>
                  <td className="tabular px-3 py-1.5 whitespace-nowrap text-stone-500">
                    {formatarMm(it.comprimento)} × {formatarMm(it.largura)}
                  </td>
                  <td className={`tabular px-5 py-1.5 whitespace-nowrap sm:px-6 ${mudou ? 'font-medium' : ''}`}>
                    {formatarMm(p.comprimento)} × {formatarMm(p.largura)}
                    {grupo.arredondados.includes(p.id) && <span title="Arredondado para cima (0,1 mm), para a peça nunca sair menor."> ↑</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!temChapa ? (
        <Aviso tipo="info">Este material não tem formato de chapa ativo. Cadastre o tamanho da chapa em Materiais.</Aviso>
      ) : resultado?.erro ? (
        <Aviso>{resultado.erro}</Aviso>
      ) : !resultado || carregando ? (
        <Carregando texto="Calculando o plano…" />
      ) : resultado.resultado && resultado.resultado.naoCabem.length > 0 ? (
        <Aviso>
          <ul className="list-inside list-disc">
            {resultado.resultado.naoCabem.map((n) => (
              <li key={n.pecaId}>
                {n.nome}: {n.motivo}
              </li>
            ))}
          </ul>
        </Aviso>
      ) : !plano ? (
        <Aviso>Não foi possível montar o plano com as chapas disponíveis.</Aviso>
      ) : (
        <>
          <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-stone-500">Chapas</dt>
              <dd className="font-medium">
                {plano.usoPorChapa.map((u) => {
                  const estoque = u.tipo === 'chapa' ? saldos?.get(u.chapaId) : undefined;
                  const falta = estoque !== undefined && u.quantidade > estoque ? u.quantidade - estoque : 0;
                  return (
                    <span key={u.chapaId} className="block">
                      {u.quantidade}× {u.nome}
                      {falta > 0 && <span className="font-normal text-red-700"> · {falta === 1 ? 'falta 1' : `faltam ${falta}`} no estoque</span>}
                    </span>
                  );
                })}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Aproveitamento</dt>
              <dd className="tabular font-medium">
                {porcento(Math.floor((plano.areaPecas * 1000) / plano.areaChapas))}{' '}
                <span className="font-normal text-stone-500">({m2(plano.areaPecas)} de {m2(plano.areaChapas)} m²)</span>
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Perda</dt>
              <dd className="tabular font-medium">
                {porcento(plano.perdaMil)}{' '}
                <span className="font-normal text-stone-500">+ {m2(plano.areaRetalhosAproveitaveis)} m² em retalhos</span>
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Cortes</dt>
              <dd className="tabular font-medium">
                {plano.totalCortes} <span className="font-normal text-stone-500">({metros(plano.comprimentoCortes)} m)</span>
              </dd>
            </div>
          </dl>
          {plano.chapas.filter((x) => x.tipo === 'chapa').length > plano.minimoTeoricoChapas && (
            <p className="mb-4 text-xs text-stone-500">
              Pela área, o mínimo seria {plano.minimoTeoricoChapas} {plano.minimoTeoricoChapas === 1 ? 'chapa' : 'chapas'}; na prática o formato das peças e a serra pedem mais.
            </p>
          )}
          <div className="folhas grid gap-6 xl:grid-cols-2">
            {plano.chapas.map((ch, i) => (
              <FolhaCorte key={i} numero={i + 1} chapa={ch} nomes={corte} veio={grupo.parametros.veio} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function FolhaCorte({ numero, chapa, nomes, veio }: { numero: number; chapa: ChapaCortada; nomes: Map<string, PecaCorte>; veio: VeioChapa }) {
  const C = chapa.comprimento;
  const L = chapa.largura;
  const traco = Math.max(C, L) * 0.0015;
  const r = chapa.refilo;
  return (
    <figure className="break-inside-avoid">
      <figcaption className="mb-1.5 flex flex-wrap justify-between gap-2 text-sm">
        <span className="font-medium">
          {chapa.tipo === 'chapa' ? `Chapa ${numero}` : `Retalho (chapa ${numero})`} · {formatarMm(C)} × {formatarMm(L)}
        </span>
        <span className="tabular text-stone-500">
          {chapa.pecas.length} peças · {porcento(chapa.aproveitamentoMil)}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${C} ${L}`} className="block w-full rounded-sm" role="img" aria-label={`Chapa ${numero}: ${chapa.pecas.length} peças`}>
        <defs>
          <pattern id={`hachura-${numero}`} width={L / 40} height={L / 40} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2={L / 40} stroke="#d6d3d1" strokeWidth={traco * 1.5} />
          </pattern>
        </defs>
        <rect x={0} y={0} width={C} height={L} fill={`url(#hachura-${numero})`} stroke="#78716c" strokeWidth={traco} />
        {r > 0 && <rect x={r} y={r} width={C - 2 * r} height={L - 2 * r} fill="#fafaf9" stroke="none" />}
        {chapa.sobras.map((s, i) => {
          const aproveita = chapa.retalhos.some((r) => r.x === s.x && r.y === s.y);
          return (
            <g key={`s${i}`}>
              <rect x={s.x} y={s.y} width={s.dx} height={s.dy} fill={aproveita ? '#dcfce7' : `url(#hachura-${numero})`} stroke={aproveita ? '#16a34a' : 'none'} strokeWidth={traco} strokeDasharray={`${traco * 6} ${traco * 4}`} />
              {aproveita && <RotuloRetalho s={s} L={L} />}
            </g>
          );
        })}
        {chapa.pecas.map((p) => {
          const pc = nomes.get(p.pecaId);
          const fonte = Math.min(p.dy * 0.28, p.dx * 0.12, L * 0.045);
          const vertical = p.dy > p.dx * 1.6 && p.dx < L * 0.12;
          const cx = p.x + p.dx / 2;
          const cy = p.y + p.dy / 2;
          const fonteV = Math.min(p.dx * 0.28, p.dy * 0.12, L * 0.045);
          return (
            <g key={`${p.pecaId}#${p.unidade}`}>
              <rect x={p.x} y={p.y} width={p.dx} height={p.dy} fill="#fef3c7" stroke="#b45309" strokeWidth={traco} />
              <title>
                {pc?.nome} — {formatarMm(p.dx)} × {formatarMm(p.dy)} mm{p.girada ? ' (girada)' : ''}
              </title>
              {vertical ? (
                <text x={cx} y={cy} fontSize={fonteV} textAnchor="middle" dominantBaseline="middle" fill="#78350f" transform={`rotate(-90 ${cx} ${cy})`}>
                  {p.pecaId} · {formatarMm(p.dy)}×{formatarMm(p.dx)}
                </text>
              ) : (
                fonte > L * 0.012 && (
                  <>
                    <text x={cx} y={cy - fonte * 0.15} fontSize={fonte} textAnchor="middle" fill="#78350f" fontWeight={600}>
                      {p.pecaId}
                    </text>
                    <text x={cx} y={cy + fonte * 0.95} fontSize={fonte * 0.75} textAnchor="middle" fill="#92400e">
                      {formatarMm(p.dx)} × {formatarMm(p.dy)}
                    </text>
                  </>
                )
              )}
            </g>
          );
        })}
      </svg>
      {veio !== 'sem_veio' && <p className="mt-1 text-xs text-stone-500">Veio da chapa: {veio === 'comprimento' ? 'horizontal (→)' : 'vertical (↑)'}</p>}
    </figure>
  );
}

/** Texto do retalho, só se couber dentro dele. */
function RotuloRetalho({ s, L }: { s: { x: number; y: number; dx: number; dy: number }; L: number }) {
  const texto = `retalho ${formatarMm(dmm(s.dx))} × ${formatarMm(dmm(s.dy))}`;
  const fonte = Math.min(s.dy * 0.3, L * 0.04, s.dx / (texto.length * 0.58));
  if (fonte < L * 0.012) return null;
  return (
    <text x={s.x + s.dx / 2} y={s.y + s.dy / 2} fontSize={fonte} textAnchor="middle" dominantBaseline="middle" fill="#15803d">
      {texto}
    </text>
  );
}
