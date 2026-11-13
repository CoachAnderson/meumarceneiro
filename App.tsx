import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { RequerEmpresa, RequerLogin, SomenteVisitante } from './components/Rotas';
import { Layout } from './components/Layout';
import { Carregando, TelaAcesso } from './components/ui';
import { Cadastrar } from './pages/Cadastrar';
import { Convite } from './pages/Convite';
import { CriarEmpresa } from './pages/CriarEmpresa';
import { Entrar } from './pages/Entrar';
import { RecuperarSenha } from './pages/RecuperarSenha';
import { RedefinirSenha } from './pages/RedefinirSenha';

// Páginas internas: cada uma é baixada só quando é aberta.
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));
const Termos = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Termos })));
const Privacidade = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Privacidade })));
const Financeiro = lazy(() => import('./pages/Financeiro').then((m) => ({ default: m.Financeiro })));
const Medicoes = lazy(() => import('./pages/Medicoes').then((m) => ({ default: m.Medicoes })));
const MedicaoDetalhe = lazy(() => import('./pages/MedicaoDetalhe').then((m) => ({ default: m.MedicaoDetalhe })));
const OficinaPeca = lazy(() => import('./pages/OficinaPeca').then((m) => ({ default: m.OficinaPeca })));
const ManualPublico = lazy(() => import('./pages/ManualPublico').then((m) => ({ default: m.ManualPublico })));
const Ambiente = lazy(() => import('./pages/Ambiente').then((m) => ({ default: m.Ambiente })));
const Assinatura = lazy(() => import('./pages/Assinatura').then((m) => ({ default: m.Assinatura })));
const Clientes = lazy(() => import('./pages/Clientes').then((m) => ({ default: m.Clientes })));
const Empresa = lazy(() => import('./pages/Empresa').then((m) => ({ default: m.Empresa })));
const Estoque = lazy(() => import('./pages/Estoque').then((m) => ({ default: m.Estoque })));
const Ferragens = lazy(() => import('./pages/Ferragens').then((m) => ({ default: m.Ferragens })));
const Fitas = lazy(() => import('./pages/Fitas').then((m) => ({ default: m.Fitas })));
const Fornecedores = lazy(() => import('./pages/Fornecedores').then((m) => ({ default: m.Fornecedores })));
const Importar = lazy(() => import('./pages/Importar').then((m) => ({ default: m.Importar })));
const Materiais = lazy(() => import('./pages/Materiais').then((m) => ({ default: m.Materiais })));
const Modulo = lazy(() => import('./pages/Modulo').then((m) => ({ default: m.Modulo })));
const OrcamentoDetalhe = lazy(() => import('./pages/OrcamentoDetalhe').then((m) => ({ default: m.OrcamentoDetalhe })));
const Orcamentos = lazy(() => import('./pages/Orcamentos').then((m) => ({ default: m.Orcamentos })));
const OrdemDetalhe = lazy(() => import('./pages/OrdemDetalhe').then((m) => ({ default: m.OrdemDetalhe })));
const Painel = lazy(() => import('./pages/Painel').then((m) => ({ default: m.Painel })));
const Producao = lazy(() => import('./pages/Producao').then((m) => ({ default: m.Producao })));
const Projeto = lazy(() => import('./pages/Projeto').then((m) => ({ default: m.Projeto })));
const VisaoIA = lazy(() => import('./pages/VisaoIA').then((m) => ({ default: m.VisaoIA })));
const Projetos = lazy(() => import('./pages/Projetos').then((m) => ({ default: m.Projetos })));

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/cadastrar" element={<Cadastrar />} />
        <Route
          path="/recuperar-senha"
          element={
            <SomenteVisitante>
              <RecuperarSenha />
            </SomenteVisitante>
          }
        />
        <Route
          path="/redefinir-senha"
          element={
            <RequerLogin>
              <RedefinirSenha />
            </RequerLogin>
          }
        />
        <Route path="/convite/:token" element={<Convite />} />
        <Route
          path="/ar/:empresa/:id"
          element={
            <Suspense fallback={<Carregando />}>
              <Ambiente />
            </Suspense>
          }
        />
        <Route
          path="/montagem/:empresa/:id"
          element={
            <Suspense fallback={<Carregando />}>
              <ManualPublico />
            </Suspense>
          }
        />
        <Route
          path="/termos"
          element={
            <Suspense fallback={<Carregando />}>
              <Termos />
            </Suspense>
          }
        />
        <Route
          path="/privacidade"
          element={
            <Suspense fallback={<Carregando />}>
              <Privacidade />
            </Suspense>
          }
        />
        <Route
          path="/admin"
          element={
            <RequerLogin>
              <Suspense fallback={<Carregando />}>
                <Admin />
              </Suspense>
            </RequerLogin>
          }
        />
        <Route
          path="/oficina/p/:id"
          element={
            <RequerLogin>
              <RequerEmpresa>
                <Suspense fallback={<Carregando />}>
                  <OficinaPeca />
                </Suspense>
              </RequerEmpresa>
            </RequerLogin>
          }
        />
        <Route
          path="/criar-empresa"
          element={
            <RequerLogin>
              <CriarEmpresa />
            </RequerLogin>
          }
        />
        <Route
          element={
            <RequerLogin>
              <RequerEmpresa>
                <Layout />
              </RequerEmpresa>
            </RequerLogin>
          }
        >
          <Route index element={<Painel />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="empresa" element={<Empresa />} />
          <Route path="assinatura" element={<Assinatura />} />
          <Route path="materiais" element={<Materiais />} />
          <Route path="fitas" element={<Fitas />} />
          <Route path="ferragens" element={<Ferragens />} />
          <Route path="fornecedores" element={<Fornecedores />} />
          <Route path="estoque" element={<Estoque />} />
          <Route path="importar" element={<Importar />} />
          <Route path="modulo" element={<Modulo />} />
          <Route path="visao" element={<VisaoIA />} />
          <Route path="projetos" element={<Projetos />} />
          <Route path="projetos/:id" element={<Projeto />} />
          <Route path="medicoes" element={<Medicoes />} />
          <Route path="medicoes/:id" element={<MedicaoDetalhe />} />
          <Route path="financeiro" element={<Financeiro />} />
          <Route path="producao" element={<Producao />} />
          <Route path="producao/:id" element={<OrdemDetalhe />} />
          <Route path="orcamentos" element={<Orcamentos />} />
          <Route path="orcamentos/:id" element={<OrcamentoDetalhe />} />
        </Route>
        <Route
          path="*"
          element={
            <TelaAcesso titulo="Página não encontrada">
              <Link to="/" className="text-sm font-medium underline underline-offset-4">
                Ir para o início
              </Link>
            </TelaAcesso>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
