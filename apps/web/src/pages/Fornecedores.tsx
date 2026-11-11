import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Campo, CampoTexto, Carregando, Cartao, Titulo } from '../components/ui';
import { buscarFornecedores, chaves, podeEditarCatalogo, type Fornecedor } from '../lib/catalogo';
import { mensagemDeErro } from '../lib/erros';
import { supabase } from '../lib/supabase';
import { documentoNormalizado, emailValido, formatarDocumento } from '../lib/validacao';

export function Fornecedores() {
  const { empresa, papel } = useEmpresaAtual();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<Fornecedor | 'novo' | null>(null);
  const [inativos, setInativos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const consulta = useQuery({ queryKey: chaves.fornecedores(empresa.id), queryFn: () => buscarFornecedores(empresa.id) });
  const editar = podeEditarCatalogo(papel);
  const lista = (consulta.data ?? []).filter((f) => inativos || f.ativo);

  async function recarregar() {
    await queryClient.invalidateQueries({ queryKey: chaves.fornecedores(empresa.id) });
    // Materiais e fitas mostram o nome do fornecedor.
    await queryClient.invalidateQueries({ queryKey: chaves.materiais(empresa.id) });
    await queryClient.invalidateQueries({ queryKey: chaves.fitas(empresa.id) });
  }

  async function alternar(f: Fornecedor) {
    setErro(null);
    const { error } = await supabase.from('fornecedores').update({ ativo: !f.ativo }).eq('id', f.id);
    if (error) setErro(mensagemDeErro(error));
    else await recarregar();
  }

  async function excluir(f: Fornecedor) {
    if (!window.confirm(`Excluir ${f.nome}? Materiais e fitas ligados a ele ficam sem fornecedor.`)) return;
    setErro(null);
    const { error } = await supabase.from('fornecedores').delete().eq('id', f.id);
    if (error) setErro(mensagemDeErro(error));
    else await recarregar();
  }

  return (
    <>
      <Titulo subtitulo="De quem a marcenaria compra chapas, fitas e ferragens.">Fornecedores</Titulo>

      {editando && (
        <div className="mb-6">
          <FormularioFornecedor
            key={editando === 'novo' ? 'novo' : editando.id}
            empresaId={empresa.id}
            fornecedor={editando === 'novo' ? null : editando}
            aoFechar={() => setEditando(null)}
            aoSalvar={async () => {
              setEditando(null);
              await recarregar();
            }}
          />
        </div>
      )}

      <Cartao
        acoes={editar && !editando ? <Botao onClick={() => setEditando('novo')}>Novo fornecedor</Botao> : undefined}
        titulo="Cadastro"
        descricao={editar ? undefined : 'Sua função permite apenas consultar.'}
      >
        <label className="mb-4 flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} className="size-4 accent-stone-900" />
          Mostrar inativos
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
          <p className="py-4 text-sm text-stone-500">Nenhum fornecedor cadastrado.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {lista.map((f) => (
              <li key={f.id} className={`flex flex-wrap items-start gap-x-4 gap-y-2 py-3 ${f.ativo ? '' : 'text-stone-400'}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {f.nome}
                    {!f.ativo && <span className="ml-2 text-xs font-normal">(inativo)</span>}
                  </p>
                  <p className="text-sm text-stone-500">
                    {[formatarDocumento(f.documento), f.contato, f.telefone, f.email].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}
                  </p>
                </div>
                <div className="flex gap-1">
                  {editar && (
                    <>
                      <Botao variante="discreto" className="min-h-9 px-3 py-1.5" onClick={() => setEditando(f)}>
                        Editar
                      </Botao>
                      <Botao variante="discreto" className="min-h-9 px-3 py-1.5" onClick={() => void alternar(f)}>
                        {f.ativo ? 'Desativar' : 'Reativar'}
                      </Botao>
                    </>
                  )}
                  {papel === 'dono' && (
                    <Botao variante="discreto" className="min-h-9 px-3 py-1.5 text-red-700" onClick={() => void excluir(f)}>
                      Excluir
                    </Botao>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </>
  );
}

function FormularioFornecedor({
  empresaId,
  fornecedor,
  aoFechar,
  aoSalvar,
}: {
  empresaId: string;
  fornecedor: Fornecedor | null;
  aoFechar: () => void;
  aoSalvar: () => Promise<void>;
}) {
  const [nome, setNome] = useState(fornecedor?.nome ?? '');
  const [documento, setDocumento] = useState(formatarDocumento(fornecedor?.documento ?? null));
  const [contato, setContato] = useState(fornecedor?.contato ?? '');
  const [telefone, setTelefone] = useState(fornecedor?.telefone ?? '');
  const [email, setEmail] = useState(fornecedor?.email ?? '');
  const [observacoes, setObservacoes] = useState(fornecedor?.observacoes ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const erroDocumento = documento.trim() && !documentoNormalizado(documento) ? 'CPF ou CNPJ inválido.' : null;
  const erroEmail = email.trim() && !emailValido(email) ? 'E-mail inválido.' : null;
  const valido = nome.trim().length >= 2 && !erroDocumento && !erroEmail;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setSalvando(true);
    setErro(null);
    const dados = {
      nome: nome.trim(),
      documento: documento.trim() ? documentoNormalizado(documento) : null,
      contato: contato.trim() || null,
      telefone: telefone.trim() || null,
      email: email.trim().toLowerCase() || null,
      observacoes: observacoes.trim() || null,
    };
    const { error } = fornecedor
      ? await supabase.from('fornecedores').update(dados).eq('id', fornecedor.id)
      : await supabase.from('fornecedores').insert({ ...dados, empresa_id: empresaId });
    setSalvando(false);
    if (error) {
      setErro(mensagemDeErro(error, { duplicado: 'Já existe um fornecedor com este nome.' }));
      return;
    }
    await aoSalvar();
  }

  return (
    <Cartao titulo={fornecedor ? `Editar ${fornecedor.nome}` : 'Novo fornecedor'}>
      <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2" noValidate>
        {erro && (
          <div className="sm:col-span-2">
            <Aviso>{erro}</Aviso>
          </div>
        )}
        <div className="sm:col-span-2">
          <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={160} obrigatorio autoFocus />
        </div>
        <Campo rotulo="CPF ou CNPJ" value={documento} onChange={(e) => setDocumento(e.target.value)} erro={erroDocumento} autoCapitalize="characters" />
        <Campo rotulo="Pessoa de contato" value={contato} onChange={(e) => setContato(e.target.value)} maxLength={120} />
        <Campo rotulo="Telefone" type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={30} />
        <Campo rotulo="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} erro={erroEmail} />
        <div className="sm:col-span-2">
          <CampoTexto rotulo="Observações" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={2000} placeholder="Prazo de entrega, condições, vendedor…" />
        </div>
        <div className="flex gap-3 sm:col-span-2">
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
