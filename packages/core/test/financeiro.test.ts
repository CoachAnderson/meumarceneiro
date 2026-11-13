import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  calcularBaixa,
  dataValida,
  diasEntre,
  dividirEmParcelas,
  fluxoDeCaixa,
  formatarReais,
  hojeBrasil,
  repetirMensal,
  resumir,
  saldoDaConta,
  situacao,
  somarMeses,
  type LancamentoBase,
} from '../src';

const l = (p: Partial<LancamentoBase>): LancamentoBase => ({
  tipo: 'receber',
  status: 'aberto',
  valor_centavos: 10000,
  vencimento: '2026-11-12',
  pago_em: null,
  valor_pago_centavos: null,
  conta_id: null,
  ...p,
});

describe('datas', () => {
  it('mês seguinte com o dia que existe: 31/01 vira 28/02 (29 no bissexto) e volta ao 31 em março', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29');
    expect(somarMeses('2026-01-31', 2)).toBe('2026-03-31');
    expect(somarMeses('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('datas inválidas e diferença em dias', () => {
    expect(dataValida('2026-02-30')).toBe(false);
    expect(dataValida('2026-2-3')).toBe(false);
    expect(dataValida('2028-02-29')).toBe(true);
    expect(diasEntre('2026-11-12', '2026-12-12')).toBe(30);
    expect(diasEntre('2026-03-01', '2026-02-28')).toBe(-1);
  });

  it('hoje é o dia de São Paulo (02:00 UTC ainda é o dia anterior)', () => {
    expect(hojeBrasil(new Date('2026-11-13T02:00:00Z'))).toBe('2026-11-12');
    expect(hojeBrasil(new Date('2026-11-13T03:00:00Z'))).toBe('2026-11-13');
  });
});

describe('parcelas', () => {
  it('R$ 10.000,00 com R$ 3.000,00 de entrada e 3× mensais: 2.333,34 + 2.333,33 + 2.333,33', () => {
    const p = dividirEmParcelas({ totalCentavos: 1_000_000, entradaCentavos: 300_000, parcelas: 3, primeiroVencimento: '2026-11-12', intervalo: 'mensal' });
    expect(p).toEqual([
      { numero: 0, de: 3, valorCentavos: 300_000, vencimento: '2026-11-12' },
      { numero: 1, de: 3, valorCentavos: 233_334, vencimento: '2026-12-12' },
      { numero: 2, de: 3, valorCentavos: 233_333, vencimento: '2027-01-12' },
      { numero: 3, de: 3, valorCentavos: 233_333, vencimento: '2027-02-12' },
    ]);
  });

  it('sem entrada, a 1ª parcela vence no primeiro vencimento; intervalo em dias (30/60/90)', () => {
    const p = dividirEmParcelas({ totalCentavos: 100, parcelas: 3, primeiroVencimento: '2026-11-30', intervalo: 30 });
    expect(p.map((x) => [x.valorCentavos, x.vencimento])).toEqual([
      [34, '2026-11-30'],
      [33, '2026-12-30'],
      [33, '2027-01-29'],
    ]);
  });

  it('mensal a partir do dia 31 mantém o 31 quando o mês tem', () => {
    const p = dividirEmParcelas({ totalCentavos: 400, parcelas: 4, primeiroVencimento: '2026-01-31', intervalo: 'mensal' });
    expect(p.map((x) => x.vencimento)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('à vista: só a entrada', () => {
    expect(dividirEmParcelas({ totalCentavos: 500, entradaCentavos: 500, parcelas: 0, primeiroVencimento: '2026-11-12', intervalo: 'mensal' })).toEqual([
      { numero: 0, de: 0, valorCentavos: 500, vencimento: '2026-11-12' },
    ]);
  });

  it('erros: entrada maior que o total, parcela de menos de 1 centavo, data inválida', () => {
    expect(() => dividirEmParcelas({ totalCentavos: 100, entradaCentavos: 200, parcelas: 1, primeiroVencimento: '2026-11-12', intervalo: 30 })).toThrow('entrada');
    expect(() => dividirEmParcelas({ totalCentavos: 2, parcelas: 3, primeiroVencimento: '2026-11-12', intervalo: 30 })).toThrow('1 centavo');
    expect(() => dividirEmParcelas({ totalCentavos: 100, parcelas: 1, primeiroVencimento: '2026-02-30', intervalo: 30 })).toThrow('Data inválida');
  });

  it('propriedade: a soma é sempre o total, os vencimentos crescem e a diferença entre parcelas é no máximo a sobra', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000_00 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 60 }),
        fc.oneof(fc.constant('mensal' as const), fc.integer({ min: 1, max: 90 })),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2035-12-31'), noInvalidDate: true }),
        (total, pctEntrada, n, intervalo, d) => {
          const entrada = n === 0 ? total : Math.floor((total * pctEntrada) / 100);
          if (n > 0 && total - entrada < n) return;
          const p = dividirEmParcelas({ totalCentavos: total, entradaCentavos: entrada, parcelas: n, primeiroVencimento: d.toISOString().slice(0, 10), intervalo });
          expect(p.reduce((s, x) => s + x.valorCentavos, 0)).toBe(total);
          for (let i = 1; i < p.length; i++) expect(p[i]!.vencimento >= p[i - 1]!.vencimento).toBe(true);
          const parcelas = p.filter((x) => x.numero > 0).map((x) => x.valorCentavos);
          if (parcelas.length) expect(Math.max(...parcelas) - Math.min(...parcelas)).toBeLessThan(parcelas.length);
        },
      ),
    );
  });

  it('repetir todo mês (aluguel): mesmo valor, dia ajustado', () => {
    expect(repetirMensal(150_000, '2026-12-31', 3).map((x) => [x.numero, x.valorCentavos, x.vencimento])).toEqual([
      [1, 150_000, '2026-12-31'],
      [2, 150_000, '2027-01-31'],
      [3, 150_000, '2027-02-28'],
    ]);
  });
});

