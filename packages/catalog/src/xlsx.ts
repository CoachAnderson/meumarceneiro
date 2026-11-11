/**
 * Gerador mínimo de planilha Excel (.xlsx), sem dependência pesada.
 * Um .xlsx é um zip de XMLs; aqui saem só os necessários. Números vão como
 * número (dá para somar no Excel), dinheiro com formato de moeda.
 */
import { strToU8, zipSync } from 'fflate';

export type EstiloCelula = 'negrito' | 'dinheiro' | 'decimal';
export type Celula = string | number | null | { v: string | number; estilo: EstiloCelula };

export interface Planilha {
  /** Nome da aba (até 31 caracteres; sem \ / ? * [ ] :). */
  nome: string;
  /** Larguras das colunas, em caracteres. */
  larguras?: number[];
  linhas: Celula[][];
}

const ESTILO: Record<EstiloCelula, number> = { negrito: 1, dinheiro: 2, decimal: 3 };

function xml(texto: string): string {
  return texto
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 0 → A, 25 → Z, 26 → AA. */
export function letraColuna(indice: number): string {
  let s = '';
  for (let n = indice + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function nomeAba(nome: string): string {
  const limpo = nome.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31);
  return limpo || 'Planilha';
}

function celula(c: Celula, ref: string): string {
  if (c === null || c === '') return '';
  const v = typeof c === 'object' ? c.v : c;
  const s = typeof c === 'object' ? ` s="${ESTILO[c.estilo]}"` : '';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`Número inválido na célula ${ref}.`);
    return `<c r="${ref}"${s}><v>${v}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
}

function aba(p: Planilha): string {
  const cols = p.larguras?.length
    ? `<cols>${p.larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const linhas = p.linhas
    .map((l, i) => `<row r="${i + 1}">${l.map((c, j) => celula(c, `${letraColuna(j)}${i + 1}`)).join('')}</row>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${linhas}</sheetData></worksheet>`;
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="0.0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function gerarXlsx(planilhas: Planilha[]): Uint8Array {
  if (planilhas.length === 0) throw new Error('Informe pelo menos uma planilha.');
  const nomes = planilhas.map((p) => nomeAba(p.nome));
  if (new Set(nomes.map((n) => n.toLowerCase())).size !== nomes.length) throw new Error('Nomes de aba repetidos.');
  const arquivos: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${planilhas
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join('')}</Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nomes
        .map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${planilhas
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join('')}<Relationship Id="rId${planilhas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/styles.xml': strToU8(ESTILOS),
  };
  planilhas.forEach((p, i) => {
    arquivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(aba(p));
  });
  return zipSync(arquivos, { level: 6 });
}
