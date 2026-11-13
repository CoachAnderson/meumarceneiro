import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatarMm, dmm, type AjusteMedidas, type FalaConversa } from '@marcenaria/core';
import { Aviso, Botao } from '../components/ui';
import { ErroMarceneiro, type RespostaDoMarceneiro } from '../lib/marceneiro';
import { AvatarMarceneiro } from './Avatar';
import { criarBoca, falar, ouvir, temMicrofone, temVoz, type Escuta, type Fala } from './voz';

const CHAVE_SOM = 'marcenaria:marceneiro-som';

function lerSom(): boolean {
  try {
    return localStorage.getItem(CHAVE_SOM) !== '0';
  } catch {
    return true;
  }
}
function gravarSom(v: boolean) {
  try {
    localStorage.setItem(CHAVE_SOM, v ? '1' : '0');
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

const NOME_MEDIDA: Record<keyof AjusteMedidas, string> = { largura: 'largura', altura: 'altura', profundidade: 'profundidade' };
export const descreverAjuste = (a: AjusteMedidas) =>
  (Object.keys(NOME_MEDIDA) as (keyof AjusteMedidas)[])
    .filter((k) => a[k] !== undefined)
    .map((k) => `${NOME_MEDIDA[k]} ${formatarMm(dmm(a[k]! * 10))} mm`)
    .join(', ');

export interface PropsConversa {
  modo: 'link' | 'editor';
  nome: string;
  saudacao: string;
  sugestoes: string[];
  perguntar: (pergunta: string, historico: FalaConversa[]) => Promise<RespostaDoMarceneiro>;
  /** Editor: aplica no desenho a medida que o cliente pediu (só depois de o marceneiro confirmar). */
  aoAplicarAjuste?: (a: AjusteMedidas) => void;
  /** Link: texto do móvel para o resumo enviado à marcenaria. */
  tituloMovel?: string;
  restantesIniciais?: number | null;
}

/** Conversa com o marceneiro virtual: personagem, fala, histórico, microfone e texto. */
export function ConversaMarceneiro({ modo, nome, saudacao, sugestoes, perguntar, aoAplicarAjuste, tituloMovel, restantesIniciais = null }: PropsConversa) {
  const boca = useRef(criarBoca()).current;
  const fala = useRef<Fala | null>(null);
  const escuta = useRef<Escuta | null>(null);
  const fim = useRef<HTMLLIElement>(null);
  const [iniciada, setIniciada] = useState(false);
  const [historico, setHistorico] = useState<FalaConversa[]>([]);
  const [pergunta, setPergunta] = useState('');
  const [pensando, setPensando] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [comSom, setComSom] = useState(lerSom);
  const [ajuste, setAjuste] = useState<AjusteMedidas | null>(null);
  const [encaminhar, setEncaminhar] = useState(false);
  const [restantes, setRestantes] = useState<number | null>(restantesIniciais);
  const microfone = temMicrofone();
  const semVoz = !temVoz();

  useEffect(
    () => () => {
      fala.current?.parar();
      escuta.current?.parar();
    },
    [],
  );
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'nearest' });
  }, [historico.length, pensando]);

  function dizer(texto: string) {
    fala.current?.parar();
    fala.current = falar(texto, boca, comSom);
  }

  function iniciar() {
    setIniciada(true);
    setHistorico([{ papel: 'marceneiro', texto: saudacao }]);
    dizer(saudacao);
  }

  async function enviar(texto: string) {
    const p = texto.trim().slice(0, 400);
    if (!p || pensando) return;
    if (!iniciada) setIniciada(true);
    fala.current?.parar();
    setErro(null);
    setAjuste(null);
    setPergunta('');
    const anterior = iniciada ? historico : [{ papel: 'marceneiro' as const, texto: saudacao }];
    setHistorico([...anterior, { papel: 'cliente', texto: p }]);
    setPensando(true);
    try {
      const r = await perguntar(p, anterior);
      setHistorico((h) => [...h, { papel: 'marceneiro', texto: r.resposta }]);
      setEncaminhar((e) => e || r.encaminhar);
      if (r.ajuste && modo === 'editor') setAjuste(r.ajuste);
      if (r.restantes !== null) setRestantes(r.restantes);
      dizer(r.resposta);
    } catch (e) {
      // A pergunta sem resposta fica no histórico: a próxima vai junto.
      setErro(e instanceof ErroMarceneiro ? e.message : 'O marceneiro virtual não respondeu. Tente de novo.');
    } finally {
      setPensando(false);
    }
  }

  async function usarMicrofone() {
    if (ouvindo) {
      escuta.current?.parar();
      return;
    }
    fala.current?.parar();
    setErro(null);
    setOuvindo(true);
    escuta.current = ouvir();
    try {
      const texto = await escuta.current.texto;
      if (texto) await enviar(texto);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não deu para ouvir. Digite a pergunta.');
    } finally {
      setOuvindo(false);
      escuta.current = null;
    }
  }

  function alternarSom() {
    const v = !comSom;
    setComSom(v);
    gravarSom(v);
    if (!v) fala.current?.parar();
  }

  function aoEnviar(e: FormEvent) {
    e.preventDefault();
    void enviar(pergunta);
  }

  const resumo = [`Conversa sobre ${tituloMovel ? `o móvel "${tituloMovel}"` : 'o móvel'}:`, ...historico.map((f) => `${f.papel === 'cliente' ? 'Eu' : nome}: ${f.texto}`), typeof window !== 'undefined' ? window.location.href : ''].join('\n');
  const ultima = [...historico].reverse().find((f) => f.papel === 'marceneiro');
  const esgotado = restantes !== null && restantes <= 0;

  return (
    <div className="rounded-xl bg-white ring-1 ring-stone-200">
      <div className="grid gap-4 p-4 sm:grid-cols-[13rem_1fr]">
        <AvatarMarceneiro boca={boca} ouvindo={ouvindo} rotulo={`${nome}, personagem 3D do assistente virtual`} className="h-56 sm:h-64" />
        <div className="flex min-w-0 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-base font-semibold text-stone-900">{nome}</p>
              <p className="text-xs text-stone-500">Assistente virtual com inteligência artificial</p>
            </div>
            <button type="button" onClick={alternarSom} className="min-h-10 shrink-0 rounded-lg px-3 text-sm text-stone-700 ring-1 ring-inset ring-stone-300 hover:bg-stone-50" aria-pressed={comSom}>
              {comSom ? 'Som ligado' : 'Som desligado'}
            </button>
          </div>

          <div className="mt-3 flex-1 rounded-lg bg-amber-50 px-4 py-3 text-sm leading-relaxed text-stone-800 ring-1 ring-inset ring-amber-200" aria-live="polite">
            {pensando ? <span className="text-stone-500">Pensando…</span> : iniciada ? (ultima?.texto ?? saudacao) : `Olá! Toque em "Conversar" e pergunte sobre o móvel: medidas, materiais e como ele é feito.`}
          </div>

          {!iniciada && (
            <div className="mt-3">
              <Botao onClick={iniciar}>Conversar com {nome}</Botao>
            </div>
          )}
        </div>
      </div>

      {iniciada && (
        <div className="border-t border-stone-200 p-4">
          {historico.length > 1 && (
            <details className="mb-3">
              <summary className="cursor-pointer text-sm font-medium text-stone-700">Ver a conversa ({historico.length} falas)</summary>
              <ol className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1 text-sm">
                {historico.map((f, i) => (
                  <li key={i} className={f.papel === 'cliente' ? 'ml-8 rounded-lg bg-stone-100 px-3 py-2 text-stone-800' : 'mr-8 rounded-lg bg-amber-50 px-3 py-2 text-stone-800'}>
                    <span className="block text-xs font-medium text-stone-500">{f.papel === 'cliente' ? (modo === 'editor' ? 'Cliente' : 'Você') : nome}</span>
                    {f.texto}
                  </li>
                ))}
                <li ref={fim} aria-hidden="true" />
              </ol>
            </details>
          )}

          {ajuste && aoAplicarAjuste && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 p-3 text-sm ring-1 ring-inset ring-sky-200">
              <span className="min-w-[min(100%,15rem)] flex-1 text-sky-900">O cliente pediu: {descreverAjuste(ajuste)}. Confira antes de aplicar; o preço digitado será apagado.</span>
              <Botao
                variante="secundario"
                onClick={() => {
                  aoAplicarAjuste(ajuste);
                  setAjuste(null);
                }}
              >
                Aplicar no desenho
              </Botao>
              <Botao variante="discreto" onClick={() => setAjuste(null)}>
                Ignorar
              </Botao>
            </div>
          )}

          {modo === 'link' && encaminhar && (
            <div className="mb-3 rounded-lg bg-stone-50 p-3 text-sm ring-1 ring-inset ring-stone-200">
              <p className="text-stone-700">Esta parte a marcenaria responde direto. Envie o resumo da conversa para ela:</p>
              <a href={`https://wa.me/?text=${encodeURIComponent(resumo)}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-10 items-center rounded-lg bg-white px-4 py-2 font-medium text-stone-900 ring-1 ring-inset ring-stone-300 hover:bg-stone-50">
                Enviar resumo pelo WhatsApp
              </a>
            </div>
          )}

          {erro && (
            <div className="mb-3">
              <Aviso>{erro}</Aviso>
            </div>
          )}

          {!esgotado ? (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                {sugestoes.map((s) => (
                  <button key={s} type="button" disabled={pensando} onClick={() => void enviar(s)} className="min-h-9 rounded-full bg-stone-100 px-3 text-sm text-stone-700 hover:bg-stone-200 disabled:opacity-50">
                    {s}
                  </button>
                ))}
              </div>
              <form onSubmit={aoEnviar} className="flex flex-wrap gap-2">
                <label className="sr-only" htmlFor="pergunta-marceneiro">
                  Sua pergunta
                </label>
                <input
                  id="pergunta-marceneiro"
                  value={pergunta}
                  onChange={(e) => setPergunta(e.target.value.slice(0, 400))}
                  placeholder={microfone ? 'Digite ou toque no microfone' : 'Digite sua pergunta'}
                  className="min-h-10 min-w-0 flex-1 rounded-lg border-0 bg-white px-3 py-2 text-base text-stone-900 ring-1 ring-inset ring-stone-300 placeholder:text-stone-400 focus:ring-2 focus:ring-inset focus:ring-amber-500 sm:text-sm"
                  maxLength={400}
                  disabled={pensando || ouvindo}
                />
                {microfone && (
                  <Botao type="button" variante="secundario" onClick={() => void usarMicrofone()} disabled={pensando} aria-pressed={ouvindo}>
                    {ouvindo ? 'Ouvindo… (parar)' : 'Falar'}
                  </Botao>
                )}
                <Botao type="submit" carregando={pensando} disabled={!pergunta.trim() || ouvindo}>
                  Perguntar
                </Botao>
              </form>
            </>
          ) : (
            <Aviso tipo="info">Este link já respondeu todas as perguntas que podia. Para continuar, fale direto com a marcenaria.</Aviso>
          )}
          {restantes !== null && restantes > 0 && restantes <= 10 && <p className="mt-2 text-xs text-stone-500">Ainda cabem {restantes} perguntas neste link.</p>}
        </div>
      )}

      <p className="border-t border-stone-200 px-4 py-3 text-xs text-stone-500">
        {nome} é um assistente virtual com inteligência artificial. Ele responde só com os dados deste projeto; preço, prazo e mudanças são confirmados pela marcenaria.
        {semVoz && ' Este aparelho não tem voz em português: as respostas aparecem só em texto.'}
      </p>
    </div>
  );
}
