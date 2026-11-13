/**
 * Ajustes do interior pelo desenho (clique e arraste): traduz "esta divisória
 * para cá" e "esta prateleira para lá" em mudanças no formulário. O motor
 * (calcularModulo) confere tudo de novo; aqui só se respeita a faixa que ele
 * aceita, para o desenho nunca propor uma medida inválida.
 */
import {
  dmm,
  encaixarNoFuro,
  fixarPrateleira,
  formatarMm,
  lerMm,
  limitesDivisoria,
  limitesPrateleira,
  linhasDePino,
  moverDivisoria,
  SISTEMA_32,
  vaosLivres,
  type Dmm,
  type ResultadoModulo,
} from "@marcenaria/core";
import type { VaoForm } from "./formulario";

export type Alvo =
  | { tipo: "divisoria"; k: number }
  | { tipo: "prateleira"; vao: number; j: number }
  | { tipo: "vao"; vao: number };

/** Que parte do interior é esta peça (ou a área livre do vão: "vao_N"). */
export function alvoDe(id: string | null): Alvo | null {
  if (!id) return null;
  let m = /^divisoria_(\d+)$/.exec(id);
  if (m) return { tipo: "divisoria", k: Number(m[1]) };
  m = /^prateleira_v(\d+)_(\d+)$/.exec(id);
  if (m) return { tipo: "prateleira", vao: Number(m[1]), j: Number(m[2]) - 1 };
  m = /^vao_(\d+)$/.exec(id);
  if (m) return { tipo: "vao", vao: Number(m[1]) };
  return null;
}

const medida = (r: ResultadoModulo, k: string) => (r.medidas[k] ?? 0) as number;

/** Prateleiras do vão, de baixo para cima: altura da face de baixo a partir do fundo interno, e o tipo. */
export function prateleirasDoVao(r: ResultadoModulo, vao: number): { posicoes: Dmm[]; regulavel: boolean } {
  const lista = r.componentes
    .filter((c) => c.id.startsWith(`prateleira_v${vao}_`))
    .sort((a, b) => a.caixa.y - b.caixa.y);
  return {
    posicoes: lista.map((c) => dmm(c.caixa.y - medida(r, "yi"))),
    regulavel: lista.some((c) => c.papel === "prateleira_regulavel"),
  };
}

export interface Faixa {
  /** Valor atual (dmm): largura do vão à esquerda da divisória, ou altura da prateleira. */
  atual: Dmm;
  min: Dmm;
  max: Dmm;
  /** Só a prateleira regulável: as linhas da fileira de furos (ela anda de furo em furo). */
  linhas: Dmm[] | null;
}

/** Faixa permitida para arrastar ou digitar. null se a peça não existe no resultado. */
export function faixaDe(r: ResultadoModulo, alvo: Alvo): Faixa | null {
  if (alvo.tipo === "divisoria") {
    const larguras = r.vaos.map((v) => v.largura);
    if (alvo.k < 1 || alvo.k >= larguras.length) return null;
    return { atual: larguras[alvo.k - 1] as Dmm, ...limitesDivisoria(larguras, alvo.k), linhas: null };
  }
  if (alvo.tipo === "prateleira") {
    const { posicoes, regulavel } = prateleirasDoVao(r, alvo.vao);
    const atual = posicoes[alvo.j];
    if (atual === undefined) return null;
    const Hi = dmm(medida(r, "Hi"));
    const lim = limitesPrateleira(Hi, dmm(medida(r, "e")), posicoes, alvo.j);
    return { atual, ...lim, linhas: regulavel ? linhasDePino(Hi, dmm(medida(r, "mp")), SISTEMA_32.passo) : null };
  }
  return null;
}

/** Leva um valor pedido para dentro da faixa: mm inteiros, ou a linha de furo mais perto. null se não houver lugar. */
export function ajustarValor(faixa: Faixa, pedido: number): Dmm | null {
  if (faixa.linhas) return encaixarNoFuro(pedido, faixa.linhas, faixa);
  const mmInteiro = Math.round(pedido / 10) * 10;
  const min = Math.ceil(faixa.min / 10) * 10;
  const max = Math.floor(faixa.max / 10) * 10;
  if (min > max) return null;
  return dmm(Math.min(max, Math.max(min, mmInteiro)));
}

