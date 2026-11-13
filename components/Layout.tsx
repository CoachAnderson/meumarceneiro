import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { resumirAcesso } from '@marcenaria/core';
import { buscarSituacao, chaveSituacao } from '../lib/assinatura';
import { chaveAdmin, ehAdministrador } from '../lib/admin';
import { useAuth } from '../auth/AuthProvider';
import { useEmpresaAtual, useEmpresa } from '../empresa/EmpresaProvider';
import { NOME_PAPEL } from '../lib/tipos';
import { Suspense, useEffect, useState } from 'react';
import { Marca } from './Marca';
import { Carregando } from './ui';
import { podeVerOrcamentos } from '../lib/orcamentos';
import { mudarTema, NOME_TEMA, usePreferenciaTema, type PreferenciaTema } from '../lib/tema';

const LINKS = [
  { para: '/', rotulo: 'Painel', fim: true },
  { para: '/clientes', rotulo: 'Clientes', fim: false },
  { para: '/medicoes', rotulo: 'Medições', fim: false },
  { para: '/projetos', rotulo: 'Projetos', fim: false },
  { para: '/modulo', rotulo: 'Rascunho', fim: false },
  { para: '/visao', rotulo: 'Visão IA', fim: false },
  { para: '/orcamentos', rotulo: 'Orçamentos', fim: false },
  { para: '/financeiro', rotulo: 'Financeiro', fim: false },
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
  const tema = usePreferenciaTema();
  const { empresa, papel, vinculos } = useEmpresaAtual();
  const { trocar } = useEmpresa();
  const queryClient = useQueryClient();
  const navegar = useNavigate();
  const local = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);
  // O menu do celular fecha ao trocar de tela e com a tecla Esc.
  useEffect(() => setMenuAberto(false), [local.pathname]);
  useEffect(() => {
    if (!menuAberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAberto(false);
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [menuAberto]);
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

  const links = LINKS.filter((l) => ((l.para !== '/orcamentos' && l.para !== '/visao') || podeVerOrcamentos(papel)) && (l.para !== '/financeiro' || papel === 'dono'));
  const seletorEmpresa = (classe: string) => (
    <select value={empresa.id} onChange={(e) => aoTrocarEmpresa(e.target.value)} className={classe}>
      {vinculos.map((v) => (
        <option key={v.empresa.id} value={v.empresa.id}>
          {v.empresa.nome}
        </option>
      ))}
      <option value={NOVA_EMPRESA}>+ Criar outra empresa</option>
    </select>
  );
  const seletorTema = (classe: string) => (
    <select value={tema} onChange={(e) => mudarTema(e.target.value as PreferenciaTema)} className={classe} title="Tema da tela">
      {(Object.keys(NOME_TEMA) as PreferenciaTema[]).map((t) => (
        <option key={t} value={t}>
          {t === 'claro' ? 'Tema claro' : t === 'escuro' ? 'Tema escuro' : 'Tema automático'}
        </option>
      ))}
    </select>
  );

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
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur print:hidden">
        {/* Celular e tablet em pé: barra curta e um menu com tudo. */}
        <div className="flex h-14 items-center gap-3 px-4 lg:hidden">
          <Link to="/" aria-label="Meu Marceneiro, início" className="flex min-h-11 shrink-0 items-center">
            <Marca />
          </Link>
          <span className="min-w-0 flex-1 truncate text-right text-sm text-stone-500">{empresa.nome}</span>
          <button
            type="button"
            onClick={() => setMenuAberto((v) => !v)}
            aria-expanded={menuAberto}
            aria-controls="menu-movel"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium text-stone-800 ring-1 ring-inset ring-stone-300 hover:bg-stone-50"
          >
            <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              {menuAberto ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
            </svg>
            {menuAberto ? 'Fechar' : 'Menu'}
          </button>
        </div>
        {menuAberto && (
          <div id="menu-movel" className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-stone-200 px-4 pt-3 pb-5 lg:hidden">
            <nav aria-label="Principal" className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {links.map((l) => (
                <NavLink
                  key={l.para}
                  to={l.para}
                  end={l.fim}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center rounded-lg px-3 text-sm font-medium ${isActive ? 'bg-amber-50 text-stone-900 ring-1 ring-inset ring-amber-200' : 'text-stone-700 hover:bg-stone-100'}`
                  }
                >
                  {l.rotulo}
                </NavLink>
              ))}
            </nav>
            <div className="mt-4 grid gap-3 border-t border-stone-200 pt-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-stone-600">Empresa ({NOME_PAPEL[papel]})</span>
                {seletorEmpresa('min-h-11 w-full rounded-lg border-0 bg-stone-100 py-2 pr-8 pl-3 text-base font-medium ring-1 ring-inset ring-stone-200 focus:ring-2 focus:ring-amber-500')}
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-stone-600">Tema da tela</span>
                {seletorTema('min-h-11 w-full rounded-lg border-0 bg-transparent py-2 pr-8 pl-3 text-base text-stone-800 ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-amber-500')}
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              {admin.data && (
                <Link to="/admin" className="inline-flex min-h-11 items-center rounded-lg bg-stone-900 px-4 font-medium text-white hover:bg-stone-700">
                  Administração
                </Link>
              )}
              <span className="min-w-0 flex-1 truncate text-stone-500">{usuario?.email}</span>
              <button type="button" onClick={aoSair} className="min-h-11 rounded-lg px-4 font-medium text-stone-700 ring-1 ring-inset ring-stone-300 hover:bg-stone-100">
                Sair
              </button>
            </div>
          </div>
        )}

        {/* Computador e tablet deitado */}
        <div className="hidden lg:block">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
            <Link to="/" aria-label="Meu Marceneiro, início">
              <Marca />
            </Link>

            <label className="flex min-w-0 items-center gap-2 text-sm">
              <span className="sr-only">Empresa</span>
              {seletorEmpresa('max-w-56 truncate rounded-lg border-0 bg-stone-100 py-1.5 pr-8 pl-3 text-sm font-medium ring-1 ring-inset ring-stone-200 focus:ring-2 focus:ring-amber-500')}
              <span className="text-stone-500">{NOME_PAPEL[papel]}</span>
            </label>

            <div className="ml-auto flex items-center gap-3 text-sm">
              {admin.data && (
                <Link to="/admin" className="rounded-lg bg-stone-900 px-3 py-1.5 font-medium text-white hover:bg-stone-700">
                  Administração
                </Link>
              )}
              <label className="flex items-center">
                <span className="sr-only">Tema da tela</span>
                {seletorTema('rounded-lg border-0 bg-transparent py-1.5 pr-8 pl-2 text-sm text-stone-600 ring-1 ring-inset ring-stone-200 focus:ring-2 focus:ring-amber-500')}
              </label>
              <span className="hidden max-w-48 truncate text-stone-500 xl:inline">{usuario?.email}</span>
              <button type="button" onClick={aoSair} className="rounded-lg px-3 py-1.5 font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900">
                Sair
              </button>
            </div>
          </div>

          <nav className="mx-auto flex max-w-6xl flex-wrap gap-x-1 px-4" aria-label="Principal">
            {links.map((l) => (
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
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 lg:py-8">
        <Suspense fallback={<Carregando />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-1 px-4 pb-8 text-xs text-stone-500 print:hidden">
        <Link to="/termos" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline lg:min-h-0">
          Termos de Uso
        </Link>
        <Link to="/privacidade" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline lg:min-h-0">
          Política de Privacidade
        </Link>
      </footer>
    </div>
  );
}
