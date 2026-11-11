import { ErroCsv, lerCsv, linhaCsv, type RegistroCsv } from './csv';
import { ErroCampo } from './numeros';

/** Normaliza nome de coluna: sem acento, minúsculo, "_" no lugar de espaços. */
export function normalizarColuna(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export interface DefinicaoColuna<K extends string> {
  chave: K;
  /** Nome usado no modelo de planilha. */
  titulo: string;
  /** Outros nomes aceitos no cabeçalho (já normalizados). */
  apelidos: readonly string[];
  obrigatoria: boolean;
  exemplo: string;
  ajuda: string;
}

export interface ErroLinha {
  linha: number;
  mensagens: string[];
}

export interface ResultadoPlanilha<T> {
  validas: T[];
  erros: ErroLinha[];
  /** Erro que impede ler a planilha inteira (vazia, sem coluna obrigatória…). */
  erroGeral: string | null;
  colunasIgnoradas: string[];
  totalLinhas: number;
}

export type Leitor<K extends string> = (chave: K) => string;

/**
 * Lê o CSV, casa as colunas pelo nome e valida cada registro com `validar`.
 * `validar` recebe um leitor de campo e lança ErroCampo (um ou vários).
 */
export function processarPlanilha<K extends string, T>(
  texto: string,
  colunas: readonly DefinicaoColuna<K>[],
  validar: (ler: Leitor<K>, linha: number, mensagens: string[]) => T | null,
): ResultadoPlanilha<T> {
  const vazio = (erroGeral: string): ResultadoPlanilha<T> => ({
    validas: [],
    erros: [],
    erroGeral,
    colunasIgnoradas: [],
    totalLinhas: 0,
  });

  let registros: RegistroCsv[];
  let cabecalho: string[];
  try {
    ({ cabecalho, registros } = lerCsv(texto));
  } catch (e) {
    if (e instanceof ErroCsv) return vazio(e.message);
    throw e;
  }

  const indice = new Map<K, number>();
  const ignoradas: string[] = [];
  cabecalho.forEach((titulo, i) => {
    const n = normalizarColuna(titulo);
    const col = colunas.find((c) => normalizarColuna(c.titulo) === n || c.apelidos.includes(n));
    if (col && !indice.has(col.chave)) indice.set(col.chave, i);
    else if (titulo.trim()) ignoradas.push(titulo.trim());
  });

  const faltando = colunas.filter((c) => c.obrigatoria && !indice.has(c.chave)).map((c) => c.titulo);
  if (faltando.length > 0) {
    return {
      ...vazio(`Faltam colunas obrigatórias: ${faltando.join(', ')}. Use o modelo de planilha como referência.`),
      colunasIgnoradas: ignoradas,
    };
  }
  if (registros.length === 0) return { ...vazio('A planilha não tem linhas abaixo do cabeçalho.'), colunasIgnoradas: ignoradas };
  if (registros.length > 2000) {
    return { ...vazio(`A planilha tem ${registros.length} linhas; o máximo por importação é 2000.`), colunasIgnoradas: ignoradas };
  }

  const validas: T[] = [];
  const erros: ErroLinha[] = [];
  for (const r of registros) {
    const ler: Leitor<K> = (chave) => {
      const i = indice.get(chave);
      return i === undefined ? '' : (r.campos[i] ?? '').trim();
    };
    const mensagens: string[] = [];
    let item: T | null = null;
    try {
      item = validar(ler, r.linha, mensagens);
    } catch (e) {
      if (e instanceof ErroCampo) mensagens.push(e.message);
      else throw e;
    }
    if (mensagens.length > 0 || item === null) erros.push({ linha: r.linha, mensagens });
    else validas.push(item);
  }

  return { validas, erros, erroGeral: null, colunasIgnoradas: ignoradas, totalLinhas: registros.length };
}

/** Roda uma leitura de campo e guarda a mensagem em vez de parar na primeira. */
export function coletar<T>(mensagens: string[], fn: () => T): T | undefined {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ErroCampo) {
      mensagens.push(e.message);
      return undefined;
    }
    throw e;
  }
}

export function modeloCsv<K extends string>(colunas: readonly DefinicaoColuna<K>[], exemplos: readonly (readonly string[])[]): string {
  const linhas = [linhaCsv(colunas.map((c) => c.titulo)), ...exemplos.map((e) => linhaCsv(e))];
  // BOM: faz o Excel abrir com acentos corretos.
  return `﻿${linhas.join('\r\n')}\r\n`;
}

export function textoLimitado(valor: string, nome: string, min: number, max: number): string {
  const t = valor.trim();
  if (t.length < min) throw new ErroCampo(min <= 1 ? `${nome}: obrigatório.` : `${nome}: use pelo menos ${min} caracteres.`);
  if (t.length > max) throw new ErroCampo(`${nome}: no máximo ${max} caracteres.`);
  return t;
}

export function opcional<T>(valor: string, ler: (v: string) => T): T | undefined {
  return valor.trim() === '' ? undefined : ler(valor);
}
