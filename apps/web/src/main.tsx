import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthProvider';
import { EmpresaProvider } from './empresa/EmpresaProvider';
import { App } from './App';
import { ErroGeral } from './components/ErroGeral';
import { configuracaoAusente } from './lib/supabase';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (tentativas, erro) => {
        // Erro de permissão ou de dados não melhora tentando de novo.
        const codigo = (erro as { code?: string }).code;
        if (codigo && /^(42|23|P0|28)/.test(codigo)) return false;
        return tentativas < 2;
      },
      refetchOnWindowFocus: true,
    },
  },
});

const raiz = createRoot(document.getElementById('root')!);

if (configuracaoAusente) {
  raiz.render(
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-lg font-semibold">Configuração incompleta</h1>
      <p className="mt-2 text-sm text-stone-600">{configuracaoAusente}</p>
    </main>,
  );
} else {
  raiz.render(
    <StrictMode>
      <ErroGeral>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <EmpresaProvider>
            <App />
          </EmpresaProvider>
        </AuthProvider>
      </QueryClientProvider>
      </ErroGeral>
    </StrictMode>,
  );
}
