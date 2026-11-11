/**
 * Leitor de CSV (RFC 4180) para planilhas exportadas do Excel, LibreOffice e
 * Google Planilhas. Detecta o separador (";" — padrão do Excel em português —,
 * "," ou tabulação), aceita aspas, aspas duplicadas e quebras de linha dentro
 * de campos, e guarda o número da linha onde cada registro começa.
 */

export type Separador = ';' | ',' | '\t';

export interface RegistroCsv {
  /** Linha da planilha (1 = cabeçalho), para mensagens de erro. */
  linha: number;
  campos: string[];
}

export interface ResultadoCsv {
  separador: Separador;
  cabecalho: string[];
  registros: RegistroCsv[];
}

export class ErroCsv extends Error {
  readonly linha: number;

  constructor(mensagem: string, linha: number) {
    super(mensagem);
    this.name = 'ErroCsv';
    this.linha = linha;
  }
}

/** Escolhe o separador mais frequente fora de aspas na primeira linha. */
export function detectarSeparador(texto: string): Separador {
  const contagem: Record<Separador, number> = { ';': 0, ',': 0, '\t': 0 };
  let entreAspas = false;
  for (const c of texto) {
    if (c === '"') entreAspas = !entreAspas;
    else if (!entreAspas && (c === '\n' || c === '\r')) break;
    else if (!entreAspas && (c === ';' || c === ',' || c === '\t')) contagem[c]++;
  }
  // Empate favorece ";": em português a vírgula costuma ser decimal.
  if (contagem[';'] >= contagem[','] && contagem[';'] >= contagem['\t'] && contagem[';'] > 0) return ';';
  if (contagem['\t'] > contagem[',']) return '\t';
  if (contagem[','] > 0) return ',';
  return ';';
}

export function lerCsv(entrada: string, separador?: Separador): ResultadoCsv {
  const texto = entrada.replace(/^﻿/, '');
  const sep = separador ?? detectarSeparador(texto);

  const registros: RegistroCsv[] = [];
  let campos: string[] = [];
  let campo = '';
  let entreAspas = false;
  let campoComAspas = false;
  let linha = 1;
  let inicioRegistro = 1;
  let inicioAspas = 1;

  const fecharCampo = () => {
    campos.push(campoComAspas ? campo : campo.trim());
    campo = '';
    campoComAspas = false;
  };
  const fecharRegistro = () => {
    fecharCampo();
    if (campos.some((c) => c !== '')) registros.push({ linha: inicioRegistro, campos });
    campos = [];
  };

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (entreAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreAspas = false;
        }
      } else {
        if (c === '\n') linha++;
        if (c === '\r' && texto[i + 1] !== '\n') linha++;
        campo += c;
      }
      continue;
    }

    if (c === '"' && campo.trim() === '') {
      entreAspas = true;
      campoComAspas = true;
      campo = '';
      inicioAspas = linha;
    } else if (c === sep) {
      fecharCampo();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fecharRegistro();
      linha++;
      inicioRegistro = linha;
    } else if (campoComAspas) {
      // Texto depois da aspa de fechamento: "abc"def. Mantém, como o Excel.
      campo += c;
    } else {
      campo += c;
    }
  }

  if (entreAspas) {
    throw new ErroCsv(`Aspas abertas na linha ${inicioAspas} e nunca fechadas.`, inicioAspas);
  }
  if (campo !== '' || campos.length > 0) fecharRegistro();

  const [primeiro, ...resto] = registros;
  if (!primeiro) throw new ErroCsv('A planilha está vazia.', 1);

  return { separador: sep, cabecalho: primeiro.campos, registros: resto };
}

/** Gera uma linha CSV com ";" e aspas quando necessário. */
export function linhaCsv(campos: readonly string[], separador: Separador = ';'): string {
  return campos
    .map((c) => (c.includes(separador) || c.includes('"') || c.includes('\n') ? `"${c.replace(/"/g, '""')}"` : c))
    .join(separador);
}
