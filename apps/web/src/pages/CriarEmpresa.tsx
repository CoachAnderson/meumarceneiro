import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { useEmpresa } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Campo, TelaAcesso } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import { supabase } from '../lib/supabase';
import { cnpjValido } from '../lib/validacao';

export function CriarEmpresa() {
  const { vinculos, trocar, recarregar } = useEmpresa();
  const { sair } = useAuth();
  const navegar = useNavigate();
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const erroCnpj = cnpj.trim() && !cnpjValido(cnpj) ? 'CNPJ inválido. Confira os números.' : null;
  const valido = nome.trim().length >= 2 && !erroCnpj;
  const primeiraEmpresa = vinculos.length === 0;

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setErro(null);
    setEnviando(true);
    const { data, error } = await supabase.rpc('criar_empresa', {
      p_nome: nome.trim(),
      p_cnpj: cnpj.trim() || null,
    });
    if (error) {
      setEnviando(false);
      setErro(mensagemDeErro(error));
      return;
    }
    trocar(data as string);
    await recarregar();
    setEnviando(false);
    navegar('/', { replace: true });
  }

  return (
    <TelaAcesso
      titulo={primeiraEmpresa ? 'Cadastre sua marcenaria' : 'Nova empresa'}
      subtitulo="Você será o dono e poderá convidar sua equipe depois."
      rodape={
        primeiraEmpresa ? (
          <div className="space-y-3">
            <p>Recebeu um convite? Abra o link que o dono da marcenaria enviou para você.</p>
            <button type="button" onClick={() => void sair()} className="font-medium underline underline-offset-4">
              Sair
            </button>
          </div>
        ) : (
          <Link to="/" className="font-medium text-stone-900 underline underline-offset-4">
            Voltar
          </Link>
        )
      }
    >
      <form onSubmit={aoEnviar} className="space-y-4" noValidate>
        {erro && <Aviso>{erro}</Aviso>}
        <Campo
          rotulo="Nome da marcenaria"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={120}
          obrigatorio
        />
        <Campo
          rotulo="CNPJ"
          value={cnpj}
          onChange={(e) => setCnpj(e.target.value)}
          erro={erroCnpj}
          ajuda="Opcional. Aceita o formato numérico e o alfanumérico."
          inputMode="text"
          autoCapitalize="characters"
        />
        <Botao type="submit" carregando={enviando} disabled={!valido} className="w-full">
          Criar empresa
        </Botao>
      </form>
    </TelaAcesso>
  );
}
