import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Última barreira: se uma tela quebrar, mostra uma mensagem com saída em vez
 * de página em branco. Falha ao baixar uma parte do app (depois de uma
 * atualização publicada) se resolve recarregando.
 */
export class ErroGeral extends Component<{ children: ReactNode }, { erro: Error | null }> {
  override state = { erro: null as Error | null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  override componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro na tela:', erro, info.componentStack);
  }

  override render() {
    if (!this.state.erro) return this.props.children;
    const desatualizado = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(this.state.erro.message);
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
        <img src="/favicon.svg" alt="" className="mb-6 size-10" />
        <h1 className="text-xl font-semibold">{desatualizado ? 'O sistema foi atualizado' : 'Algo deu errado nesta tela'}</h1>
        <p className="mt-2 text-sm text-stone-600">
          {desatualizado ? 'Recarregue a página para usar a versão nova.' : 'Seus dados salvos não foram afetados. Recarregue a página; se o erro continuar, avise o suporte dizendo o que estava fazendo.'}
        </p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
            Recarregar
          </button>
          <a href="/" className="rounded-lg px-4 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">
            Ir para o início
          </a>
        </div>
      </div>
    );
  }
}
