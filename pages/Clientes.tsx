import { useDeferredValue, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Campo, CampoTexto, Carregando, Cartao, Titulo } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import { supabase } from '../lib/supabase';
import { podeEditarCadastros, type Cliente } from '../lib/tipos';
import { documentoNormalizado, emailValido, formatarDocumento } from '../lib/validacao';

const COLUNAS = 'id, nome, documento, email, telefone, endereco, cep, logradouro, numero, complemento, bairro, cidade, uf, codigo_municipio, inscricao_estadual, observacoes, created_at, updated_at';

/** Escapa curingas do ILIKE para buscar o texto literal. */
const escaparBusca = (texto: string) => texto.replace(/[\\%_]/g, (c) => `\\${c}`);

export function Clientes() {
  const { empresa, papel } = useEmpresaAtual();
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const buscaAdiada = useDeferredValue(busca.trim());
  const [editando, setEditando] = useState<Cliente | 'novo' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const podeEditar = podeEditarCadastros(papel);
  const podeExcluir = papel === 'dono';

  const consulta = useQuery({
    queryKey: ['clientes', empresa.id, buscaAdiada],
    queryFn: async (): Promise<Cliente[]> => {
      let q = supabase.from('clientes').select(COLUNAS).eq('empresa_id', empresa.id).order('nome').limit(500);
      if (buscaAdiada) q = q.ilike('nome', `%${escaparBusca(buscaAdiada)}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Cliente[];
    },
  });

  async function aposSalvar() {
    setEditando(null);
    await queryClient.invalidateQueries({ queryKey: ['clientes', empresa.id] });
    await queryClient.invalidateQueries({ queryKey: ['painel', empresa.id] });
  }

  async function excluir(cliente: Cliente) {
    if (!window.confirm(`Excluir o cliente ${cliente.nome}? Esta ação não pode ser desfeita.`)) return;
    setErro(null);
    const { error } = await supabase.from('clientes').delete().eq('id', cliente.id);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    await aposSalvar();
  }

  return (
    <>
      <Titulo subtitulo={`Clientes de ${empresa.nome}.`}>Clientes</Titulo>

      {editando && (
        <div className="mb-6">
          <FormularioCliente
            key={editando === 'novo' ? 'novo' : editando.id}
            empresaId={empresa.id}
            cliente={editando === 'novo' ? null : editando}
            aoCancelar={() => setEditando(null)}
            aoSalvar={aposSalvar}
          />
        </div>
      )}

      <Cartao
        acoes={
          podeEditar && !editando ? (
            <Botao onClick={() => setEditando('novo')}>Novo cliente</Botao>
          ) : undefined
        }
        titulo="Cadastro"
        descricao={podeEditar ? undefined : 'Sua função permite apenas consultar.'}
      >
        <div className="mb-4 max-w-sm">
          <Campo
            rotulo="Buscar por nome"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Digite parte do nome"
          />
        </div>

        {erro && (
          <div className="mb-4">
            <Aviso>{erro}</Aviso>
          </div>
        )}

        {consulta.isPending ? (
          <Carregando />
        ) : consulta.error ? (
          <Aviso>{mensagemDeErro(consulta.error)}</Aviso>
        ) : consulta.data.length === 0 ? (
          <p className="py-6 text-sm text-stone-500">
            {buscaAdiada ? 'Nenhum cliente encontrado com esse nome.' : 'Nenhum cliente cadastrado ainda.'}
          </p>
        ) : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="cartoes-celular min-w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-stone-500">
                  <th className="px-5 py-2 font-medium sm:px-6">Nome</th>
                  <th className="px-3 py-2 font-medium">CPF/CNPJ</th>
                  <th className="px-3 py-2 font-medium">Telefone</th>
                  <th className="px-3 py-2 font-medium">E-mail</th>
                  {(podeEditar || podeExcluir) && <th className="px-5 py-2 sm:px-6"><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {consulta.data.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="px-5 py-3 font-medium sm:px-6">{c.nome}</td>
                    <td className="tabular px-3 py-3 whitespace-nowrap text-stone-700">{formatarDocumento(c.documento)}</td>
                    <td className="tabular px-3 py-3 whitespace-nowrap text-stone-700">{c.telefone}</td>
                    <td className="px-3 py-3 break-all text-stone-700">{c.email}</td>
                    {(podeEditar || podeExcluir) && (
                      <td className="px-5 py-2 text-right whitespace-nowrap sm:px-6">
                        {podeEditar && (
                          <Botao variante="discreto" className="min-h-9 px-3 py-1.5" onClick={() => setEditando(c)}>
                            Editar
                          </Botao>
                        )}
                        {podeExcluir && (
                          <Botao variante="discreto" className="min-h-9 px-3 py-1.5 text-red-700" onClick={() => void excluir(c)}>
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

function FormularioCliente({
  empresaId,
  cliente,
  aoCancelar,
  aoSalvar,
}: {
  empresaId: string;
  cliente: Cliente | null;
  aoCancelar: () => void;
  aoSalvar: () => Promise<void>;
}) {
  const [nome, setNome] = useState(cliente?.nome ?? '');
  const [documento, setDocumento] = useState(formatarDocumento(cliente?.documento ?? null));
  const [email, setEmail] = useState(cliente?.email ?? '');
  const [telefone, setTelefone] = useState(cliente?.telefone ?? '');
  const [endereco, setEndereco] = useState(cliente?.endereco ?? '');
  const [observacoes, setObservacoes] = useState(cliente?.observacoes ?? '');
  // Endereço em partes: o boleto e a nota fiscal pedem.
  const [partes, setPartes] = useState({
    cep: cliente?.cep ?? '',
    logradouro: cliente?.logradouro ?? '',
    numero: cliente?.numero ?? '',
    complemento: cliente?.complemento ?? '',
    bairro: cliente?.bairro ?? '',
    cidade: cliente?.cidade ?? '',
    uf: cliente?.uf ?? '',
    codigo_municipio: cliente?.codigo_municipio ?? '',
    inscricao_estadual: cliente?.inscricao_estadual ?? '',
  });
  const parte = (k: keyof typeof partes) => (e: { target: { value: string } }) => setPartes((p) => ({ ...p, [k]: e.target.value }));
  const cep = partes.cep.replace(/\D/g, '');
  const erroCep = partes.cep.trim() && cep.length !== 8 ? 'CEP com 8 números.' : null;
  const uf = partes.uf.trim().toUpperCase();
  const erroUf = uf && !/^[A-Z]{2}$/.test(uf) ? 'Duas letras (SP).' : null;
  const ibge = partes.codigo_municipio.replace(/\D/g, '');
  const erroIbge = partes.codigo_municipio.trim() && ibge.length !== 7 ? '7 números.' : null;
  const ie = partes.inscricao_estadual.trim().toUpperCase() === 'ISENTO' ? 'ISENTO' : partes.inscricao_estadual.replace(/\D/g, '');
  const erroIe = partes.inscricao_estadual.trim() && ie !== 'ISENTO' && (ie.length < 2 || ie.length > 14) ? 'Só números, ou ISENTO.' : null;
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const erroDocumento = documento.trim() && !documentoNormalizado(documento) ? 'CPF ou CNPJ inválido.' : null;
  const erroEmail = email.trim() && !emailValido(email) ? 'E-mail inválido.' : null;
  const valido = nome.trim().length >= 2 && !erroDocumento && !erroEmail && !erroCep && !erroUf && !erroIbge && !erroIe;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setErro(null);
    setSalvando(true);

    const dados = {
      nome: nome.trim(),
      documento: documento.trim() ? documentoNormalizado(documento) : null,
      email: email.trim().toLowerCase() || null,
      telefone: telefone.trim() || null,
      endereco: endereco.trim() || null,
      cep: cep || null,
      logradouro: partes.logradouro.trim() || null,
      numero: partes.numero.trim() || null,
      complemento: partes.complemento.trim() || null,
      bairro: partes.bairro.trim() || null,
      cidade: partes.cidade.trim() || null,
      uf: uf || null,
      codigo_municipio: ibge || null,
      inscricao_estadual: ie || null,
      observacoes: observacoes.trim() || null,
    };

    const { error } = cliente
      ? await supabase.from('clientes').update(dados).eq('id', cliente.id)
      : await supabase.from('clientes').insert({ ...dados, empresa_id: empresaId });

    setSalvando(false);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    await aoSalvar();
  }

  return (
    <Cartao titulo={cliente ? `Editar ${cliente.nome}` : 'Novo cliente'}>
      <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2" noValidate>
        {erro && (
          <div className="sm:col-span-2">
            <Aviso>{erro}</Aviso>
          </div>
        )}
        <div className="sm:col-span-2">
          <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={160} obrigatorio autoFocus />
        </div>
        <Campo
          rotulo="CPF ou CNPJ"
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          erro={erroDocumento}
          autoCapitalize="characters"
        />
        <Campo rotulo="Telefone" type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={30} />
        <div className="sm:col-span-2">
          <Campo rotulo="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} erro={erroEmail} />
        </div>
        <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-6">
          <legend className="mb-1 text-sm font-semibold text-stone-900">Endereço</legend>
          <p className="-mt-1 text-xs text-stone-500 sm:col-span-6">O boleto e a nota fiscal pedem o endereço completo.</p>
          <div className="sm:col-span-2">
            <Campo rotulo="CEP" inputMode="numeric" value={partes.cep} onChange={parte('cep')} erro={erroCep} maxLength={9} />
          </div>
          <div className="sm:col-span-4">
            <Campo rotulo="Rua" value={partes.logradouro} onChange={parte('logradouro')} maxLength={120} />
          </div>
          <div className="sm:col-span-2">
            <Campo rotulo="Número" value={partes.numero} onChange={parte('numero')} maxLength={20} />
          </div>
          <div className="sm:col-span-4">
            <Campo rotulo="Complemento" value={partes.complemento} onChange={parte('complemento')} maxLength={60} />
          </div>
          <div className="sm:col-span-3">
            <Campo rotulo="Bairro" value={partes.bairro} onChange={parte('bairro')} maxLength={60} />
          </div>
          <div className="sm:col-span-2">
            <Campo rotulo="Cidade" value={partes.cidade} onChange={parte('cidade')} maxLength={60} />
          </div>
          <div className="sm:col-span-1">
            <Campo rotulo="UF" value={partes.uf} onChange={parte('uf')} erro={erroUf} maxLength={2} autoCapitalize="characters" />
          </div>
          <div className="sm:col-span-3">
            <Campo rotulo="Código IBGE da cidade" inputMode="numeric" value={partes.codigo_municipio} onChange={parte('codigo_municipio')} erro={erroIbge} maxLength={7} ajuda="Só para NFS-e. 7 números." />
          </div>
          <div className="sm:col-span-3">
            <Campo rotulo="Inscrição estadual" value={partes.inscricao_estadual} onChange={parte('inscricao_estadual')} erro={erroIe} maxLength={20} ajuda="Só empresa. Números, ou ISENTO." />
          </div>
          <div className="sm:col-span-6">
            <Campo rotulo="Endereço (texto livre, antigo)" value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={300} ajuda="Se já estava preenchido, passe para os campos acima." />
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <CampoTexto
            rotulo="Observações"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            maxLength={2000}
          />
        </div>
        <div className="flex gap-3 sm:col-span-2">
          <Botao type="submit" carregando={salvando} disabled={!valido}>
            Salvar
          </Botao>
          <Botao type="button" variante="secundario" onClick={aoCancelar}>
            Cancelar
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}
