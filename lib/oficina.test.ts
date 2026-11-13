import { describe, expect, it } from 'vitest';
import { andamento, etapasDaPeca, proximaEtapa, type PecaOrdem } from './oficina';

const peca = (etapa: PecaOrdem['etapa'], tem_fita = true, tem_furo = true) => ({ etapa, tem_fita, tem_furo }) as PecaOrdem;

describe('etapas da peça', () => {
  it('pula fita e furo quando a peça não tem', () => {
    expect(etapasDaPeca(peca('a_cortar'))).toEqual(['a_cortar', 'cortada', 'fitada', 'furada', 'montada']);
    expect(etapasDaPeca(peca('a_cortar', false, false))).toEqual(['a_cortar', 'cortada', 'montada']);
    expect(proximaEtapa(peca('cortada', false, true))).toBe('furada');
    expect(proximaEtapa(peca('cortada', false, false))).toBe('montada');
    expect(proximaEtapa(peca('montada'))).toBeNull();
  });

  it('andamento conta cada etapa só entre as peças em que ela se aplica', () => {
    const a = andamento([peca('fitada'), peca('montada', false, false), peca('a_cortar', true, false)]);
    expect(a).toEqual({ total: 3, cortadas: 2, com_fita: 2, fitadas: 1, com_furo: 1, furadas: 0, montadas: 1 });
  });
});
