import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Aviso, Botao, Campo, TelaAcesso } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import { supabase } from '../lib/supabase';
import { emailValido } from '../lib/validacao';

export function RecuperarSenha() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setEnviando(false);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    setEnviado(true);
  }

  return (
    <TelaAcesso
      titulo="Recuperar senha"
      subtitulo="Enviaremos um link para você criar uma nova senha."
      rodape={
        <Link to="/entrar" className="inline-block py-3 -my-3 font-medium text-stone-900 underline underline-offset-4">
          Voltar para entrar
        </Link>
      }
    >
      {enviado ? (
        <Aviso tipo="sucesso">
          Se existir uma conta com {email.trim()}, o link já está a caminho. Confira também a caixa de spam.
        </Aviso>
      ) : (
        <form onSubmit={aoEnviar} className="space-y-4" noValidate>
          {erro && <Aviso>{erro}</Aviso>}
          <Campo
            rotulo="E-mail da conta"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            obrigatorio
          />
          <Botao type="submit" carregando={enviando} disabled={!emailValido(email)} className="w-full">
            Enviar link
          </Botao>
        </form>
      )}
    </TelaAcesso>
  );
}
