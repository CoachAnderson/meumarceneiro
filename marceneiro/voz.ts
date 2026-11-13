/**
 * Voz do marceneiro virtual: fala e escuta pelo próprio navegador.
 *
 * Usa a síntese de voz do aparelho (Android, iPhone, Windows e Mac têm vozes
 * em português do Brasil) e, quando existe, o reconhecimento de fala do
 * navegador (no Chrome passa pelo Google; no Safari, pela Apple). Não custa
 * nada por uso e não manda áudio para servidor nosso: recebemos só o texto.
 * Onde não houver voz, a fala aparece só em texto (o texto aparece sempre).
 */

/** Estado lido a cada quadro pelo personagem 3D para mexer a boca. */
export interface EstadoDaBoca {
  falando: boolean;
  /** Momento da última palavra (performance.now()), para dar ritmo à boca. */
  palavra: number;
}

export const criarBoca = (): EstadoDaBoca => ({ falando: false, palavra: 0 });

export const temVoz = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

/** Vozes preferidas, nesta ordem, quando o aparelho tem mais de uma em pt-BR. */
const PREFERIDAS = [/google português do brasil/i, /luciana/i, /francisca/i, /antonio/i, /thiago/i, /daniel/i, /felipe/i];

function vozPtBr(): SpeechSynthesisVoice | null {
  const vozes = window.speechSynthesis.getVoices();
  const br = vozes.filter((v) => /^pt[-_]BR$/i.test(v.lang));
  for (const re of PREFERIDAS) {
    const v = br.find((x) => re.test(x.name));
    if (v) return v;
  }
  return br[0] ?? vozes.find((v) => /^pt/i.test(v.lang)) ?? null;
}

/** Quebra em frases curtas: alguns navegadores cortam falas longas no meio. */
export function frasesParaFalar(texto: string): string[] {
  const frases = texto.match(/[^.!?…]+[.!?…]*/g)?.map((f) => f.trim()).filter(Boolean) ?? [];
  const saida: string[] = [];
  for (const f of frases) {
    if (f.length <= 220) saida.push(f);
    else for (let i = 0; i < f.length; i += 220) saida.push(f.slice(i, i + 220));
  }
  return saida;
}

export interface Fala {
  parar(): void;
  terminou: Promise<void>;
}

/**
 * Fala o texto. Sem voz no aparelho (ou com som desligado), só anima a boca
 * pelo tempo aproximado de leitura, para o personagem não ficar parado.
 */
export function falar(texto: string, boca: EstadoDaBoca, comSom: boolean): Fala {
  let parado = false;
  let encerrar: () => void = () => {};
  const terminou = new Promise<void>((resolve) => {
    encerrar = () => {
      boca.falando = false;
      resolve();
    };
  });

  if (!comSom || !temVoz()) {
    boca.falando = true;
    boca.palavra = performance.now();
    const palavras = texto.split(/\s+/).filter(Boolean).length;
    const tempo = Math.min(20000, 600 + palavras * 330);
    const relogio = window.setInterval(() => (boca.palavra = performance.now()), 330);
    const fim = window.setTimeout(() => {
      window.clearInterval(relogio);
      encerrar();
    }, tempo);
    return {
      parar: () => {
        window.clearTimeout(fim);
        window.clearInterval(relogio);
        encerrar();
      },
      terminou,
    };
  }

  const sintese = window.speechSynthesis;
  sintese.cancel();
  const voz = vozPtBr();
  const frases = frasesParaFalar(texto);
  let i = 0;
  const proxima = () => {
    if (parado || i >= frases.length) return encerrar();
    const u = new SpeechSynthesisUtterance(frases[i++]);
    u.lang = voz?.lang ?? 'pt-BR';
    if (voz) u.voice = voz;
    u.rate = 1.02;
    u.pitch = 0.95;
    u.onstart = () => {
      boca.falando = true;
      boca.palavra = performance.now();
    };
    u.onboundary = () => (boca.palavra = performance.now());
    u.onend = proxima;
    u.onerror = proxima;
    sintese.speak(u);
  };
  proxima();
  // Alguns aparelhos nunca disparam onstart: a boca mexe assim mesmo.
  boca.falando = true;
  boca.palavra = performance.now();
  // E alguns nunca disparam onend: encerra pelo tempo de leitura, com folga.
  const palavras = texto.split(/\s+/).filter(Boolean).length;
  const seguranca = window.setTimeout(() => {
    parado = true;
    encerrar();
  }, 4000 + palavras * 700);
  void terminou.then(() => window.clearTimeout(seguranca));
  return {
    parar: () => {
      parado = true;
      sintese.cancel();
      encerrar();
    },
    terminou,
  };
}

// ---------------------------------------------------------------------------
// Escuta (microfone)

interface ResultadoReconhecimento {
  results: { [i: number]: { [j: number]: { transcript: string } }; length: number };
}
interface Reconhecimento {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: ResultadoReconhecimento) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type ConstrutorReconhecimento = new () => Reconhecimento;

function construtor(): ConstrutorReconhecimento | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: ConstrutorReconhecimento; webkitSpeechRecognition?: ConstrutorReconhecimento };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const temMicrofone = (): boolean => construtor() !== null;

export interface Escuta {
  parar(): void;
  texto: Promise<string>;
}

/** Ouve uma pergunta. Resolve com o texto ('' se não ouviu nada); rejeita com mensagem clara. */
export function ouvir(): Escuta {
  const C = construtor();
  if (!C) return { parar: () => {}, texto: Promise.reject(new Error('Este navegador não tem reconhecimento de voz. Digite a pergunta.')) };
  const r = new C();
  r.lang = 'pt-BR';
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.continuous = false;
  const texto = new Promise<string>((resolve, reject) => {
    let ouvido = '';
    r.onresult = (e) => {
      const ultimo = e.results[e.results.length - 1];
      ouvido = ultimo?.[0]?.transcript?.trim() ?? '';
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      reject(new Error(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'O microfone foi bloqueado. Libere o microfone para este site ou digite a pergunta.' : 'Não deu para ouvir. Tente de novo ou digite a pergunta.'));
    };
    r.onend = () => resolve(ouvido);
  });
  try {
    r.start();
  } catch {
    return { parar: () => {}, texto: Promise.reject(new Error('Não deu para ligar o microfone. Digite a pergunta.')) };
  }
  return { parar: () => r.stop(), texto };
}
