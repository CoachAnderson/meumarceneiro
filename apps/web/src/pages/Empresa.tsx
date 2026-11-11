import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { useEmpresa, useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Campo, CampoSelecao, Carregando, Cartao, Titulo } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import { supabase } from '../lib/supabase';
import { DESCRICAO_PAPEL, NOME_PAPEL, PAPEIS, type Convite, type Membro, type Papel } from '../lib/tipos';
import { cnpjValido, emailValido, formatarData, formatarDocumento, normalizarDocumento } from '../lib/validacao';

export function Empresa() {
  const { papel } = useEmpresaAtual();
  return (
    <>
      <Titulo subtitulo="Dados da marcenaria, pessoas com acesso e convites.">Empresa e equipe</Titulo>
      <div className="space-y-6">
        <DadosEmpresa />
        <Membros />
        {papel === 'dono' && <Convites />}
      </div>
    </>
  );
}

function DadosEmpresa() {
  const { empresa, papel } = useEmpresaAtual();
  const { recarregar } = useEmpresa();
  const [nome, setNome] = useState(empresa.nome);
  const [cnpj, setCnpj] = useState(formatarDocumento(empresa.cnpj));
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'erro' | 'sucesso'; texto: string } | null>(null);

  useEffect(() => {
    setNome(empresa.nome);
    setCnpj(formatarDocumento(empresa.cnpj));
    setMensagem(null);
  }, [empresa.id, empresa.nome, empresa.cnpj]);

  if (papel !== 'dono') {
    return (
      <Cartao titulo="Dados da empresa">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-stone-500">Nome</dt>
            <dd className="font-medium">{empresa.nome}</dd>
          </div>
          <div>
            <dt className="text-stone-500">CNPJ</dt>
            <dd className="font-medium">{formatarDocumento(empresa.cnpj) || 'Não informado'}</dd>
          </div>
        </dl>
      </Cartao>
    );
  }

  const erroCnpj = cnpj.trim() && !cnpjValido(cnpj) ? 'CNPJ inválido. Confira os números.' : null;
  const mudou = nome.trim() !== empresa.nome || (normalizarDocumento(cnpj) || null) !== empresa.cnpj;
  const valido = nome.trim().length >= 2 && !erroCnpj;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!valido || !mudou) return;
    setSalvando(true);
    setMensagem(null);
    const { error } = await supabase
      .from('empresas')
      .update({ nome: nome.trim(), cnpj: normalizarDocumento(cnpj) || null })
      .eq('id', empresa.id);
    if (error) {
      setSalvando(false);
      setMensagem({ tipo: 'erro', texto: mensagemDeErro(error) });
      return;
    }
    await recarregar();
    setSalvando(false);
    setMensagem({ tipo: 'sucesso', texto: 'Dados salvos.' });
  }

  return (
    <Cartao titulo="Dados da empresa">
      <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2" noValidate>
        {mensagem && (
          <div className="sm:col-span-2">
            <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>
          </div>
        )}
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} obrigatorio />
        <Campo
          rotulo="CNPJ"
          value={cnpj}
          onChange={(e) => setCnpj(e.target.value)}
          erro={erroCnpj}
          autoCapitalize="characters"
        />
        <div className="sm:col-span-2">
          <Botao type="submit" carregando={salvando} disabled={!valido || !mudou}>
            Salvar
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}

