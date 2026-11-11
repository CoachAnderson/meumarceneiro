import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { resumirAcesso } from '@marcenaria/core';
import { buscarSituacao, chaveSituacao } from '../lib/assinatura';
import { chaveAdmin, ehAdministrador } from '../lib/admin';
import { useAuth } from '../auth/AuthProvider';
import { useEmpresaAtual, useEmpresa } from '../empresa/EmpresaProvider';
import { NOME_PAPEL } from '../lib/tipos';
import { Suspense } from 'react';
import { Marca } from './Marca';
import { Carregando } from './ui';
import { podeVerOrcamentos } from '../lib/orcamentos';

const LINKS = [
  { para: '/', rotulo: 'Painel', fim: true },
  { para: '/clientes', rotulo: 'Clientes', fim: false },
  { para: '/projetos', rotulo: 'Projetos', fim: false },
  { para: '/modulo', rotulo: 'Rascunho', fim: false },
  { para: '/visao', rotulo: 'Visão IA', fim: false },
  { para: '/orcamentos', rotulo: 'Orçamentos', fim: false },
  { para: '/producao', rotulo: 'Produção', fim: false },
  { para: '/materiais', rotulo: 'Materiais', fim: false },
  { para: '/fitas', rotulo: 'Fitas', fim: false },
  { para: '/ferragens', rotulo: 'Ferragens', fim: false },
  { para: '/estoque', rotulo: 'Estoque', fim: false },
  { para: '/fornecedores', rotulo: 'Fornecedores', fim: false },
  { para: '/empresa', rotulo: 'Empresa e equipe', fim: false },
  { para: '/assinatura', rotulo: 'Assinatura', fim: false },
];

const NOVA_EMPRESA = '__nova__';

export function Layout() {
  const { usuario, sair } = useAuth();
  const { empresa, papel, vinculos } = useEmpresaAtual();
  const { trocar } = useEmpresa();
  const queryClient = useQueryClient();
  const navegar = useNavigate();
  // Situação da assinatura: reconsulta a cada 10 minutos, para o aviso não ficar velho numa aba aberta.
  const situacao = useQuery({ queryKey: chaveSituacao(empresa.id), queryFn: () => buscarSituacao(empresa.id), staleTime: 60_000, refetchInterval: 600_000 });
  const admin = useQuery({ queryKey: chaveAdmin(usuario?.id), queryFn: () => ehAdministrador(usuario!.id), enabled: !!usuario, staleTime: 3_600_000 });
  const acesso = situacao.data ? resumirAcesso(situacao.data) : null;
  const avisoAcesso =
    acesso?.tipo === 'bloqueada'
      ? { cor: 'bg-red-700 text-white', texto: 'Sem assinatura ativa: só consulta. Não é possível criar nem alterar.' }
      : acesso && acesso.tipo !== 'ativa' && acesso.diasRestantes <= 5
        ? { cor: 'bg-amber-100 text-amber-950', texto: acesso.tipo === 'teste' ? `Período de teste: ${acesso.diasRestantes === 1 ? 'falta 1 dia' : `faltam ${acesso.diasRestantes} dias`}.` : `O acesso completo termina em ${acesso.diasRestantes === 1 ? '1 dia' : `${acesso.diasRestantes} dias`}.` }
        : null;

  async function aoSair() {
    await sair();
    queryClient.clear();
    navegar('/entrar', { replace: true });
  }

  function aoTrocarEmpresa(valor: string) {
    if (valor === NOVA_EMPRESA) {
      navegar('/criar-empresa');
      return;
    }
    trocar(valor);
    navegar('/');
  }

  return (
    <div className="min-h-dvh">
      {avisoAcesso && (
        <div className={`${avisoAcesso.cor} px-4 py-2 text-center text-sm font-medium`} role="status">
          {avisoAcesso.texto}{' '}
          <Link to="/assinatura" className="underline underline-offset-4">
            {papel === 'dono' ? 'Assinar o plano' : 'Ver detalhes'}
          </Link>
        </div>
      )}
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link to="/" aria-label="Meu Marceneiro, início">
            <Marca />
          </Link>

          <label className="flex min-w-0 items-center gap-2 text-sm">
            <span className="sr-only">Empresa</span>
            <select
              value={empresa.id}
              onChange={(e) => aoTrocarEmpresa(e.target.value)}
              className="max-w-56 truncate rounded-lg border-0 bg-stone-100 py-1.5 pr-8 pl-3 text-sm font-medium ring-1 ring-inset ring-stone-200 focus:ring-2 focus:ring-amber-500"
            >
              {vinculos.map((v) => (
                <option key={v.empresa.id} value={v.empresa.id}>
                  {v.empresa.nome}
                </option>
              ))}
              <option value={NOVA_EMPRESA}>+ Criar outra empresa</option>
            </select>
            <span className="hidden text-stone-500 sm:inline">{NOME_PAPEL[papel]}</span>
          </label>

          <div className="ml-auto flex items-center gap-3 text-sm">
            {admin.data && (
              <Link to="/admin" className="rounded-lg bg-stone-900 px-3 py-1.5 font-medium text-white hover:bg-stone-700">
                Administração
              </Link>
            )}
            <span className="hidden max-w-48 truncate text-stone-500 md:inline">{usuario?.email}</span>
            <button
              type="button"
              onClick={aoSair}
              className="rounded-lg px-3 py-1.5 font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            >
              Sair
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4" aria-label="Principal">
          {LINKS.filter((l) => (l.para !== '/orcamentos' && l.para !== '/visao') || podeVerOrcamentos(papel)).map((l) => (
            <NavLink
              key={l.para}
              to={l.para}
              end={l.fim}
              className={({ isActive }) =>
                `whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${
                  isActive ? 'border-amber-500 text-stone-900' : 'border-transparent text-stone-500 hover:text-stone-800'
                }`
              }
            >
              {l.rotulo}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Suspense fallback={<Carregando />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-1 px-4 pb-8 text-xs text-stone-500 print:hidden">
        <Link to="/termos" className="underline-offset-4 hover:underline">
          Termos de Uso
        </Link>
        <Link to="/privacidade" className="underline-offset-4 hover:underline">
          Política de Privacidade
        </Link>
      </footer>
    </div>
  );
}
