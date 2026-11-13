import { useDeferredValue, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  NOME_TIPO_MATERIAL,
  NOME_VEIO,
  TIPOS_MATERIAL,
  centavosParaTexto,
  conferirEspessuraReal,
  formatarMoeda,
  lerEspessuraMaterial,
  lerInteiroNaoNegativo,
  lerMedidaChapa,
  lerPrecoChapa,
  type DirecaoVeio,
  type LinhaMaterial,
  type TipoMaterial,
} from '@marcenaria/catalog';
import { formatarMm, lerMm, type Dmm } from '@marcenaria/core';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { EstoqueEditor, Selo } from '../components/catalogo';
import { Aviso, Botao, Campo, CampoSelecao, CampoTexto, Carregando, Cartao, Titulo } from '../components/ui';
import {
  buscarFornecedores,
  buscarMateriais,
  buscarSaldos,
  chaves,
  definirEstoque,
  podeAjustarEstoque,
  podeEditarCatalogo,
  type Chapa,
  type Material,
} from '../lib/catalogo';
import { mensagemDeErro } from '../lib/erros';
import { erroVisivel, lerCampo } from '../lib/formulario';
import { supabase } from '../lib/supabase';

type Painel = { tipo: 'novo' } | { tipo: 'editar'; material: Material } | { tipo: 'serie' } | null;

export function Materiais() {
  const { empresa, papel } = useEmpresaAtual();
  const queryClient = useQueryClient();
  const [painel, setPainel] = useState<Painel>(null);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<TipoMaterial | ''>('');
  const [inativos, setInativos] = useState(false);
  const buscaAdiada = useDeferredValue(busca.trim().toLowerCase());

  const materiais = useQuery({ queryKey: chaves.materiais(empresa.id), queryFn: () => buscarMateriais(empresa.id) });
  const saldos = useQuery({ queryKey: chaves.saldos(empresa.id), queryFn: () => buscarSaldos(empresa.id) });

  const editar = podeEditarCatalogo(papel);

  const visiveis = useMemo(
    () =>
      (materiais.data ?? []).filter(
        (m) =>
          (inativos || m.ativo) &&
          (!tipo || m.tipo === tipo) &&
          (!buscaAdiada ||
            m.nome.toLowerCase().includes(buscaAdiada) ||
            (m.cor_padrao ?? '').toLowerCase().includes(buscaAdiada) ||
            (m.fabricante ?? '').toLowerCase().includes(buscaAdiada)),
      ),
    [materiais.data, inativos, tipo, buscaAdiada],
  );

  async function recarregar() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: chaves.materiais(empresa.id) }),
      queryClient.invalidateQueries({ queryKey: chaves.saldos(empresa.id) }),
      queryClient.invalidateQueries({ queryKey: chaves.fornecedores(empresa.id) }),
    ]);
  }

  return (
    <>
      <Titulo subtitulo="Chapas usadas nos projetos: espessura, veio, formatos, preço e estoque.">Materiais</Titulo>

      {editar && !painel && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Botao onClick={() => setPainel({ tipo: 'novo' })}>Novo material</Botao>
          <Botao variante="secundario" onClick={() => setPainel({ tipo: 'serie' })}>
            Cadastrar várias espessuras
          </Botao>
          <Link
            to="/importar?tipo=materiais"
            className="inline-flex min-h-10 items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-stone-800 ring-1 ring-inset ring-stone-300 hover:bg-stone-100"
          >
            Importar planilha
          </Link>
        </div>
      )}

      {painel?.tipo === 'serie' && (
        <div className="mb-6">
          <CadastroPorEspessuras
            empresaId={empresa.id}
            aoFechar={() => setPainel(null)}
            aoSalvar={async () => {
              await recarregar();
            }}
          />
        </div>
      )}
      {(painel?.tipo === 'novo' || painel?.tipo === 'editar') && (
        <div className="mb-6">
          <FormularioMaterial
            key={painel.tipo === 'editar' ? painel.material.id : 'novo'}
            empresaId={empresa.id}
            material={painel.tipo === 'editar' ? painel.material : null}
            aoFechar={() => setPainel(null)}
            aoSalvar={async () => {
              setPainel(null);
              await recarregar();
            }}
          />
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <Campo rotulo="Buscar" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, cor ou fabricante" />
        <CampoSelecao rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMaterial | '')}>
          <option value="">Todos</option>
          {TIPOS_MATERIAL.map((t) => (
            <option key={t} value={t}>
              {NOME_TIPO_MATERIAL[t]}
            </option>
          ))}
        </CampoSelecao>
        <label className="flex min-h-10 items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} className="size-4 accent-stone-900" />
          Mostrar inativos
        </label>
      </div>

      {materiais.isPending ? (
        <Carregando />
      ) : materiais.error ? (
        <Aviso>{mensagemDeErro(materiais.error)}</Aviso>
      ) : visiveis.length === 0 ? (
        <Cartao>
          <p className="text-sm text-stone-500">
            {(materiais.data ?? []).length === 0
              ? editar
                ? 'Nenhum material cadastrado. Comece por "Cadastrar várias espessuras" ou importe uma planilha.'
                : 'Nenhum material cadastrado.'
              : 'Nenhum material com esses filtros.'}
          </p>
        </Cartao>
      ) : (
        <div className="space-y-4">
          {saldos.error && <Aviso>Não foi possível carregar o estoque: {mensagemDeErro(saldos.error)}</Aviso>}
          {visiveis.map((m) => (
            <CartaoMaterial
              key={m.id}
              material={m}
              empresaId={empresa.id}
              saldos={saldos.data?.chapas}
              podeEditar={editar}
              podeExcluir={papel === 'dono'}
              podeAjustar={podeAjustarEstoque(papel)}
              aoEditar={() => setPainel({ tipo: 'editar', material: m })}
              aoMudar={recarregar}
            />
          ))}
        </div>
      )}
    </>
  );
}

