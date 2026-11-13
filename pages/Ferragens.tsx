import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dmm, formatarMm, lerMm } from '@marcenaria/core';
import { centavosParaTexto, formatarMoeda, lerPrecoCentavos } from '@marcenaria/catalog';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Campo, CampoSelecao, Carregando, Cartao, Titulo } from '../components/ui';
import { Selo } from '../components/catalogo';
import {
  NOME_TIPO_FERRAGEM,
  buscarFerragens,
  buscarSaldos,
  definirEstoqueFerragem,
  podeAjustarEstoque,
  buscarFornecedores,
  chaveFerragens,
  chaves,
  podeEditarCatalogo,
  type Ferragem,
  type TipoFerragem,
} from '../lib/catalogo';
import { mensagemDeErro } from '../lib/erros';
import { lerCampo } from '../lib/formulario';
import { supabase } from '../lib/supabase';

export function Ferragens() {
  const { empresa, papel } = useEmpresaAtual();
  const queryClient = useQueryClient();
  const consulta = useQuery({ queryKey: chaveFerragens(empresa.id), queryFn: () => buscarFerragens(empresa.id) });
  const [editando, setEditando] = useState<Ferragem | 'nova' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [inativas, setInativas] = useState(false);
  const editar = podeEditarCatalogo(papel);
  const lista = (consulta.data ?? []).filter((f) => inativas || f.ativo);

  const saldos = useQuery({ queryKey: chaves.saldos(empresa.id), queryFn: () => buscarSaldos(empresa.id) });
  const recarregar = () => queryClient.invalidateQueries({ queryKey: chaveFerragens(empresa.id) });

  async function ajustarEstoque(f: Ferragem) {
    const atual = saldos.data?.ferragens.get(f.id);
    const texto = window.prompt(`Quantidade em estoque de ${f.nome}:`, atual === undefined ? '' : String(atual));
    if (texto === null) return;
    if (!/^\d{1,7}$/.test(texto.trim())) {
      setErro('Estoque: informe um número inteiro, sem sinal.');
      return;
    }
    setErro(null);
    try {
      await definirEstoqueFerragem(f.id, Number(texto), 'Contagem');
      await queryClient.invalidateQueries({ queryKey: chaves.saldos(empresa.id) });
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  async function excluir(f: Ferragem) {
    if (!window.confirm(`Excluir ${f.nome}?`)) return;
    setErro(null);
    const { error } = await supabase.from('ferragens').delete().eq('id', f.id);
    if (error) setErro(mensagemDeErro(error));
    else await recarregar();
  }

  return (
    <>
      <Titulo subtitulo="Dobradiças, corrediças, puxadores e suportes. O projeto liga cada ferragem que precisa ao item cadastrado aqui.">Ferragens</Titulo>
      {editando && (
        <div className="mb-6">
          <FormularioFerragem
            key={editando === 'nova' ? 'nova' : editando.id}
            ferragem={editando === 'nova' ? null : editando}
            aoFechar={() => setEditando(null)}
            aoSalvar={async () => {
              setEditando(null);
              await recarregar();
            }}
          />
        </div>
      )}
      <Cartao titulo="Catálogo" acoes={editar && !editando ? <Botao onClick={() => setEditando('nova')}>Nova ferragem</Botao> : undefined} descricao={editar ? undefined : 'Sua função permite apenas consultar.'}>
        <label className="mb-4 flex items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" checked={inativas} onChange={(e) => setInativas(e.target.checked)} className="accent-amber-600" />
          Mostrar inativas
        </label>
        {erro && (
          <div className="mb-4">
            <Aviso>{erro}</Aviso>
          </div>
        )}
        {consulta.isPending ? (
          <Carregando />
        ) : consulta.error ? (
          <Aviso>{mensagemDeErro(consulta.error)}</Aviso>
        ) : lista.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-500">Nenhuma ferragem cadastrada.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="cartoes-tablet min-w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-stone-500">
                  <th className="px-5 py-2 font-medium sm:px-6">Tipo</th>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">Medida</th>
                  <th className="px-3 py-2 text-right font-medium">Preço</th>
                  <th className="px-3 py-2 text-right font-medium">Estoque</th>
                  <th className="px-5 py-2 sm:px-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {lista.map((f) => (
                  <tr key={f.id} className={f.ativo ? '' : 'text-stone-400'}>
                    <td className="px-5 py-2 whitespace-nowrap sm:px-6">{NOME_TIPO_FERRAGEM[f.tipo]}</td>
                    <td className="px-3 py-2">
                      {f.nome}
                      {f.fabricante && <span className="text-stone-500"> · {f.fabricante}</span>}
                      {!f.ativo && <Selo tom="inativo">inativa</Selo>}
                    </td>
                    <td className="tabular px-3 py-2 whitespace-nowrap">{f.comprimento_dmm ? `${formatarMm(dmm(f.comprimento_dmm))} mm` : '–'}</td>
                    <td className="tabular px-3 py-2 text-right whitespace-nowrap">
                      {f.preco_centavos === null ? <Selo tom="aviso">sem preço</Selo> : formatarMoeda(f.preco_centavos)}
                      {f.tipo === 'corredica' && f.preco_centavos !== null && <span className="text-stone-500"> /par</span>}
                    </td>
                    <td className="tabular px-3 py-2 text-right whitespace-nowrap">
                      {saldos.data?.ferragens.get(f.id) ?? <span className="text-stone-400">sem registro</span>}
                      {podeAjustarEstoque(papel) && (
                        <Botao variante="discreto" className="ml-1 min-h-0 px-2 py-1" onClick={() => ajustarEstoque(f)}>
                          Ajustar
                        </Botao>
                      )}
                    </td>
                    <td className="px-5 py-2 text-right whitespace-nowrap sm:px-6">
                      {editar && (
                        <>
                          <Botao variante="discreto" className="min-h-0 px-2 py-1" onClick={() => setEditando(f)}>
                            Editar
                          </Botao>
                          {papel === 'dono' && (
                            <Botao variante="discreto" className="min-h-0 px-2 py-1" onClick={() => excluir(f)}>
                              Excluir
                            </Botao>
                          )}
                        </>
                      )}
                    </td>
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

function FormularioFerragem({ ferragem, aoFechar, aoSalvar }: { ferragem: Ferragem | null; aoFechar: () => void; aoSalvar: () => Promise<void> }) {
  const { empresa } = useEmpresaAtual();
  const fornecedores = useQuery({ queryKey: chaves.fornecedores(empresa.id), queryFn: () => buscarFornecedores(empresa.id) });
  const [tipo, setTipo] = useState<TipoFerragem>(ferragem?.tipo ?? 'dobradica_reta');
  const [nome, setNome] = useState(ferragem?.nome ?? '');
  const [fabricante, setFabricante] = useState(ferragem?.fabricante ?? '');
  const [comprimento, setComprimento] = useState(ferragem?.comprimento_dmm ? formatarMm(dmm(ferragem.comprimento_dmm)) : '');
  const [preco, setPreco] = useState(centavosParaTexto(ferragem?.preco_centavos));
  const [fornecedor, setFornecedor] = useState(ferragem?.fornecedor_id ?? '');
  const [ativo, setAtivo] = useState(ferragem?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const c = tipo === 'corredica' ? lerCampo(comprimento, lerMm, { obrigatorio: true, nome: 'Comprimento' }) : { valor: undefined, erro: null };
  const p = lerCampo(preco, (t) => lerPrecoCentavos(t));
  const valido = nome.trim().length >= 2 && !c.erro && !p.erro && (tipo !== 'corredica' || c.valor !== undefined);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setSalvando(true);
    setErro(null);
    const dados = {
      tipo,
      nome: nome.trim(),
      fabricante: fabricante.trim() || null,
      comprimento_dmm: tipo === 'corredica' ? c.valor : null,
      preco_centavos: p.valor ?? null,
      fornecedor_id: fornecedor || null,
      ativo,
    };
    const { error } = ferragem ? await supabase.from('ferragens').update(dados).eq('id', ferragem.id) : await supabase.from('ferragens').insert({ ...dados, empresa_id: empresa.id });
    setSalvando(false);
    if (error) setErro(mensagemDeErro(error, { duplicado: 'Já existe uma ferragem com esse nome, tipo e medida.' }));
    else await aoSalvar();
  }

  return (
    <Cartao titulo={ferragem ? 'Editar ferragem' : 'Nova ferragem'}>
      <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2">
        <CampoSelecao rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoFerragem)}>
          {(Object.keys(NOME_TIPO_FERRAGEM) as TipoFerragem[]).map((t) => (
            <option key={t} value={t}>
              {NOME_TIPO_FERRAGEM[t]}
            </option>
          ))}
        </CampoSelecao>
        <Campo rotulo="Nome" obrigatorio value={nome} maxLength={160} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Dobradiça reta 35 mm com amortecedor" />
        <Campo rotulo="Fabricante" value={fabricante} maxLength={80} onChange={(e) => setFabricante(e.target.value)} />
        {tipo === 'corredica' && (
          <Campo rotulo="Comprimento (mm)" obrigatorio inputMode="decimal" value={comprimento} onChange={(e) => setComprimento(e.target.value)} erro={c.erro} ajuda="O projeto escolhe a corrediça pelo comprimento." />
        )}
        <Campo rotulo={tipo === 'corredica' ? 'Preço do par (R$)' : 'Preço da unidade (R$)'} inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} erro={p.erro} />
        <CampoSelecao rotulo="Fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
          <option value="">Nenhum</option>
          {(fornecedores.data ?? [])
            .filter((f) => f.ativo || f.id === fornecedor)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
        </CampoSelecao>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="accent-amber-600" />
          Ativa
        </label>
        {erro && (
          <div className="sm:col-span-2">
            <Aviso>{erro}</Aviso>
          </div>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Botao type="button" variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" carregando={salvando} disabled={!valido}>
            Salvar
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}