/** Próximo valor ao apertar "subir/descer" ou "para a direita/esquerda": 1 mm, 10 mm, ou o próximo furo. */
export function passo(faixa: Faixa, sentido: 1 | -1, grande: boolean): Dmm | null {
  if (faixa.linhas) {
    const candidatas = faixa.linhas.filter((l) => l >= faixa.min && l <= faixa.max && (sentido > 0 ? l > faixa.atual : l < faixa.atual));
    if (candidatas.length === 0) return null;
    return sentido > 0 ? (candidatas[0] as Dmm) : (candidatas.at(-1) as Dmm);
  }
  // Primeiro passo de uma medida quebrada (209,4) vai para o mm inteiro seguinte (210).
  const base = sentido > 0 ? Math.floor(faixa.atual / 10) * 10 : Math.ceil(faixa.atual / 10) * 10;
  const novo = ajustarValor(faixa, base + sentido * (grande ? 100 : 10));
  return novo === faixa.atual ? null : novo;
}

const textoMm = (v: Dmm | null) => (v === null ? "" : formatarMm(v));

function fixasDoFormulario(vaos: readonly VaoForm[]): Array<Dmm | null> {
  return vaos.map((v) => {
    if (!v.largura.trim()) return null;
    try {
      return lerMm(v.largura);
    } catch {
      return null;
    }
  });
}

export type Mudanca = { vaos: VaoForm[]; erro: null } | { vaos: null; erro: string };

const foraDaFaixa = (f: Faixa, oQue: string): Mudanca => ({
  vaos: null,
  erro: `${oQue} precisa ficar entre ${formatarMm(f.min)} e ${formatarMm(f.max)} mm.`,
});

/** Divisória k: o vão da esquerda passa a ter `larguraEsquerda`; só os vizinhos mudam. */
export function moverDivisoriaNoFormulario(vaos: readonly VaoForm[], r: ResultadoModulo, k: number, larguraEsquerda: number): Mudanca {
  const faixa = faixaDe(r, { tipo: "divisoria", k });
  if (!faixa) return { vaos: null, erro: "Divisória não encontrada. Calcule o móvel de novo." };
  const valor = ajustarValor(faixa, larguraEsquerda);
  if (valor === null || Math.abs(valor - larguraEsquerda) >= 10) return foraDaFaixa(faixa, `O vão ${k}`);
  const novas = moverDivisoria(
    r.vaos.map((v) => v.largura),
    fixasDoFormulario(vaos),
    k,
    valor,
  );
  if (!novas) return foraDaFaixa(faixa, `O vão ${k}`);
  return { vaos: vaos.map((v, i) => ({ ...v, largura: textoMm(novas[i] ?? null) })), erro: null };
}

/** Prateleira j do vão: vai para `altura` (as outras do vão ficam onde estão). */
export function moverPrateleiraNoFormulario(vaos: readonly VaoForm[], r: ResultadoModulo, vao: number, j: number, altura: number): Mudanca {
  const faixa = faixaDe(r, { tipo: "prateleira", vao, j });
  if (!faixa) return { vaos: null, erro: "Prateleira não encontrada. Calcule o móvel de novo." };
  const valor = ajustarValor(faixa, altura);
  if (valor === null) return foraDaFaixa(faixa, "A prateleira");
  // Fora da faixa por mais que um encaixe de furo: avisa em vez de levar para outro lugar.
  const tolerancia = faixa.linhas ? SISTEMA_32.passo / 2 + 1 : 10;
  if (Math.abs(valor - altura) >= tolerancia) return foraDaFaixa(faixa, "A prateleira");
  const { posicoes } = prateleirasDoVao(r, vao);
  const novas = fixarPrateleira(posicoes, j, valor);
  return {
    vaos: vaos.map((v, i) => (i === vao - 1 ? { ...v, alturas: novas.map((p) => textoMm(p)) } : v)),
    erro: null,
  };
}

/** Vão livre abaixo e acima da prateleira j, para mostrar ao lado da altura. */
export function livresDaPrateleira(r: ResultadoModulo, vao: number, j: number): { abaixo: Dmm; acima: Dmm } | null {
  const { posicoes } = prateleirasDoVao(r, vao);
  if (posicoes[j] === undefined) return null;
  const livres = vaosLivres(dmm(medida(r, "Hi")), dmm(medida(r, "e")), posicoes);
  return { abaixo: livres[j] as Dmm, acima: livres[j + 1] as Dmm };
}