function espessuraTexto(m: Material): string {
  const nominal = `${formatarMm(m.espessura_nominal_dmm as Dmm)} mm`;
  return m.espessura_real_dmm !== null ? `${nominal} (real ${formatarMm(m.espessura_real_dmm as Dmm)} mm)` : nominal;
}

function CartaoMaterial({
  material: m,
  empresaId,
  saldos,
  podeEditar,
  podeExcluir,
  podeAjustar,
  aoEditar,
  aoMudar,
}: {
  material: Material;
  empresaId: string;
  saldos: Map<string, number> | undefined;
  podeEditar: boolean;
  podeExcluir: boolean;
  podeAjustar: boolean;
  aoEditar: () => void;
  aoMudar: () => Promise<void>;
}) {
  const [chapaEmEdicao, setChapaEmEdicao] = useState<Chapa | 'nova' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function alternarAtivo() {
    setErro(null);
    const { error } = await supabase.from('materiais').update({ ativo: !m.ativo }).eq('id', m.id);
    if (error) setErro(mensagemDeErro(error));
    else await aoMudar();
  }

  async function excluir() {
    if (!window.confirm(`Excluir ${m.nome} ${formatarMm(m.espessura_nominal_dmm as Dmm)} mm e seus formatos de chapa?`)) return;
    setErro(null);
    const { error } = await supabase.from('materiais').delete().eq('id', m.id);
    if (error) {
      setErro(
        error.code === '23503'
          ? 'Este material tem histórico de estoque e não pode ser excluído. Use "Desativar" para tirá-lo das listas.'
          : mensagemDeErro(error),
      );
    } else await aoMudar();
  }

  async function excluirChapa(c: Chapa) {
    if (!window.confirm(`Excluir o formato ${formatarMm(c.comprimento_dmm as Dmm)} × ${formatarMm(c.largura_dmm as Dmm)} mm?`)) return;
    setErro(null);
    const { error } = await supabase.from('chapas').delete().eq('id', c.id);
    if (error) {
      setErro(
        error.code === '23503'
          ? 'Este formato tem histórico de estoque e não pode ser excluído. Use "Desativar".'
          : mensagemDeErro(error),
      );
    } else await aoMudar();
  }

  async function alternarChapa(c: Chapa) {
    setErro(null);
    const { error } = await supabase.from('chapas').update({ ativo: !c.ativo }).eq('id', c.id);
    if (error) setErro(mensagemDeErro(error));
    else await aoMudar();
  }

  const chapasVisiveis = m.chapas;

  return (
    <section className={`rounded-xl bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:p-6 ${m.ativo ? '' : 'opacity-70'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{m.nome}</h2>
            <Selo>{NOME_TIPO_MATERIAL[m.tipo]}</Selo>
            <span className="tabular text-sm font-medium text-stone-700">{espessuraTexto(m)}</span>
            {!m.ativo && <Selo tom="inativo">Inativo</Selo>}
          </div>
          <p className="mt-1 text-sm text-stone-500">
            {[m.cor_padrao, m.fabricante, NOME_VEIO[m.veio], m.fornecedor ? `Fornecedor: ${m.fornecedor.nome}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {(podeEditar || podeExcluir) && (
          <div className="-ml-3 flex flex-wrap gap-1 sm:ml-0">
            {podeEditar && (
              <>
                <Botao variante="discreto" className="min-h-9 px-3 py-1.5" onClick={aoEditar}>
                  Editar
                </Botao>
                <Botao variante="discreto" className="min-h-9 px-3 py-1.5" onClick={() => void alternarAtivo()}>
                  {m.ativo ? 'Desativar' : 'Reativar'}
                </Botao>
              </>
            )}
            {podeExcluir && (
              <Botao variante="discreto" className="min-h-9 px-3 py-1.5 text-red-700" onClick={() => void excluir()}>
                Excluir
              </Botao>
            )}
          </div>
        )}
      </div>

      {erro && (
        <div className="mt-3">
          <Aviso>{erro}</Aviso>
        </div>
      )}

      <div className="mt-4 -mx-5 border-t border-stone-100 text-sm sm:-mx-6">
        <div className="hidden px-5 py-2 text-stone-500 sm:flex sm:gap-6 sm:px-6">
          <span className="w-36 font-medium">Formato (mm)</span>
          <span className="w-28 font-medium">Preço</span>
          <span className="flex-1 font-medium">Estoque</span>
        </div>
        <ul className="divide-y divide-stone-100 border-t border-stone-100">
          {chapasVisiveis.length === 0 && chapaEmEdicao !== 'nova' && (
            <li className="px-5 py-3 text-stone-500 sm:px-6">Nenhum formato de chapa cadastrado.</li>
          )}
          {chapasVisiveis.map((c) =>
            chapaEmEdicao !== 'nova' && chapaEmEdicao?.id === c.id ? (
              <li key={c.id} className="px-5 py-3 sm:px-6">
                <FormularioChapa
                  empresaId={empresaId}
                  materialId={m.id}
                  chapa={c}
                  aoFechar={() => setChapaEmEdicao(null)}
                  aoSalvar={async () => {
                    setChapaEmEdicao(null);
                    await aoMudar();
                  }}
                />
              </li>
            ) : (
              <li
                key={c.id}
                className={`flex flex-wrap items-center gap-x-6 gap-y-1.5 px-5 py-2.5 sm:px-6 ${c.ativo ? '' : 'text-stone-400'}`}
              >
                <span className="tabular w-36 font-medium whitespace-nowrap">
                  {formatarMm(c.comprimento_dmm as Dmm)} × {formatarMm(c.largura_dmm as Dmm)}
                  {!c.ativo && <span className="ml-2 text-xs font-normal">(inativo)</span>}
                </span>
                <span className="tabular w-28 whitespace-nowrap">
                  {c.preco_centavos === null ? <Selo tom="aviso">sem preço</Selo> : formatarMoeda(c.preco_centavos)}
                </span>
                <span className="min-w-40 flex-1">
                  <EstoqueEditor
                    saldo={saldos?.get(c.id)}
                    unidade={saldos?.get(c.id) === 1 ? 'chapa' : 'chapas'}
                    formatar={(n) => String(n)}
                    ler={(t) => lerInteiroNaoNegativo(t, 'Quantidade')}
                    podeAjustar={podeAjustar && c.ativo}
                    aoSalvar={async (n, motivo) => {
                      await definirEstoque({ chapa: c.id }, n, motivo);
                      await aoMudar();
                    }}
                  />
                </span>
                {(podeEditar || podeExcluir) && (
                  <span className="-ml-2 flex whitespace-nowrap sm:ml-auto">
                    {podeEditar && (
                      <>
                        <Botao variante="discreto" className="min-h-8 px-2 py-1 text-xs" onClick={() => setChapaEmEdicao(c)}>
                          Editar
                        </Botao>
                        <Botao variante="discreto" className="min-h-8 px-2 py-1 text-xs" onClick={() => void alternarChapa(c)}>
                          {c.ativo ? 'Desativar' : 'Reativar'}
                        </Botao>
                      </>
                    )}
                    {podeExcluir && (
                      <Botao variante="discreto" className="min-h-8 px-2 py-1 text-xs text-red-700" onClick={() => void excluirChapa(c)}>
                        Excluir
                      </Botao>
                    )}
                  </span>
                )}
              </li>
            ),
          )}
          {chapaEmEdicao === 'nova' && (
            <li className="px-5 py-3 sm:px-6">
              <FormularioChapa
                empresaId={empresaId}
                materialId={m.id}
                chapa={null}
                aoFechar={() => setChapaEmEdicao(null)}
                aoSalvar={async () => {
                  setChapaEmEdicao(null);
                  await aoMudar();
                }}
              />
            </li>
          )}
        </ul>
      </div>

      {podeEditar && chapaEmEdicao === null && m.ativo && (
        <button
          type="button"
          onClick={() => setChapaEmEdicao('nova')}
          className="mt-3 text-sm font-medium text-amber-800 hover:underline"
        >
          + Adicionar formato de chapa
        </button>
      )}
    </section>
  );
}

function FormularioChapa({
  empresaId,
  materialId,
  chapa,
  aoFechar,
  aoSalvar,
}: {
  empresaId: string;
  materialId: string;
  chapa: Chapa | null;
  aoFechar: () => void;
  aoSalvar: () => Promise<void>;
}) {
  const [comp, setComp] = useState(chapa ? formatarMm(chapa.comprimento_dmm as Dmm) : '');
  const [larg, setLarg] = useState(chapa ? formatarMm(chapa.largura_dmm as Dmm) : '');
  const [preco, setPreco] = useState(centavosParaTexto(chapa?.preco_centavos));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const c = lerCampo(comp, (t) => lerMedidaChapa(t, 'Comprimento'), { obrigatorio: true, nome: 'Comprimento' });
  const l = lerCampo(larg, (t) => lerMedidaChapa(t, 'Largura'), { obrigatorio: true, nome: 'Largura' });
  const p = lerCampo(preco, lerPrecoChapa);
  const valido = c.valor !== undefined && l.valor !== undefined && !p.erro;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setSalvando(true);
    setErro(null);
    const dados = { comprimento_dmm: c.valor, largura_dmm: l.valor, preco_centavos: p.valor ?? null };
    const { error } = chapa
      ? await supabase.from('chapas').update(dados).eq('id', chapa.id)
      : await supabase.from('chapas').insert({ ...dados, empresa_id: empresaId, material_id: materialId });
    setSalvando(false);
    if (error) {
      setErro(mensagemDeErro(error, { duplicado: 'Este material já tem um formato com essas medidas.' }));
      return;
    }
    await aoSalvar();
  }

  return (
    <form onSubmit={salvar} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-start" noValidate>
      <Campo rotulo="Comprimento (mm)" inputMode="decimal" value={comp} onChange={(e) => setComp(e.target.value)} erro={erroVisivel(comp, c)} autoFocus />
      <Campo rotulo="Largura (mm)" inputMode="decimal" value={larg} onChange={(e) => setLarg(e.target.value)} erro={erroVisivel(larg, l)} />
      <Campo rotulo="Preço da chapa (R$)" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} erro={p.erro} ajuda="Opcional" />
      <div className="flex gap-2 sm:pt-7">
        <Botao type="submit" carregando={salvando} disabled={!valido}>
          Salvar
        </Botao>
        <Botao type="button" variante="secundario" onClick={aoFechar}>
          Cancelar
        </Botao>
      </div>
      {erro && (
        <div className="sm:col-span-4">
          <Aviso>{erro}</Aviso>
        </div>
      )}
    </form>
  );
}

