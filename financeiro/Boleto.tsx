import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Botao } from '../components/ui';
import { chamarCobranca } from '../lib/cobranca';
import { chavesFinanceiro, type Lancamento } from '../lib/financeiro';

const ATIVO = (s: string) => !['canceled', 'cancelled', 'expired', 'failed'].includes(s);

/** Boleto da conta a receber: gerar, abrir, copiar a linha digitável, cancelar. */
export function BotaoBoleto({ l }: { l: Lancamento }) {
  const { empresa } = useEmpresaAtual();
  const queryClient = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const b = l.boleto && ATIVO(l.boleto.status) ? l.boleto : null;

  async function agir(acao: 'emitir_boleto' | 'cancelar_boleto') {
    setErro(null);
    setOcupado(true);
    try {
      await chamarCobranca({ acao, lancamento: l.id });
      await queryClient.invalidateQueries({ queryKey: chavesFinanceiro.lancamentos(empresa.id) });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex flex-wrap justify-end gap-1.5">
        {!b ? (
          <Botao variante="secundario" onClick={() => void agir('emitir_boleto')} carregando={ocupado}>
            Gerar boleto
          </Botao>
        ) : (
          <>
            {b.url && (
              <a href={b.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-lg bg-white px-3 text-sm font-medium text-stone-900 ring-1 ring-inset ring-stone-300 hover:bg-stone-50 lg:min-h-9">
                Boleto
              </a>
            )}
            {b.linha && (
              <Botao
                variante="discreto"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(b.linha!)
                    .then(() => {
                      setCopiado(true);
                      setTimeout(() => setCopiado(false), 2000);
                    })
                    .catch(() => setErro('Não deu para copiar.'))
                }
              >
                {copiado ? 'Copiada' : 'Copiar linha'}
              </Botao>
            )}
            <Botao variante="discreto" onClick={() => window.confirm('Cancelar o boleto no Mercado Pago?') && void agir('cancelar_boleto')} disabled={ocupado}>
              Cancelar boleto
            </Botao>
          </>
        )}
      </span>
      {erro && <span className="max-w-xs text-right text-xs text-red-700">{erro}</span>}
    </span>
  );
}
