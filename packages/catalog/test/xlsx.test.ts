import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { gerarXlsx, letraColuna } from '../src';

describe('gerarXlsx()', () => {
  const arquivo = gerarXlsx([
    { nome: 'Orçamento', larguras: [30, 12], linhas: [[{ v: 'Item', estilo: 'negrito' }, { v: 'Valor', estilo: 'negrito' }], ['Chapa <MDF> & "fita"', { v: 659.8, estilo: 'dinheiro' }], ['Qtd', 3], [null, '']] },
    { nome: 'Peças/corte: [1]', linhas: [['P01', 700, 550]] },
  ]);
  const zip = unzipSync(arquivo);

  it('tem as partes de um .xlsx', () => {
    expect(Object.keys(zip).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
  });

  it('números como número, texto escapado, estilos aplicados', () => {
    const s = strFromU8(zip['xl/worksheets/sheet1.xml']!);
    expect(s).toContain('<c r="B2" s="2"><v>659.8</v></c>');
    expect(s).toContain('Chapa &lt;MDF&gt; &amp; &quot;fita&quot;');
    expect(s).toContain('<c r="A1" s="1" t="inlineStr">');
    expect(s).toContain('<c r="B3"><v>3</v></c>');
    expect(s).toContain('<row r="4"></row>');
  });

  it('nome de aba sem caracteres proibidos', () => {
    expect(strFromU8(zip['xl/workbook.xml']!)).toContain('name="Peças corte   1"');
  });

  it('recusa abas repetidas, lista vazia e número inválido', () => {
    expect(() => gerarXlsx([])).toThrow();
    expect(() => gerarXlsx([{ nome: 'A', linhas: [] }, { nome: 'a', linhas: [] }])).toThrow();
    expect(() => gerarXlsx([{ nome: 'A', linhas: [[NaN]] }])).toThrow();
  });

  it('letras de coluna', () => {
    expect([0, 25, 26, 27, 701, 702].map(letraColuna)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });
});