function SeletorFornecedor({ empresaId, valor, aoMudar }: { empresaId: string; valor: string; aoMudar: (id: string) => void }) {
  const fornecedores = useQuery({ queryKey: chaves.fornecedores(empresaId), queryFn: () => buscarFornecedores(empresaId) });
  return (
    <CampoSelecao
      rotulo="Fornecedor"
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      ajuda={
        <>
          Opcional. <Link to="/fornecedores" className="underline">Cadastrar fornecedores</Link>
        </>
      }
    >
      <option value="">Nenhum</option>
      {(fornecedores.data ?? [])
        .filter((f) => f.ativo || f.id === valor)
        .map((f) => (
          <option key={f.id} value={f.id}>
            {f.nome}
          </option>
        ))}
    </CampoSelecao>
  );
}

function FormularioMaterial({
  empresaId,
  material,
  aoFechar,
  aoSalvar,
}: {
  empresaId: string;
  material: Material | null;
  aoFechar: () => void;
  aoSalvar: () => Promise<void>;
}) {
  const [tipo, setTipo] = useState<TipoMaterial>(material?.tipo ?? 'mdf');
  const [nome, setNome] = useState(material?.nome ?? '');
  const [fabricante, setFabricante] = useState(material?.fabricante ?? '');
  const [cor, setCor] = useState(material?.cor_padrao ?? '');
  const [espessura, setEspessura] = useState(material ? formatarMm(material.espessura_nominal_dmm as Dmm) : '');
  const [real, setReal] = useState(material?.espessura_real_dmm ? formatarMm(material.espessura_real_dmm as Dmm) : '');
  const [veio, setVeio] = useState<DirecaoVeio>(material?.veio ?? 'sem_veio');
  const [fornecedor, setFornecedor] = useState(material?.fornecedor_id ?? '');
  const [observacoes, setObservacoes] = useState(material?.observacoes ?? '');
  // Primeiro formato de chapa, só na criação.
  const [comp, setComp] = useState('');
  const [larg, setLarg] = useState('');
  const [preco, setPreco] = useState('');
  const [estoque, setEstoque] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fornecedores = useQuery({ queryKey: chaves.fornecedores(empresaId), queryFn: () => buscarFornecedores(empresaId) });
  const { data: materiaisExistentes } = useQuery({ queryKey: chaves.materiais(empresaId), queryFn: () => buscarMateriais(empresaId) });

  const e = lerCampo(espessura, (t) => lerEspessuraMaterial(t), { obrigatorio: true, nome: 'Espessura' });
  const r = lerCampo(real, (t) => {
    const v = lerMm(t);
    if (e.valor !== undefined) conferirEspessuraReal(e.valor, v);
    return v;
  });
  const temChapa = comp.trim() !== '' || larg.trim() !== '';
  const c = lerCampo(comp, (t) => lerMedidaChapa(t, 'Comprimento'), { obrigatorio: temChapa, nome: 'Comprimento' });
  const l = lerCampo(larg, (t) => lerMedidaChapa(t, 'Largura'), { obrigatorio: temChapa, nome: 'Largura' });
  const p = lerCampo(preco, lerPrecoChapa);
  const q = lerCampo(estoque, (t) => lerInteiroNaoNegativo(t, 'Estoque'));
  const erroChapa = !temChapa && (preco.trim() || estoque.trim()) ? 'Informe o tamanho da chapa para registrar preço e estoque.' : null;

  const valido =
    nome.trim().length >= 2 &&
    e.valor !== undefined &&
    !r.erro &&
    (!temChapa || (c.valor !== undefined && l.valor !== undefined)) &&
    !p.erro &&
    !q.erro &&
    !erroChapa;

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    if (!valido || e.valor === undefined) return;
    setSalvando(true);
    setErro(null);

    const dados = {
      tipo,
      nome: nome.trim(),
      fabricante: fabricante.trim() || null,
      cor_padrao: cor.trim() || null,
      espessura_nominal_dmm: e.valor,
      espessura_real_dmm: r.valor ?? null,
      veio,
      fornecedor_id: fornecedor || null,
      observacoes: observacoes.trim() || null,
    };

    try {
      if (material) {
        const { error } = await supabase.from('materiais').update(dados).eq('id', material.id);
        if (error) throw error;
      } else {
        // A importação cria material, formato e estoque numa única transação,
        // mas atualizaria um cadastro existente; para "novo", confere antes.
        const repetido = (materiaisExistentes ?? []).some(
          (m) => m.nome.trim().toLowerCase() === dados.nome.toLowerCase() && m.espessura_nominal_dmm === e.valor,
        );
        if (repetido) {
          setErro('Já existe um material com este nome e espessura.');
          setSalvando(false);
          return;
        }
        const linha: LinhaMaterial = {
          linha: 1,
          tipo,
          nome: dados.nome,
          fabricante: dados.fabricante ?? undefined,
          cor_padrao: dados.cor_padrao ?? undefined,
          espessura_nominal_dmm: e.valor,
          espessura_real_dmm: r.valor,
          veio,
          observacoes: dados.observacoes ?? undefined,
          comprimento_dmm: c.valor,
          largura_dmm: l.valor,
          preco_centavos: p.valor,
          estoque: q.valor,
          fornecedor: fornecedores.data?.find((f) => f.id === fornecedor)?.nome,
        };
        const { error } = await supabase.rpc('importar_materiais', { p_empresa: empresaId, p_linhas: [linha] });
        if (error) throw error;
      }
      setSalvando(false);
      await aoSalvar();
    } catch (err) {
      setSalvando(false);
      setErro(mensagemDeErro(err, { duplicado: 'Já existe um material com este nome e espessura.' }).replace(/^Linha 1: /, ''));
    }
  }

  return (
    <Cartao titulo={material ? `Editar ${material.nome}` : 'Novo material'}>
      <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" noValidate>
        {erro && (
          <div className="sm:col-span-2 lg:col-span-3">
            <Aviso>{erro}</Aviso>
          </div>
        )}
        <CampoSelecao rotulo="Tipo" value={tipo} onChange={(ev) => setTipo(ev.target.value as TipoMaterial)} obrigatorio>
          {TIPOS_MATERIAL.map((t) => (
            <option key={t} value={t}>
              {NOME_TIPO_MATERIAL[t]}
            </option>
          ))}
        </CampoSelecao>
        <div className="lg:col-span-2">
          <Campo rotulo="Nome" value={nome} onChange={(ev) => setNome(ev.target.value)} maxLength={160} obrigatorio placeholder="Ex.: MDF Branco TX" />
        </div>
        <Campo rotulo="Cor e padrão" value={cor} onChange={(ev) => setCor(ev.target.value)} maxLength={80} />
        <Campo rotulo="Fabricante" value={fabricante} onChange={(ev) => setFabricante(ev.target.value)} maxLength={80} />
        <SeletorFornecedor empresaId={empresaId} valor={fornecedor} aoMudar={setFornecedor} />
        <Campo
          rotulo="Espessura nominal (mm)"
          inputMode="decimal"
          value={espessura}
          onChange={(ev) => setEspessura(ev.target.value)}
          erro={erroVisivel(espessura, e)}
          obrigatorio
          ajuda="Como no catálogo: 6, 9, 15, 18, 25"
        />
        <Campo
          rotulo="Espessura real (mm)"
          inputMode="decimal"
          value={real}
          onChange={(ev) => setReal(ev.target.value)}
          erro={r.erro}
          ajuda="Opcional. Medida com paquímetro; os cálculos usam esta."
        />
        <CampoSelecao rotulo="Direção do veio" value={veio} onChange={(ev) => setVeio(ev.target.value as DirecaoVeio)}>
          {(Object.keys(NOME_VEIO) as DirecaoVeio[]).map((v) => (
            <option key={v} value={v}>
              {NOME_VEIO[v]}
            </option>
          ))}
        </CampoSelecao>
        <div className="sm:col-span-2 lg:col-span-3">
          <CampoTexto rotulo="Observações" value={observacoes} onChange={(ev) => setObservacoes(ev.target.value)} maxLength={2000} />
        </div>

        {!material && (
          <fieldset className="grid gap-4 rounded-lg bg-stone-50 p-4 ring-1 ring-stone-200 sm:col-span-2 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-4">
            <legend className="px-1 text-sm font-medium text-stone-800">Primeiro formato de chapa (opcional)</legend>
            <Campo rotulo="Comprimento (mm)" inputMode="decimal" value={comp} onChange={(ev) => setComp(ev.target.value)} erro={erroVisivel(comp, c) ?? (temChapa && !comp.trim() ? c.erro : null)} />
            <Campo rotulo="Largura (mm)" inputMode="decimal" value={larg} onChange={(ev) => setLarg(ev.target.value)} erro={erroVisivel(larg, l) ?? (temChapa && !larg.trim() ? l.erro : null)} />
            <Campo rotulo="Preço da chapa (R$)" inputMode="decimal" value={preco} onChange={(ev) => setPreco(ev.target.value)} erro={p.erro} />
            <Campo rotulo="Estoque inicial (chapas)" inputMode="numeric" value={estoque} onChange={(ev) => setEstoque(ev.target.value)} erro={q.erro} />
            {erroChapa && <p className="text-sm text-red-700 sm:col-span-2 lg:col-span-4">{erroChapa}</p>}
          </fieldset>
        )}

        <div className="flex gap-3 sm:col-span-2 lg:col-span-3">
          <Botao type="submit" carregando={salvando} disabled={!valido}>
            Salvar
          </Botao>
          <Botao type="button" variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}

