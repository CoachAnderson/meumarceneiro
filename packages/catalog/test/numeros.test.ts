import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ErroCampo,
  centavosParaTexto,
  formatarCmm,
  formatarMetros,
  formatarMoeda,
  lerDecimalEscalado,
  lerEspessuraCmm,
  lerInteiroNaoNegativo,
  lerMetrosEmDmm,
  lerPrecoCentavos,
} from '../src';

describe('lerPrecoCentavos()', () => {
  it('lê os formatos que aparecem em planilhas brasileiras', () => {
    expect(lerPrecoCentavos('329,90')).toBe(32990);
    expect(lerPrecoCentavos('R$ 1.234,56')).toBe(123456);
    expect(lerPrecoCentavos('R$ 1.234,5')).toBe(123450);
    expect(lerPrecoCentavos('1234.56')).toBe(123456);
    expect(lerPrecoCentavos('1.234')).toBe(123400);
    expect(lerPrecoCentavos('12.5')).toBe(1250);
    expect(lerPrecoCentavos('0,89')).toBe(89);
    expect(lerPrecoCentavos('300')).toBe(30000);
    expect(lerPrecoCentavos('1.000.000,00')).toBe(100000000);
  });

  it('recusa valores ambíguos ou inválidos', () => {
    for (const t of ['1,234,56', '12.34,5', '1,999', '-10', 'abc', '']) {
      expect(() => lerPrecoCentavos(t), t).toThrow(ErroCampo);
    }
  });

  it('ida e volta com centavosParaTexto', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 100_000_000 }), (c) => lerPrecoCentavos(centavosParaTexto(c)) === c));
  });

  it('formata em reais', () => {
    expect(formatarMoeda(123456)).toBe('R$ 1.234,56');
    expect(formatarMoeda(null)).toBe('');
  });
});

describe('medidas de fita e metragem', () => {
  it('espessura de fita em centésimos de mm', () => {
    expect(lerEspessuraCmm('0,45')).toBe(45);
    expect(lerEspessuraCmm('0.4')).toBe(40);
    expect(lerEspessuraCmm('1')).toBe(100);
    expect(lerEspessuraCmm('2 mm')).toBe(200);
    expect(() => lerEspessuraCmm('0,455')).toThrow('2 casas');
    expect(formatarCmm(45)).toBe('0,45');
    expect(formatarCmm(100)).toBe('1');
    expect(formatarCmm(150)).toBe('1,5');
  });

  it('metros em décimos de mm, com precisão de 0,1 mm', () => {
    expect(lerMetrosEmDmm('50')).toBe(500000);
    expect(lerMetrosEmDmm('12,5 m')).toBe(125000);
    expect(lerMetrosEmDmm('0,0001')).toBe(1);
    expect(() => lerMetrosEmDmm('0,00005')).toThrow(ErroCampo);
    expect(formatarMetros(125000)).toBe('12,5');
    expect(formatarMetros(500000)).toBe('50');
  });

  it('ida e volta de metros', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), (d) => lerMetrosEmDmm(formatarMetros(d)) === d));
  });
});

describe('lerDecimalEscalado() e inteiros', () => {
  it('aceita casas extras só se forem zeros', () => {
    expect(lerDecimalEscalado('18,500', 1, 'x')).toBe(185);
    expect(() => lerDecimalEscalado('18,55', 1, 'x')).toThrow('1 casa decimal');
  });

  it('estoque de chapas precisa ser inteiro', () => {
    expect(lerInteiroNaoNegativo('12', 'Estoque')).toBe(12);
    expect(() => lerInteiroNaoNegativo('1,5', 'Estoque')).toThrow('inteiro');
    expect(() => lerInteiroNaoNegativo('-1', 'Estoque')).toThrow(ErroCampo);
  });
});
