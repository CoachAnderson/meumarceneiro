import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Aviso, Botao, Campo, TelaAcesso } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import { supabase } from '../lib/supabase';

const SENHA_MINIMA = 8;

/** Aberta pelo link do e-mail de recuperação (a sessão vem no próprio link). */
export function RedefinirSenha() {
  const { concluirRecuperacao } = useAuth();
  const navegar = useNavigate();
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const valido = senha.length >= SENHA_MINIMA && senha === confirmacao;

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setEnviando(false);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    concluirRecuperacao();
    navegar('/', { replace: true });
  }

  return (
    <TelaAcesso titulo="Nova senha" subtitulo="Escolha a senha que vai usar daqui para frente.">
      <form onSubmit={aoEnviar} className="space-y-4" noValidate>
        {erro && <Aviso>{erro}</Aviso>}
        <Campo
          rotulo="Nova senha"
          type="password"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          erro={senha && senha.length < SENHA_MINIMA ? `Use pelo menos ${SENHA_MINIMA} caracteres.` : null}
          obrigatorio
        />
        <Campo
          rotulo="Confirme a nova senha"
          type="password"
          autoComplete="new-password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          erro={confirmacao && confirmacao !== senha ? 'As senhas não conferem.' : null}
          obrigatorio
        />
        <Botao type="submit" carregando={enviando} disabled={!valido} className="w-full">
          Salvar nova senha
        </Botao>
      </form>
    </TelaAcesso>
  );
}
