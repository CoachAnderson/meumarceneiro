import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Aviso, Botao, Campo, Carregando, TelaAcesso } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import { supabase } from '../lib/supabase';
import { VERSAO_TERMOS } from '../lib/legal';
import { caminhoInterno, emailValido } from '../lib/validacao';

const SENHA_MINIMA = 8;

export function Cadastrar() {
  const [params] = useSearchParams();
  const proximo = caminhoInterno(params.get('proximo'));
  const { carregando, sessao } = useAuth();
  const navegar = useNavigate();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [aceito, setAceito] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarEmail, setConfirmarEmail] = useState(false);

  if (carregando) return <Carregando />;
  if (sessao) return <Navigate to={proximo} replace />;

  const erroSenha = senha && senha.length < SENHA_MINIMA ? `Use pelo menos ${SENHA_MINIMA} caracteres.` : null;
  const erroConfirmacao = confirmacao && confirmacao !== senha ? 'As senhas não conferem.' : null;
  const valido =
    nome.trim().length >= 2 && emailValido(email) && senha.length >= SENHA_MINIMA && confirmacao === senha && aceito;

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setErro(null);
    setEnviando(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password: senha,
      options: {
        data: { nome: nome.trim(), termos_versao: VERSAO_TERMOS },
        emailRedirectTo: `${window.location.origin}${proximo}`,
      },
    });
    setEnviando(false);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    // Com confirmação de e-mail ligada, o Supabase não devolve sessão.
    if (!data.session) {
      setConfirmarEmail(true);
      return;
    }
    navegar(proximo, { replace: true });
  }

  if (confirmarEmail) {
    return (
      <TelaAcesso titulo="Confirme seu e-mail" subtitulo={`Enviamos um link para ${email.trim()}.`}>
        <p className="text-sm text-stone-600">
          Abra a mensagem e clique no link para ativar a conta. Depois disso você volta direto para o sistema.
        </p>
      </TelaAcesso>
    );
  }

  const sufixo = proximo !== '/' ? `?proximo=${encodeURIComponent(proximo)}` : '';

  return (
    <TelaAcesso
      titulo="Criar conta"
      subtitulo="Depois você cria a sua marcenaria ou aceita um convite."
      rodape={
        <>
          Já tem conta?{' '}
          <Link to={`/entrar${sufixo}`} className="inline-flex min-h-11 items-center font-medium text-stone-900 underline underline-offset-4 lg:min-h-0">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={aoEnviar} className="space-y-4" noValidate>
        {erro && <Aviso>{erro}</Aviso>}
        <Campo rotulo="Seu nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} obrigatorio />
        <Campo
          rotulo="E-mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          erro={email && !emailValido(email) ? 'E-mail inválido.' : null}
          obrigatorio
        />
        <Campo
          rotulo="Senha"
          type="password"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          erro={erroSenha}
          ajuda={`Mínimo de ${SENHA_MINIMA} caracteres.`}
          obrigatorio
        />
        <Campo
          rotulo="Confirme a senha"
          type="password"
          autoComplete="new-password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          erro={erroConfirmacao}
          obrigatorio
        />
        <label className="flex items-start gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} className="mt-0.5 accent-amber-600" required />
          <span>
            Li e aceito os{' '}
            <a href="/termos" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center font-medium text-stone-900 underline underline-offset-4 lg:min-h-0">
              Termos de Uso
            </a>{' '}
            e a{' '}
            <a href="/privacidade" target="_blank" rel="noopener" className="inline-flex min-h-11 items-center font-medium text-stone-900 underline underline-offset-4 lg:min-h-0">
              Política de Privacidade
            </a>
            .
          </span>
        </label>
        <Botao type="submit" carregando={enviando} disabled={!valido} className="w-full">
          Criar conta
        </Botao>
      </form>
    </TelaAcesso>
  );
}
