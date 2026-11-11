import { useState, type FormEvent, type ReactNode } from 'react';
import { mensagemDeErro } from '../lib/erros';
import { lerCampo } from '../lib/formulario';
import { Botao } from './ui';

export function Selo({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'neutro' | 'aviso' | 'inativo' }) {
  const estilo = {
    neutro: 'bg-stone-100 text-stone-700',
    aviso: 'bg-amber-100 text-amber-900',
    inativo: 'bg-stone-200 text-stone-500',
  }[tom];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${estilo}`}>{children}</span>;
}

/**
 * Mostra o saldo e, para quem pode, um ajuste por contagem: a pessoa informa
 * quanto tem e o sistema grava a diferença como movimento.
 */
export function EstoqueEditor({
  saldo,
  unidade,
  formatar,
  ler,
  podeAjustar,
  aoSalvar,
}: {
  saldo: number | undefined;
  unidade: string;
  formatar: (n: number) => string;
  ler: (texto: string) => number;
  podeAjustar: boolean;
  aoSalvar: (novoSaldo: number, motivo: string) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const campo = lerCampo(texto, ler, { obrigatorio: true, nome: 'Quantidade' });
  const atual = saldo ?? 0;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (campo.valor === undefined) return;
    setSalvando(true);
    setErro(null);
    try {
      await aoSalvar(campo.valor, motivo);
      setAberto(false);
      setTexto('');
      setMotivo('');
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className={`tabular ${saldo === undefined ? 'text-stone-400' : ''}`}>
          {saldo === undefined ? 'sem registro' : `${formatar(atual)} ${unidade}`}
        </span>
        {podeAjustar && (
          <button
            type="button"
            onClick={() => {
              setTexto(saldo === undefined ? '' : formatar(atual));
              setAberto(true);
            }}
            className="rounded px-1.5 py-0.5 text-xs font-medium text-amber-800 underline-offset-2 hover:underline"
          >
            {saldo === undefined ? 'informar' : 'ajustar'}
          </button>
        )}
      </span>
    );
  }

  return (
    <form onSubmit={salvar} className="flex flex-wrap items-start gap-2" noValidate>
      <label className="flex flex-col text-xs text-stone-500">
        Quantidade contada ({unidade})
        <input
          autoFocus
          inputMode="decimal"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="mt-1 w-28 rounded-md border-0 px-2 py-1.5 text-sm text-stone-900 ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-amber-500"
        />
      </label>
      <label className="flex flex-col text-xs text-stone-500">
        Motivo (opcional)
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={300}
          placeholder="Contagem, perda…"
          className="mt-1 w-40 rounded-md border-0 px-2 py-1.5 text-sm text-stone-900 ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-amber-500"
        />
      </label>
      <div className="flex gap-1 self-end">
        <Botao type="submit" carregando={salvando} disabled={campo.valor === undefined} className="min-h-8 px-3 py-1 text-xs">
          Salvar
        </Botao>
        <Botao type="button" variante="discreto" className="min-h-8 px-2 py-1 text-xs" onClick={() => setAberto(false)}>
          Cancelar
        </Botao>
      </div>
      {(erro || (texto && campo.erro)) && <p className="w-full text-xs text-red-700">{erro ?? campo.erro}</p>}
      {campo.valor !== undefined && campo.valor !== atual && (
        <p className="w-full text-xs text-stone-500">
          Diferença registrada: {campo.valor > atual ? '+' : '−'}
          {formatar(Math.abs(campo.valor - atual))} {unidade}
        </p>
      )}
    </form>
  );
}
