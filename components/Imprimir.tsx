import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Impressão de uma área só: enquanto imprime, o conteúdo é copiado para o
 * fim do body (classe .area-impressao) e o CSS de impressão esconde o resto.
 */
export function useImpressao() {
  const [imprimindo, setImprimindo] = useState(false);
  useEffect(() => {
    if (!imprimindo) return;
    const fim = () => setImprimindo(false);
    window.addEventListener('afterprint', fim);
    const t = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', fim);
    };
  }, [imprimindo]);

  const Area = ({ children }: { children: ReactNode }) => (imprimindo ? createPortal(<div className="area-impressao text-stone-900">{children}</div>, document.body) : null);
  return { imprimir: () => setImprimindo(true), Area };
}
