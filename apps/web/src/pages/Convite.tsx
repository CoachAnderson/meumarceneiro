import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { useEmpresa } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Carregando, TelaAcesso } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import { supabase } from '../lib/supabase';
import { DESCRICAO_PAPEL, NOME_PAPEL, type ConvitePublico } from '../lib/tipos';
import { formatarData } from '../lib/validacao';

const MOTIVO_INVALIDO: Record<Exclude<ConvitePublico['estado'], 'pendente'>, string> = {
  aceito: 'Este convite já foi usado.',
  revogado: 'Este convite foi cancelado pelo dono da marcenaria.',
  expirado: 'Este convite expirou. Peça um novo ao dono da marcenaria.',
};

export function Convite() {
  const { token = '' } = useParams();
  const { carregando: carregandoAuth, usuario, sair } = useAuth();
  const { trocar, recarregar } = useEmpresa();
  const navegar = useNavigate();
  const [aceitando, setAceitando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: ['convite-publico', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ver_convite', { p_token: token });
      if (error) throw error;
      return (data ?? null) as ConvitePublico | null;
    },
  });

  if (carregandoAuth || consulta.isPending) return <Carregando />;

  if (consulta.error) {
    return (
      <TelaAcesso titulo="Convite">
        <Aviso>{mensagemDeErro(consulta.error)}</Aviso>
      </TelaAcesso>
    );
  }

  const convite = consulta.data;
  if (!convite) {
    return (
      <TelaAcesso titulo="Convite não encontrado">
        <p className="text-sm text-stone-600">Confira se o link foi copiado inteiro.</p>
      </TelaAcesso>
    );
  }

  if (convite.estado !== 'pendente') {
    return (
      <TelaAcesso titulo={convite.empresa_nome}>
        <Aviso tipo="info">{MOTIVO_INVALIDO[convite.estado]}</Aviso>
      </TelaAcesso>
    );
  }

  const destino = `/convite/${token}`;
  const emailUsuario = usuario?.email?.toLowerCase() ?? null;
  const outroEmail = emailUsuario !== null && emailUsuario !== convite.email;

  async function aceitar() {
    setErro(null);
    setAceitando(true);
    const { data, error } = await supabase.rpc('aceitar_convite', { p_token: token });
    if (error) {
      setAceitando(false);
      setErro(mensagemDeErro(error));
      return;
    }
    trocar(data as string);
    await recarregar();
    setAceitando(false);
    navegar('/', { replace: true });
  }

  return (
    <TelaAcesso titulo={`Convite para ${convite.empresa_nome}`} subtitulo={`Válido até ${formatarData(convite.expira_em)}.`}>
      <dl className="mb-6 space-y-3 rounded-lg bg-stone-50 p-4 text-sm ring-1 ring-stone-200">
        <div>
          <dt className="text-stone-500">Para</dt>
          <dd className="font-medium break-all">{convite.email}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Função</dt>
          <dd className="font-medium">{NOME_PAPEL[convite.papel]}</dd>
          <dd className="text-stone-500">{DESCRICAO_PAPEL[convite.papel]}</dd>
        </div>
      </dl>

      {erro && (
        <div className="mb-4">
          <Aviso>{erro}</Aviso>
        </div>
      )}

      {!usuario ? (
        <div className="space-y-3">
          <p className="text-sm text-stone-600">Entre ou crie sua conta com o e-mail do convite para aceitar.</p>
          <Link
            to={`/cadastrar?proximo=${encodeURIComponent(destino)}&email=${encodeURIComponent(convite.email)}`}
            className="flex min-h-10 w-full items-center justify-center rounded-lg bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-700"
          >
            Criar conta
          </Link>
          <Link
            to={`/entrar?proximo=${encodeURIComponent(destino)}&email=${encodeURIComponent(convite.email)}`}
            className="flex min-h-10 w-full items-center justify-center rounded-lg bg-white px-4 text-sm font-medium ring-1 ring-inset ring-stone-300 hover:bg-stone-100"
          >
            Já tenho conta
          </Link>
        </div>
      ) : outroEmail ? (
        <div className="space-y-3">
          <Aviso tipo="info">
            Você entrou como <strong>{emailUsuario}</strong>, mas o convite é para <strong>{convite.email}</strong>.
          </Aviso>
          <Botao variante="secundario" className="w-full" onClick={() => void sair()}>
            Sair e entrar com o e-mail do convite
          </Botao>
        </div>
      ) : (
        <Botao className="w-full" carregando={aceitando} onClick={() => void aceitar()}>
          Aceitar convite
        </Botao>
      )}
    </TelaAcesso>
  );
}
