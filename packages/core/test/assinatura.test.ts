import { describe, expect, it } from 'vitest';
import { DIAS_TESTE, OFERTAS, resumirAcesso, type SituacaoAssinatura } from '../src';

const AGORA = '2026-11-11T12:00:00.000Z';
const em = (dias: number) => new Date(Date.parse(AGORA) + dias * 86_400_000).toISOString();
const sit = (p: Partial<SituacaoAssinatura>): SituacaoAssinatura => ({ liberada: true, teste_ate: em(-30), paga_ate: null, status: null, agora: AGORA, ...p });

describe('plano', () => {
  it('um plano mensal de R$ 149,00, em reais, cobrado todo mês', () => {
    expect(Object.keys(OFERTAS)).toEqual(['mensal']);
    expect(OFERTAS.mensal).toMatchObject({ valorCentavos: 14900, frequency: 1, frequency_type: 'months', currency_id: 'BRL' });
    expect(DIAS_TESTE).toBe(14);
  });
});

describe('resumo do acesso', () => {
  it('teste: conta os dias que faltam, para cima', () => {
    expect(resumirAcesso(sit({ teste_ate: em(14) }))).toEqual({ tipo: 'teste', diasRestantes: 14, ate: em(14) });
    expect(resumirAcesso(sit({ teste_ate: em(0.2) })).diasRestantes).toBe(1);
    expect(resumirAcesso(sit({ teste_ate: em(2.01) })).diasRestantes).toBe(3);
  });

  it('assinatura em dia vale mais que o teste', () => {
    expect(resumirAcesso(sit({ teste_ate: em(5), paga_ate: em(20), status: 'ativa' }))).toEqual({ tipo: 'ativa', diasRestantes: 20, ate: em(20) });
  });

  it('pausada ou cancelada com período pago: encerrando', () => {
    expect(resumirAcesso(sit({ paga_ate: em(4), status: 'cancelada' })).tipo).toBe('encerrando');
    expect(resumirAcesso(sit({ paga_ate: em(4), status: 'pausada' })).tipo).toBe('encerrando');
  });

  it('sem teste e sem período pago: bloqueada', () => {
    expect(resumirAcesso(sit({}))).toEqual({ tipo: 'bloqueada', diasRestantes: 0, ate: null });
    expect(resumirAcesso(sit({ paga_ate: em(-1), status: 'ativa' })).tipo).toBe('bloqueada');
    expect(resumirAcesso(sit({ status: 'pendente' })).tipo).toBe('bloqueada');
    // No instante exato do vencimento já não vale.
    expect(resumirAcesso(sit({ teste_ate: AGORA })).tipo).toBe('bloqueada');
  });

  it('usa o relógio do banco, não o do aparelho', () => {
    expect(() => resumirAcesso(sit({ agora: 'ontem' }))).toThrow();
  });
});
