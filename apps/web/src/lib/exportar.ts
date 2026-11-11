import { formatarMm, type Dmm } from '@marcenaria/core';

/** Texto para uma célula CSV (separador ponto e vírgula, padrão do Excel em português). */
function celula(valor: string | number): string {
  const t = String(valor);
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function paraCsv(linhas: ReadonlyArray<ReadonlyArray<string | number>>): string {
  // BOM para o Excel reconhecer UTF-8.
  return '﻿' + linhas.map((l) => l.map(celula).join(';')).join('\r\n') + '\r\n';
}

export function baixarTexto(nome: string, conteudo: string, tipo = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Medida em mm com vírgula decimal, sem unidade. */
export const mmBr = (m: Dmm): string => formatarMm(m);

/** Metros com duas casas, a partir de décimos de mm (arredonda só na exibição). */
export function metros(m: Dmm): string {
  return (m / 10000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Baixa um arquivo binário (por exemplo, .xlsx). */
export function baixarBytes(nome: string, bytes: Uint8Array, tipo: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