describe('situação e baixa', () => {
  it('vencido, vence hoje, a vencer, pago, cancelado', () => {
    const hoje = '2026-11-12';
    expect(situacao(l({ vencimento: '2026-11-11' }), hoje)).toBe('vencido');
    expect(situacao(l({}), hoje)).toBe('vence_hoje');
    expect(situacao(l({ vencimento: '2026-11-13' }), hoje)).toBe('a_vencer');
    expect(situacao(l({ status: 'pago', vencimento: '2026-01-01' }), hoje)).toBe('pago');
    expect(situacao(l({ status: 'cancelado' }), hoje)).toBe('cancelado');
  });

  it('pagou a mais: juros; a menos e quitou: desconto; a menos e parcial: o resto fica em aberto', () => {
    expect(calcularBaixa(10000, 10250, false)).toEqual({ pagoCentavos: 10250, restanteCentavos: 0, diferencaCentavos: 250 });
    expect(calcularBaixa(10000, 9500, false)).toEqual({ pagoCentavos: 9500, restanteCentavos: 0, diferencaCentavos: -500 });
    expect(calcularBaixa(10000, 4000, true)).toEqual({ pagoCentavos: 4000, restanteCentavos: 6000, diferencaCentavos: 0 });
    expect(() => calcularBaixa(10000, 0, false)).toThrow();
  });
});

describe('resumo, fluxo e saldo', () => {
  const hoje = '2026-11-12';
  const lista: LancamentoBase[] = [
    l({ vencimento: '2026-11-01', valor_centavos: 50000 }), // vencido
    l({ vencimento: '2026-11-12', valor_centavos: 20000 }), // hoje
    l({ vencimento: '2026-11-18', valor_centavos: 30000 }), // em 6 dias
    l({ vencimento: '2026-12-10', valor_centavos: 40000 }), // em 28 dias
    l({ status: 'pago', vencimento: '2026-11-05', pago_em: '2026-11-06', valor_pago_centavos: 10500, conta_id: 'c1' }),
    l({ tipo: 'pagar', vencimento: '2026-11-15', valor_centavos: 70000 }),
    l({ tipo: 'pagar', status: 'pago', vencimento: '2026-11-10', pago_em: '2026-11-10', valor_centavos: 12000, valor_pago_centavos: 12000, conta_id: 'c1' }),
    l({ status: 'cancelado', valor_centavos: 999999 }),
  ];

  it('resumo conferido à mão', () => {
    const r = resumir(lista, hoje);
    expect(r.receber).toEqual({ vencido: 50000, hoje: 20000, proximos7: 50000, proximos30: 90000, noMes: 10500, qtdVencidos: 1 });
    expect(r.pagar).toEqual({ vencido: 0, hoje: 0, proximos7: 70000, proximos30: 70000, noMes: 12000, qtdVencidos: 0 });
  });

  it('fluxo por semana a partir de hoje: o vencido em aberto entra na primeira semana', () => {
    const f = fluxoDeCaixa(lista, 100000, hoje, '2026-11-25', 7);
    expect(f.map((p) => [p.inicio, p.fim, p.aReceber, p.aPagar, p.saldo])).toEqual([
      ['2026-11-12', '2026-11-18', 100000, 70000, 130000],
      ['2026-11-19', '2026-11-25', 0, 0, 130000],
    ]);
  });

  it('fluxo por mês, com o realizado pela data da baixa', () => {
    const f = fluxoDeCaixa(lista, 0, '2026-11-01', '2026-12-31', 'mes');
    expect(f.map((p) => [p.inicio, p.fim, p.entradas, p.saidas, p.aReceber, p.aPagar])).toEqual([
      ['2026-11-01', '2026-11-30', 10500, 12000, 100000, 70000],
      ['2026-12-01', '2026-12-31', 0, 0, 40000, 0],
    ]);
    expect(f[1]!.saldo).toBe(10500 - 12000 + 100000 - 70000 + 40000);
  });

  it('saldo da conta: inicial + recebido − pago por ela', () => {
    expect(saldoDaConta('c1', 100000, lista)).toBe(100000 + 10500 - 12000);
    expect(saldoDaConta('c1', 100000, lista, '2026-11-09')).toBe(110500);
    expect(saldoDaConta('c2', 0, lista)).toBe(0);
  });

  it('reais no padrão brasileiro', () => {
    expect(formatarReais(123456789)).toBe('R$ 1.234.567,89');
    expect(formatarReais(5)).toBe('R$ 0,05');
    expect(formatarReais(-150000)).toBe('−R$ 1.500,00');
  });
});
