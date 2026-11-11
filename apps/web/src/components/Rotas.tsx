import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { useEmpresa } from '../empresa/EmpresaProvider';
import { mensagemDeErro } from '../lib/erros';
import { Aviso, Carregando } from './ui';

/** Exige login; sem sessão, manda para /entrar e volta depois. */
export function RequerLogin({ children }: { children: ReactNode }) {
  const { carregando, sessao, recuperandoSenha } = useAuth();
  const local = useLocation();

  if (carregando) return <Carregando />;
  if (!sessao) {
    const proximo = encodeURIComponent(local.pathname + local.search);
    return <Navigate to={`/entrar?proximo=${proximo}`} replace />;
  }
  if (recuperandoSenha && local.pathname !== '/redefinir-senha') {
    return <Navigate to="/redefinir-senha" replace />;
  }
  return <>{children}</>;
}

/** Exige pelo menos uma empresa; sem nenhuma, leva à criação da primeira. */
export function RequerEmpresa({ children }: { children: ReactNode }) {
  const { carregando, erro, atual } = useEmpresa();

  if (carregando) return <Carregando texto="Carregando empresa…" />;
  if (erro) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Aviso>{mensagemDeErro(erro)}</Aviso>
      </div>
    );
  }
  if (!atual) return <Navigate to="/criar-empresa" replace />;
  return <>{children}</>;
}

/** Telas de acesso: quem já está logado vai direto para o destino. */
export function SomenteVisitante({ children, destino = '/' }: { children: ReactNode; destino?: string }) {
  const { carregando, sessao, recuperandoSenha } = useAuth();
  if (carregando) return <Carregando />;
  if (sessao && !recuperandoSenha) return <Navigate to={destino} replace />;
  return <>{children}</>;
}