function Membros() {
  const { empresa, papel } = useEmpresaAtual();
  const { usuario } = useAuth();
  const { recarregar } = useEmpresa();
  const queryClient = useQueryClient();
  const navegar = useNavigate();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const chave = ['membros', empresa.id];
  const consulta = useQuery({
    queryKey: chave,
    queryFn: async (): Promise<Membro[]> => {
      const { data, error } = await supabase
        .from('membros_empresa')
        .select('usuario_id, papel, created_at, usuario:usuarios(nome, email)')
        .eq('empresa_id', empresa.id)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as Membro[];
    },
  });

  async function mudarPapel(usuarioId: string, novo: Papel) {
    setErro(null);
    setOcupado(usuarioId);
    const { error } = await supabase
      .from('membros_empresa')
      .update({ papel: novo })
      .eq('empresa_id', empresa.id)
      .eq('usuario_id', usuarioId);
    setOcupado(null);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: chave });
    if (usuarioId === usuario?.id) await recarregar();
  }

  async function remover(membro: Membro) {
    const proprio = membro.usuario_id === usuario?.id;
    const pergunta = proprio
      ? `Sair de ${empresa.nome}? Você perde o acesso aos dados desta empresa.`
      : `Remover ${membro.usuario?.nome || membro.usuario?.email} da equipe?`;
    if (!window.confirm(pergunta)) return;

    setErro(null);
    setOcupado(membro.usuario_id);
    const { error } = await supabase
      .from('membros_empresa')
      .delete()
      .eq('empresa_id', empresa.id)
      .eq('usuario_id', membro.usuario_id);
    setOcupado(null);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    if (proprio) {
      await recarregar();
      navegar('/', { replace: true });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: chave });
  }

  return (
    <Cartao titulo="Equipe" descricao="Cada pessoa vê só os dados desta empresa, conforme a função.">
      {erro && (
        <div className="mb-4">
          <Aviso>{erro}</Aviso>
        </div>
      )}
      {consulta.isPending ? (
        <Carregando />
      ) : consulta.error ? (
        <Aviso>{mensagemDeErro(consulta.error)}</Aviso>
      ) : (
        <ul className="divide-y divide-stone-100">
          {consulta.data.map((m) => {
            const proprio = m.usuario_id === usuario?.id;
            return (
              <li key={m.usuario_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {m.usuario?.nome || 'Sem nome'}
                    {proprio && <span className="ml-2 text-xs font-normal text-stone-500">(você)</span>}
                  </p>
                  <p className="truncate text-sm text-stone-500">{m.usuario?.email}</p>
                </div>
                {papel === 'dono' ? (
                  <label className="text-sm">
                    <span className="sr-only">Função de {m.usuario?.nome || m.usuario?.email}</span>
                    <select
                      value={m.papel}
                      disabled={ocupado === m.usuario_id}
                      onChange={(e) => void mudarPapel(m.usuario_id, e.target.value as Papel)}
                      className="rounded-lg border-0 bg-white py-1.5 pr-8 pl-3 text-sm ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-amber-500"
                    >
                      {PAPEIS.map((p) => (
                        <option key={p} value={p}>
                          {NOME_PAPEL[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
                    {NOME_PAPEL[m.papel]}
                  </span>
                )}
                {(proprio || papel === 'dono') && (
                  <Botao
                    variante={proprio ? 'discreto' : 'perigo'}
                    carregando={ocupado === m.usuario_id}
                    onClick={() => void remover(m)}
                    className="min-h-9 px-3 py-1.5"
                  >
                    {proprio ? 'Sair da empresa' : 'Remover'}
                  </Botao>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Cartao>
  );
}

function linkDoConvite(token: string): string {
  return `${window.location.origin}/convite/${token}`;
}

function Convites() {
  const { empresa } = useEmpresaAtual();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [papelNovo, setPapelNovo] = useState<Papel>('projetista');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const chave = ['convites', empresa.id];
  const consulta = useQuery({
    queryKey: chave,
    queryFn: async (): Promise<Convite[]> => {
      const { data, error } = await supabase
        .from('convites')
        .select('id, email, papel, token, expira_em, created_at')
        .eq('empresa_id', empresa.id)
        .is('aceito_em', null)
        .is('revogado_em', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Convite[];
    },
  });

  async function convidar(e: FormEvent) {
    e.preventDefault();
    if (!emailValido(email)) return;
    setErro(null);
    setEnviando(true);
    const { error } = await supabase
      .from('convites')
      .insert({ empresa_id: empresa.id, email: email.trim().toLowerCase(), papel: papelNovo });
    setEnviando(false);
    if (error) {
      setErro(mensagemDeErro(error, { duplicado: 'Já existe um convite pendente para este e-mail.' }));
      return;
    }
    setEmail('');
    await queryClient.invalidateQueries({ queryKey: chave });
  }

  async function revogar(convite: Convite) {
    if (!window.confirm(`Cancelar o convite para ${convite.email}? O link deixa de funcionar.`)) return;
    setErro(null);
    const { error } = await supabase.from('convites').update({ revogado_em: new Date().toISOString() }).eq('id', convite.id);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: chave });
  }

  async function copiar(convite: Convite) {
    try {
      await navigator.clipboard.writeText(linkDoConvite(convite.token));
      setCopiado(convite.id);
      window.setTimeout(() => setCopiado((atual) => (atual === convite.id ? null : atual)), 2000);
    } catch {
      setErro('Não foi possível copiar automaticamente. Selecione o link e copie manualmente.');
    }
  }

  const agora = Date.now();

  return (
    <Cartao
      titulo="Convites"
      descricao="Gere um link e envie para a pessoa. Ela entra ou cria conta com o mesmo e-mail e aceita."
    >
      <form onSubmit={convidar} className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end" noValidate>
        <Campo
          rotulo="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          erro={email && !emailValido(email) ? 'E-mail inválido.' : null}
        />
        <CampoSelecao
          rotulo="Função"
          value={papelNovo}
          onChange={(e) => setPapelNovo(e.target.value as Papel)}
        >
          {PAPEIS.map((p) => (
            <option key={p} value={p}>
              {NOME_PAPEL[p]}
            </option>
          ))}
        </CampoSelecao>
        <Botao type="submit" carregando={enviando} disabled={!emailValido(email)}>
          Gerar convite
        </Botao>
      </form>
      <p className="mt-2 text-sm text-stone-500">{DESCRICAO_PAPEL[papelNovo]}.</p>

      {erro && (
        <div className="mt-4">
          <Aviso>{erro}</Aviso>
        </div>
      )}

      <div className="mt-6">
        {consulta.isPending ? (
          <Carregando />
        ) : consulta.error ? (
          <Aviso>{mensagemDeErro(consulta.error)}</Aviso>
        ) : consulta.data.length === 0 ? (
          <p className="text-sm text-stone-500">Nenhum convite pendente.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {consulta.data.map((c) => {
              const expirado = new Date(c.expira_em).getTime() < agora;
              const link = linkDoConvite(c.token);
              const mensagemWhats = `Você foi convidado para ${empresa.nome}. Aceite aqui: ${link}`;
              return (
                <li key={c.id} className="space-y-2 py-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium break-all">{c.email}</span>
                    <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700">
                      {NOME_PAPEL[c.papel]}
                    </span>
                    <span className={`text-sm ${expirado ? 'text-red-700' : 'text-stone-500'}`}>
                      {expirado ? `Expirou em ${formatarData(c.expira_em)}` : `Válido até ${formatarData(c.expira_em)}`}
                    </span>
                  </div>
                  {!expirado && (
                    <input
                      readOnly
                      value={link}
                      onFocus={(e) => e.currentTarget.select()}
                      aria-label={`Link do convite para ${c.email}`}
                      className="w-full rounded-lg border-0 bg-stone-50 px-3 py-2 font-mono text-xs text-stone-700 ring-1 ring-inset ring-stone-200"
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    {!expirado && (
                      <>
                        <Botao variante="secundario" className="min-h-9 px-3 py-1.5" onClick={() => void copiar(c)}>
                          {copiado === c.id ? 'Link copiado' : 'Copiar link'}
                        </Botao>
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(mensagemWhats)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-9 items-center rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-stone-800 ring-1 ring-inset ring-stone-300 hover:bg-stone-100"
                        >
                          Enviar pelo WhatsApp
                        </a>
                      </>
                    )}
                    <Botao variante="perigo" className="min-h-9 px-3 py-1.5" onClick={() => void revogar(c)}>
                      {expirado ? 'Remover' : 'Cancelar convite'}
                    </Botao>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Cartao>
  );
}
