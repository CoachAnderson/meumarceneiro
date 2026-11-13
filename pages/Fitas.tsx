import { useDeferredValue, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  centavosParaTexto,
  formatarCmm,
  formatarMetros,
  formatarMoeda,
  lerEspessuraFita,
  lerEstoqueMetros,
  lerLarguraFita,
  lerPrecoMetro,
  lerRoloMetros,
} from '@marcenaria/catalog';
import { formatarMm, type Dmm } from '@marcenaria/core';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { EstoqueEditor, Selo } from '../components/catalogo';
import { Aviso, Botao, Campo, CampoSelecao, CampoTexto, Carregando, Cartao, Titulo } from '../components/ui';
import {
  buscarFitas,
  buscarFornecedores,
  buscarSaldos,
  chaves,
  definirEstoque,
  podeAjustarEstoque,
  podeEditarCatalogo,
  type Fita,
} from '../lib/catalogo';
import { mensagemDeErro } from '../lib/erros';
import { erroVisivel, lerCampo } from '../lib/formulario';
import { supabase } from '../lib/supabase';

export function Fitas() {
  const { empresa, papel } = useEmpresaAtual();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<Fita | 'nova' | null>(null);
  const [busca, setBusca] = useState('');
  const [inativas, setInativas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const buscaAdiada = useDeferredValue(busca.trim().toLowerCase());

  const fitas = useQuery({ queryKey: chaves.fitas(empresa.id), queryFn: () => buscarFitas(empresa.id) });
  const saldos = useQuery({ queryKey: chaves.saldos(empresa.id), queryFn: () => buscarSaldos(empresa.id) });
  const editar = podeEditarCatalogo(papel);
  const ajustar = podeAjustarEstoque(papel);
  const podeExcluir = papel === 'dono';

  const visiveis = useMemo(
    () =>
      (fitas.data ?? []).filter(
        (f) =>
          (inativas || f.ativo) &&
          (!buscaAdiada || f.nome.toLowerCase().includes(buscaAdiada) || (f.cor_padrao ?? '').toLowerCase().includes(buscaAdiada)),
      ),
    [fitas.data, inativas, buscaAdiada],
  );

  async function recarregar() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: chaves.fitas(empresa.id) }),
      queryClient.invalidateQueries({ queryKey: chaves.saldos(empresa.id) }),
    ]);
  }

  async function alternar(f: Fita) {
    setErro(null);
    const { error } = await supabase.from('fitas').update({ ativo: !f.ativo }).eq('id', f.id);
    if (error) setErro(mensagemDeErro(error));
    else await recarregar();
  }

  async function excluir(f: Fita) {
    if (!window.confirm(`Excluir a fita ${f.nome}?`)) return;
    setErro(null);
    const { error } = await supabase.from('fitas').delete().eq('id', f.id);
    if (error) {
      setErro(
        error.code === '23503'
          ? 'Esta fita tem histórico de estoque e não pode ser excluída. Use "Desativar" para tirá-la das listas.'
          : mensagemDeErro(error),
      );
    } else await recarregar();
  }

  return (
    <>
      <Titulo subtitulo="Largura e espessura de cada fita, preço por metro e estoque em metros.">Fitas de borda</Titulo>

      {editar && !editando && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Botao onClick={() => setEditando('nova')}>Nova fita</Botao>
          <Link
            to="/importar?tipo=fitas"
            className="inline-flex min-h-10 items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-stone-800 ring-1 ring-inset ring-stone-300 hover:bg-stone-100"
          >
            Importar planilha
          </Link>
        </div>
      )}

      {editando && (
        <div className="mb-6">
          <FormularioFita
            key={editando === 'nova' ? 'nova' : editando.id}
            empresaId={empresa.id}
            fita={editando === 'nova' ? null : editando}
            aoFechar={() => setEditando(null)}
            aoSalvar={async () => {
              setEditando(null);
              await recarregar();
            }}
          />
        </div>
      )}

      <Cartao>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="w-full max-w-sm">
            <Campo rotulo="Buscar" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou cor" />
          </div>
          <label className="flex min-h-10 items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={inativas} onChange={(e) => setInativas(e.target.checked)} className="size-4 accent-stone-900" />
            Mostrar inativas
          </label>
        </div>

        {erro && (
          <div className="mb-4">
            <Aviso>{erro}</Aviso>
          </div>
        )}
        {saldos.error && (
          <div className="mb-4">
            <Aviso>Não foi possível carregar o estoque: {mensagemDeErro(saldos.error)}</Aviso>
          </div>
        )}

        {fitas.isPending ? (
          <Carregando />
        ) : fitas.error ? (
          <Aviso>{mensagemDeErro(fitas.error)}</Aviso>
        ) : visiveis.length === 0 ? (
          <p className="py-4 text-sm text-stone-500">
            {(fitas.data ?? []).length === 0 ? 'Nenhuma fita cadastrada.' : 'Nenhuma fita com esses filtros.'}
          </p>
        ) : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="cartoes-tablet min-w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-stone-500">
                  <th className="px-5 py-2 font-medium sm:px-6">Fita</th>
                  <th className="px-3 py-2 font-medium">Largura × espessura</th>
                  <th className="px-3 py-2 font-medium">Preço/m</th>
                  <th className="px-3 py-2 font-medium">Rolo</th>
                  <th className="px-3 py-2 font-medium">Estoque</th>
                  {(editar || podeExcluir) && <th className="px-5 py-2 sm:px-6"><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visiveis.map((f) => (
                  <tr key={f.id} className={`align-top ${f.ativo ? '' : 'text-stone-400'}`}>
                    <td className="px-5 py-3 sm:px-6">
                      <p className="font-medium">
                        {f.nome}
                        {!f.ativo && <span className="ml-2 text-xs font-normal">(inativa)</span>}
                      </p>
                      <p className="text-stone-500">{[f.cor_padrao, f.fabricante, f.fornecedor?.nome].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td className="tabular px-3 py-3 whitespace-nowrap">
                      {formatarMm(f.largura_dmm as Dmm)} × {formatarCmm(f.espessura_cmm)} mm
                    </td>
                    <td className="tabular px-3 py-3 whitespace-nowrap">
                      {f.preco_metro_centavos === null ? <Selo tom="aviso">sem preço</Selo> : formatarMoeda(f.preco_metro_centavos)}
                    </td>
                    <td className="tabular px-3 py-3 whitespace-nowrap">
                      {f.comprimento_rolo_dmm === null ? '–' : `${formatarMetros(f.comprimento_rolo_dmm)} m`}
                    </td>
                    <td className="px-3 py-3">
                      <EstoqueEditor
                        saldo={saldos.data?.fitas.get(f.id)}
                        unidade="m"
                        formatar={formatarMetros}
                        ler={lerEstoqueMetros}
                        podeAjustar={ajustar && f.ativo}
                        aoSalvar={async (n, motivo) => {
                          await definirEstoque({ fita: f.id }, n, motivo);
                          await recarregar();
                        }}
                      />
                    </td>
                    {(editar || podeExcluir) && (
                      <td className="px-5 py-2 text-right whitespace-nowrap sm:px-6">
                        {editar && (
                          <>
                            <Botao variante="discreto" className="min-h-8 px-2 py-1 text-xs" onClick={() => setEditando(f)}>
                              Editar
                            </Botao>
                            <Botao variante="discreto" className="min-h-8 px-2 py-1 text-xs" onClick={() => void alternar(f)}>
                              {f.ativo ? 'Desativar' : 'Reativar'}
                            </Botao>
                          </>
                        )}
                        {podeExcluir && (
                          <Botao variante="discreto" className="min-h-8 px-2 py-1 text-xs text-red-700" onClick={() => void excluir(f)}>
                            Excluir
                          </Botao>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </>
  );
}

function FormularioFita({
  empresaId,
  fita,
  aoFechar,
  aoSalvar,
}: {
  empresaId: string;
  fita: Fita | null;
  aoFechar: () => void;
  aoSalvar: () => Promise<void>;
}) {
  const fornecedores = useQuery({ queryKey: chaves.fornecedores(empresaId), queryFn: () => buscarFornecedores(empresaId) });
  const [nome, setNome] = useState(fita?.nome ?? '');
  const [cor, setCor] = useState(fita?.cor_padrao ?? '');
  const [fabricante, setFabricante] = useState(fita?.fabricante ?? '');
  const [largura, setLargura] = useState(fita ? formatarMm(fita.largura_dmm as Dmm) : '');
  const [espessura, setEspessura] = useState(fita ? formatarCmm(fita.espessura_cmm) : '');
  const [rolo, setRolo] = useState(fita?.comprimento_rolo_dmm ? formatarMetros(fita.comprimento_rolo_dmm) : '');
  const [preco, setPreco] = useState(centavosParaTexto(fita?.preco_metro_centavos));
  const [fornecedor, setFornecedor] = useState(fita?.fornecedor_id ?? '');
  const [observacoes, setObservacoes] = useState(fita?.observacoes ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const l = lerCampo(largura, lerLarguraFita, { obrigatorio: true, nome: 'Largura' });
  const e = lerCampo(espessura, lerEspessuraFita, { obrigatorio: true, nome: 'Espessura' });
  const r = lerCampo(rolo, lerRoloMetros);
  const p = lerCampo(preco, lerPrecoMetro);
  const valido = nome.trim().length >= 2 && l.valor !== undefined && e.valor !== undefined && !r.erro && !p.erro;

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    if (!valido) return;
    setSalvando(true);
    setErro(null);
    const dados = {
      nome: nome.trim(),
      cor_padrao: cor.trim() || null,
      fabricante: fabricante.trim() || null,
      largura_dmm: l.valor,
      espessura_cmm: e.valor,
      comprimento_rolo_dmm: r.valor ?? null,
      preco_metro_centavos: p.valor ?? null,
      fornecedor_id: fornecedor || null,
      observacoes: observacoes.trim() || null,
    };
    const { error } = fita
      ? await supabase.from('fitas').update(dados).eq('id', fita.id)
      : await supabase.from('fitas').insert({ ...dados, empresa_id: empresaId });
    setSalvando(false);
    if (error) {
      setErro(mensagemDeErro(error, { duplicado: 'Já existe uma fita com este nome, largura e espessura.' }));
      return;
    }
    await aoSalvar();
  }

  return (
    <Cartao titulo={fita ? `Editar ${fita.nome}` : 'Nova fita de borda'}>
      <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" noValidate>
        {erro && (
          <div className="sm:col-span-2 lg:col-span-3">
            <Aviso>{erro}</Aviso>
          </div>
        )}
        <div className="sm:col-span-2">
          <Campo rotulo="Nome" value={nome} onChange={(ev) => setNome(ev.target.value)} maxLength={160} obrigatorio placeholder="Ex.: Fita Branco TX 22×0,45" />
        </div>
        <Campo rotulo="Cor e padrão" value={cor} onChange={(ev) => setCor(ev.target.value)} maxLength={80} />
        <Campo rotulo="Largura (mm)" inputMode="decimal" value={largura} onChange={(ev) => setLargura(ev.target.value)} erro={erroVisivel(largura, l)} obrigatorio ajuda="Ex.: 22, 35, 45" />
        <Campo rotulo="Espessura (mm)" inputMode="decimal" value={espessura} onChange={(ev) => setEspessura(ev.target.value)} erro={erroVisivel(espessura, e)} obrigatorio ajuda="Ex.: 0,45; 1; 2" />
        <Campo rotulo="Preço por metro (R$)" inputMode="decimal" value={preco} onChange={(ev) => setPreco(ev.target.value)} erro={p.erro} />
        <Campo rotulo="Metros por rolo" inputMode="decimal" value={rolo} onChange={(ev) => setRolo(ev.target.value)} erro={r.erro} ajuda="Opcional; usado para converter a compra em rolos" />
        <Campo rotulo="Fabricante" value={fabricante} onChange={(ev) => setFabricante(ev.target.value)} maxLength={80} />
        <CampoSelecao rotulo="Fornecedor" value={fornecedor} onChange={(ev) => setFornecedor(ev.target.value)}>
          <option value="">Nenhum</option>
          {(fornecedores.data ?? [])
            .filter((f) => f.ativo || f.id === fornecedor)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
        </CampoSelecao>
        <div className="sm:col-span-2 lg:col-span-3">
          <CampoTexto rotulo="Observações" value={observacoes} onChange={(ev) => setObservacoes(ev.target.value)} maxLength={2000} />
        </div>
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
