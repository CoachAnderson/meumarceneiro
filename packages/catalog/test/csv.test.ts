import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ErroCsv, detectarSeparador, lerCsv, linhaCsv } from '../src';

describe('detectarSeparador()', () => {
  it('reconhece ponto e vírgula, vírgula e tabulação', () => {
    expect(detectarSeparador('a;b;c\n1;2;3')).toBe(';');
    expect(detectarSeparador('a,b,c\n1,2,3')).toBe(',');
    expect(detectarSeparador('a\tb\tc')).toBe('\t');
  });

  it('ignora separadores dentro de aspas', () => {
    expect(detectarSeparador('"a,b,c";d\n')).toBe(';');
  });
});

describe('lerCsv()', () => {
  it('lê cabeçalho e registros com o número da linha da planilha', () => {
    const r = lerCsv('nome;espessura\nMDF Branco;18\nMDF Preto;15\n');
    expect(r.cabecalho).toEqual(['nome', 'espessura']);
    expect(r.registros).toEqual([
      { linha: 2, campos: ['MDF Branco', '18'] },
      { linha: 3, campos: ['MDF Preto', '15'] },
    ]);
  });

  it('remove o BOM do Excel e aceita CRLF', () => {
    const r = lerCsv('﻿nome;espessura\r\nMDF;18\r\n');
    expect(r.cabecalho[0]).toBe('nome');
    expect(r.registros[0]?.campos).toEqual(['MDF', '18']);
  });

  it('aceita aspas, aspas duplicadas, separador e quebra de linha dentro do campo', () => {
    const r = lerCsv('nome;obs\n"MDF ""Premium""";"linha 1\nlinha 2"\n"A;B";x\n');
    expect(r.registros).toEqual([
      { linha: 2, campos: ['MDF "Premium"', 'linha 1\nlinha 2'] },
      { linha: 4, campos: ['A;B', 'x'] },
    ]);
  });

  it('pula linhas vazias sem perder a numeração', () => {
    const r = lerCsv('nome;e\n\nMDF;18\n;\nMDP;15');
    expect(r.registros.map((x) => x.linha)).toEqual([3, 5]);
  });

  it('acusa aspas abertas com a linha onde começaram', () => {
    expect(() => lerCsv('nome;e\n"MDF;18\nMDP;15')).toThrow(ErroCsv);
    try {
      lerCsv('nome;e\n"MDF;18\nMDP;15');
    } catch (e) {
      expect((e as ErroCsv).linha).toBe(2);
    }
  });

  it('acusa planilha vazia', () => {
    expect(() => lerCsv('\n\n')).toThrow('vazia');
  });

  it('ida e volta: escrever com linhaCsv e ler devolve os mesmos campos', () => {
    const campo = fc.string({ maxLength: 20 }).map((s) => s.trim()).filter((s) => !s.includes('\r'));
    fc.assert(
      fc.property(fc.array(fc.array(campo, { minLength: 3, maxLength: 3 }), { minLength: 1, maxLength: 10 }), (linhas) => {
        const cabecalho = ['a', 'b', 'c'];
        const comConteudo = linhas.filter((l) => l.some((c) => c !== ''));
        const texto = [linhaCsv(cabecalho), ...comConteudo.map((l) => linhaCsv(l))].join('\n');
        const r = lerCsv(texto, ';');
        return JSON.stringify(r.registros.map((x) => x.campos)) === JSON.stringify(comConteudo);
      }),
    );
  });
});
