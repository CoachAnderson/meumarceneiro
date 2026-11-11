import { Marca } from './Marca';
import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type Variante = 'primario' | 'secundario' | 'perigo' | 'discreto';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-stone-900 text-white hover:bg-stone-700 disabled:bg-stone-400',
  secundario: 'bg-white text-stone-800 ring-1 ring-inset ring-stone-300 hover:bg-stone-100 disabled:text-stone-400',
  perigo: 'bg-white text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-50 disabled:text-red-300',
  discreto: 'text-stone-600 hover:text-stone-900 hover:bg-stone-100 disabled:text-stone-300',
};

export function Botao({
  variante = 'primario',
  carregando = false,
  className = '',
  children,
  disabled,
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; carregando?: boolean }) {
  return (
    <button
      {...resto}
      disabled={disabled || carregando}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:cursor-not-allowed ${VARIANTES[variante]} ${className}`}
    >
      {carregando && (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      )}
      {children}
    </button>
  );
}

interface PropsCampo {
  rotulo: string;
  ajuda?: ReactNode;
  erro?: string | null;
  obrigatorio?: boolean;
}

const CLASSE_ENTRADA =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-base text-stone-900 ring-1 ring-inset ring-stone-300 placeholder:text-stone-400 focus:ring-2 focus:ring-inset focus:ring-amber-500 disabled:bg-stone-100 disabled:text-stone-500 sm:text-sm';

function Moldura({ id, rotulo, ajuda, erro, obrigatorio, children }: PropsCampo & { id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-stone-800">
        {rotulo}
        {obrigatorio && <span className="text-amber-700"> *</span>}
      </label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} className="text-sm text-red-700">
          {erro}
        </p>
      ) : ajuda ? (
        <p id={`${id}-ajuda`} className="text-sm text-stone-500">
          {ajuda}
        </p>
      ) : null}
    </div>
  );
}

export function Campo({ rotulo, ajuda, erro, obrigatorio, ...entrada }: PropsCampo & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Moldura id={id} rotulo={rotulo} ajuda={ajuda} erro={erro} obrigatorio={obrigatorio}>
      <input
        id={id}
        required={obrigatorio}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined}
        className={`${CLASSE_ENTRADA} ${erro ? 'ring-red-400' : ''}`}
        {...entrada}
      />
    </Moldura>
  );
}

export function CampoTexto({ rotulo, ajuda, erro, obrigatorio, ...entrada }: PropsCampo & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Moldura id={id} rotulo={rotulo} ajuda={ajuda} erro={erro} obrigatorio={obrigatorio}>
      <textarea id={id} required={obrigatorio} rows={3} className={CLASSE_ENTRADA} {...entrada} />
    </Moldura>
  );
}

export function CampoSelecao({
  rotulo,
  ajuda,
  erro,
  obrigatorio,
  children,
  ...selecao
}: PropsCampo & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Moldura id={id} rotulo={rotulo} ajuda={ajuda} erro={erro} obrigatorio={obrigatorio}>
      <select id={id} required={obrigatorio} className={CLASSE_ENTRADA} {...selecao}>
        {children}
      </select>
    </Moldura>
  );
}

export function Aviso({ tipo = 'erro', children }: { tipo?: 'erro' | 'sucesso' | 'info'; children: ReactNode }) {
  const estilos = {
    erro: 'bg-red-50 text-red-800 ring-red-200',
    sucesso: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    info: 'bg-amber-50 text-amber-900 ring-amber-200',
  }[tipo];
  return (
    <div role={tipo === 'erro' ? 'alert' : 'status'} className={`rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${estilos}`}>
      {children}
    </div>
  );
}

export function Cartao({ titulo, descricao, acoes, children }: { titulo?: string; descricao?: ReactNode; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:p-6">
      {(titulo || acoes) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            {titulo && <h2 className="text-base font-semibold text-stone-900">{titulo}</h2>}
            {descricao && <p className="mt-1 text-sm text-stone-500">{descricao}</p>}
          </div>
          {acoes}
        </div>
      )}
      {children}
    </section>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-sm text-stone-500" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" aria-hidden />
      {texto}
    </div>
  );
}

export function Titulo({ children, subtitulo }: { children: ReactNode; subtitulo?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{children}</h1>
      {subtitulo && <p className="mt-1 text-sm text-stone-500">{subtitulo}</p>}
    </header>
  );
}

/** Moldura das telas de acesso (entrar, cadastrar, recuperar senha, convite). */
export function TelaAcesso({ titulo, subtitulo, children, rodape }: { titulo: string; subtitulo?: ReactNode; children: ReactNode; rodape?: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-8">
        <Marca tamanho="grande" />
      </div>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200 sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
        {subtitulo && <p className="mt-1.5 text-sm text-stone-500">{subtitulo}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {rodape && <div className="mt-6 text-center text-sm text-stone-600">{rodape}</div>}
    </main>
  );
}