const ESPESSURAS_COMUNS = ['3', '6', '9', '12', '15', '18', '25'];

/** Cria o mesmo material em várias espessuras de uma vez (ex.: MDF Branco TX 6, 15, 18 e 25 mm). */
function CadastroPorEspessuras({
  empresaId,
  aoFechar,
  aoSalvar,
}: {
  empresaId: string;
  aoFechar: () => void;
  aoSalvar: () => Promise<void>;
}) {
  const [tipo, setTipo] = useState<TipoMaterial>('mdf');
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState('');
  const [fabricante, setFabricante] = useState('');
  const [veio, setVeio] = useState<DirecaoVeio>('sem_veio');
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [outras, setOutras] = useState('');
  const [comp, setComp] = useState('');
  const [larg, setLarg] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const extras = lerCampo(outras, (t) =>
    t
      .split(/[;\s]+/)
      .filter(Boolean)
      .map((x) => lerEspessuraMaterial(x)),
  );
  const espessuras = [...new Set([...marcadas.map((m) => lerMm(m)), ...(extras.valor ?? [])])].sort((a, b) => a - b);
  const temChapa = comp.trim() !== '' || larg.trim() !== '';
  const c = lerCampo(comp, (t) => lerMedidaChapa(t, 'Comprimento'), { obrigatorio: temChapa, nome: 'Comprimento' });
  const l = lerCampo(larg, (t) => lerMedidaChapa(t, 'Largura'), { obrigatorio: temChapa, nome: 'Largura' });
  const valido =
    nome.trim().length >= 2 && espessuras.length > 0 && !extras.erro && (!temChapa || (c.valor !== undefined && l.valor !== undefined));

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    if (!valido) return;
    setSalvando(true);
    setErro(null);
    const linhas: LinhaMaterial[] = espessuras.map((esp, i) => ({
      linha: i + 1,
      tipo,
      nome: nome.trim(),
      fabricante: fabricante.trim() || undefined,
      cor_padrao: cor.trim() || undefined,
      espessura_nominal_dmm: esp,
      veio,
      comprimento_dmm: c.valor,
      largura_dmm: l.valor,
    }));
    const { data, error } = await supabase.rpc('importar_materiais', { p_empresa: empresaId, p_linhas: linhas });
    setSalvando(false);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    const r = data as { materiais_criados: number; materiais_atualizados: number; chapas_criadas: number };
    setResultado(
      `${r.materiais_criados} material(is) criado(s)${r.materiais_atualizados ? `, ${r.materiais_atualizados} já existia(m)` : ''}` +
        `${r.chapas_criadas ? ` e ${r.chapas_criadas} formato(s) de chapa` : ''}. Informe os preços e o estoque em cada formato.`,
    );
    await aoSalvar();
  }

  return (
    <Cartao
      titulo="Cadastrar várias espessuras"
      descricao="Cria o mesmo material em cada espessura marcada, com o mesmo formato de chapa. Preço e estoque você informa depois, formato por formato."
    >
      {resultado ? (
        <div className="space-y-4">
          <Aviso tipo="sucesso">{resultado}</Aviso>
          <Botao variante="secundario" onClick={aoFechar}>
            Fechar
          </Botao>
        </div>
      ) : (
        <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" noValidate>
          {erro && (
            <div className="sm:col-span-2 lg:col-span-3">
              <Aviso>{erro}</Aviso>
            </div>
          )}
          <CampoSelecao rotulo="Tipo" value={tipo} onChange={(ev) => setTipo(ev.target.value as TipoMaterial)}>
            {TIPOS_MATERIAL.map((t) => (
              <option key={t} value={t}>
                {NOME_TIPO_MATERIAL[t]}
              </option>
            ))}
          </CampoSelecao>
          <div className="lg:col-span-2">
            <Campo rotulo="Nome" value={nome} onChange={(ev) => setNome(ev.target.value)} obrigatorio placeholder="Ex.: MDF Branco TX" />
          </div>
          <Campo rotulo="Cor e padrão" value={cor} onChange={(ev) => setCor(ev.target.value)} maxLength={80} />
          <Campo rotulo="Fabricante" value={fabricante} onChange={(ev) => setFabricante(ev.target.value)} maxLength={80} />
          <CampoSelecao rotulo="Direção do veio" value={veio} onChange={(ev) => setVeio(ev.target.value as DirecaoVeio)}>
            {(Object.keys(NOME_VEIO) as DirecaoVeio[]).map((v) => (
              <option key={v} value={v}>
                {NOME_VEIO[v]}
              </option>
            ))}
          </CampoSelecao>

          <fieldset className="sm:col-span-2 lg:col-span-3">
            <legend className="mb-2 text-sm font-medium text-stone-800">Espessuras (mm)</legend>
            <div className="flex flex-wrap gap-2">
              {ESPESSURAS_COMUNS.map((esp) => {
                const ativa = marcadas.includes(esp);
                return (
                  <button
                    key={esp}
                    type="button"
                    aria-pressed={ativa}
                    onClick={() => setMarcadas((m) => (ativa ? m.filter((x) => x !== esp) : [...m, esp]))}
                    className={`tabular min-h-10 min-w-12 rounded-lg px-3 text-sm font-medium ring-1 ring-inset ${
                      ativa ? 'bg-stone-900 text-white ring-stone-900' : 'bg-white text-stone-700 ring-stone-300 hover:bg-stone-100'
                    }`}
                  >
                    {esp}
                  </button>
                );
              })}
              <input
                aria-label="Outras espessuras"
                value={outras}
                onChange={(ev) => setOutras(ev.target.value)}
                placeholder="Outras: 4 10,5"
                className="min-h-10 w-40 rounded-lg border-0 px-3 text-sm ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-amber-500"
              />
            </div>
            {extras.erro && <p className="mt-1.5 text-sm text-red-700">{extras.erro}</p>}
          </fieldset>

          <Campo rotulo="Comprimento da chapa (mm)" inputMode="decimal" value={comp} onChange={(ev) => setComp(ev.target.value)} erro={erroVisivel(comp, c)} ajuda="Opcional, mas necessário para preço e estoque" />
          <Campo rotulo="Largura da chapa (mm)" inputMode="decimal" value={larg} onChange={(ev) => setLarg(ev.target.value)} erro={erroVisivel(larg, l)} />

          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
            <Botao type="submit" carregando={salvando} disabled={!valido}>
              {espessuras.length > 1 ? `Criar ${espessuras.length} materiais` : 'Criar material'}
            </Botao>
            <Botao type="button" variante="secundario" onClick={aoFechar}>
              Cancelar
            </Botao>
            {espessuras.length > 0 && nome.trim() && (
              <span className="text-sm text-stone-500">
                {espessuras.map((esp) => `${nome.trim()} ${formatarMm(esp)} mm`).join(' · ')}
              </span>
            )}
          </div>
        </form>
      )}
    </Cartao>
  );
}
