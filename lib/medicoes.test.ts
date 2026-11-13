// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { novaMedicao } from '@marcenaria/core';

vi.mock('./supabase', () => ({ supabase: {} }));
const { esquecerLocal, guardarLocal, lerLocal, pendentesLocais } = await import('./medicoes');

const registro = (id: string, pendente: boolean) => ({
  id,
  empresaId: 'e1',
  clienteId: null,
  titulo: 'Quarto',
  endereco: null,
  status: 'em_andamento' as const,
  dados: novaMedicao('p1'),
  versao: pendente ? null : 3,
  pendente,
  alteradoEm: '2026-11-12T18:00:00Z',
});

describe('medição guardada no aparelho', () => {
  beforeEach(() => localStorage.clear());

  it('guarda, lê de volta e lista só o que falta enviar', () => {
    expect(guardarLocal(registro('a', true))).toBe(true);
    expect(guardarLocal(registro('b', false))).toBe(true);
    expect(lerLocal('a')?.titulo).toBe('Quarto');
    expect(pendentesLocais('e1').map((r) => r.id)).toEqual(['a']);
    expect(pendentesLocais('outra')).toEqual([]);
  });

  it('esquecer tira do índice e do aparelho', () => {
    guardarLocal(registro('a', true));
    esquecerLocal('e1', 'a');
    expect(lerLocal('a')).toBeNull();
    expect(pendentesLocais('e1')).toEqual([]);
  });
});
