import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Aviso, Botao, Campo, Carregando, TelaAcesso } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import { supabase } from '../lib/supabase';
import { caminhoInterno } from '../lib/validacao';

export function Entrar() {
  const [params] = useSearchParams();
  const proximo = caminhoInterno(params.get('proximo'));
  const { carregando, sessao } = useAuth();
  const navegar = useNavigate();

  const [email, setEmail] = useState(params.get('email') ?? '');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (carregando) return <Carregando />;
  if (sessao) return <Navigate to={proximo} replace />;

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    navegar(proximo, { replace: true });
  }

  const sufixo = proximo !== '/' ? `?proximo=${encodeURIComponent(proximo)}` : '';

  return (
    <TelaAcesso
      titulo="Entrar"
      subtitulo="Acesse os projetos e cadastros da sua marcenaria."
      rodape={
        <>
          Ainda não tem conta?{' '}
          <Link to={`/cadastrar${sufixo}`} className="font-medium text-stone-900 underline underline-offset-4">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={aoEnviar} className="space-y-4" noValidate>
        {erro && <Aviso>{erro}</Aviso>}
        <Campo
          rotulo="E-mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          obrigatorio
        />
        <Campo
          rotulo="Senha"
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          obrigatorio
        />
        <div className="flex justify-end">
          <Link to="/recuperar-senha" className="text-sm text-stone-600 underline underline-offset-4 hover:text-stone-900">
            Esqueci a senha
          </Link>
        </div>
        <Botao type="submit" carregando={enviando} className="w-full" disabled={!email || !senha}>
          Entrar
        </Botao>
      </form>
    </TelaAcesso>
  );
}
