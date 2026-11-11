import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { calcularModulo, enderecoSceneViewer, mm, modeloParaAmbiente, modeloPadrao } from '../src';

const modulo = (L: number, A: number, P: number, portas = true) =>
  calcularModulo(modeloPadrao('tampo_base_entre_laterais', 'fundo_canal'), {
    L: mm(L), A: mm(A), P: mm(P), espessuraEstrutura: mm(18), espessuraFundo: mm(6),
    interior: { divisorias: 1 },
    frentes: portas ? { modo: 'sobreposta', espessuraFrente: mm(18), espessuraGaveta: mm(15), vaos: { tipo: 'porta', portas: 1, lado: 'esquerda' } } : undefined,
  });

describe('modelo para o ambiente', () => {
  it('800 × 720 × 550 com portas sobrepostas: tamanho real em metros (a porta soma 18 mm à profundidade)', () => {
    const r = modulo(800, 720, 550);
    expect(r.erros).toEqual([]);
    const m = modeloParaAmbiente(r.componentes);
    expect(m.dimensoes.map((v) => Math.round(v * 10000) / 10)).toEqual([800, 720, 568]);
    expect(m.caixas.length).toBe(r.componentes.length);
  });

  it('apoiado no chão, centrado, costas na parede, frente para quem olha', () => {
    const r = modulo(800, 720, 550);
    const m = modeloParaAmbiente(r.componentes);
    const min = (i: 0 | 1 | 2) => Math.min(...m.caixas.map((c) => c.centro[i] - c.tamanho[i] / 2));
    const max = (i: 0 | 1 | 2) => Math.max(...m.caixas.map((c) => c.centro[i] + c.tamanho[i] / 2));
    expect(min(1)).toBeCloseTo(0, 9);
    expect(min(0)).toBeCloseTo(-max(0), 9);
    expect(min(2)).toBeCloseTo(0, 9);
    // A porta é a peça mais à frente; o fundo, a mais atrás.
    const z = (papel: string) => m.caixas.find((c) => c.papel === papel)!.centro[2];
    expect(z('porta')).toBeGreaterThan(z('lateral'));
    expect(z('fundo')).toBeLessThan(z('lateral'));
    // A lateral esquerda fica à esquerda (x negativo).
    expect(m.caixas.find((c) => c.id === 'lateral_esquerda')!.centro[0]).toBeLessThan(0);
  });

  it('propriedade: o modelo tem exatamente o tamanho do móvel e nenhuma peça muda de medida', () => {
    fc.assert(
      fc.property(fc.integer({ min: 300, max: 3000 }), fc.integer({ min: 300, max: 2600 }), fc.integer({ min: 250, max: 700 }), (L, A, P) => {
        const r = modulo(L, A, P, false);
        fc.pre(r.valido);
        const m = modeloParaAmbiente(r.componentes);
        expect(m.dimensoes[0]).toBeCloseTo(L / 1000, 9);
        expect(m.dimensoes[1]).toBeCloseTo(A / 1000, 9);
        expect(m.dimensoes[2]).toBeCloseTo(P / 1000, 9);
        for (const [i, c] of r.componentes.entries()) {
          expect(m.caixas[i]!.tamanho).toEqual([c.caixa.dx / 10000, c.caixa.dy / 10000, c.caixa.dz / 10000]);
          for (const eixo of [0, 1, 2] as const) {
            expect(Math.abs(m.caixas[i]!.centro[eixo]) + m.caixas[i]!.tamanho[eixo] / 2).toBeLessThanOrEqual(Math.max(...m.dimensoes) + 1e-9);
          }
        }
      }),
    );
  });
});

describe('endereço do visualizador do Android', () => {
  it('trava o tamanho real e leva o arquivo e a volta', () => {
    const u = enderecoSceneViewer('https://x.supabase.co/storage/v1/object/sign/modelos-ar/a/b.glb?token=abc&x=1', 'Gabinete & pia', 'https://app.exemplo.com.br/projetos/1');
    expect(u.startsWith('intent://arvr.google.com/scene-viewer/1.0?')).toBe(true);
    expect(u).toContain('resizable=false');
    expect(u).toContain('mode=ar_preferred');
    expect(u).toContain('file=https%3A%2F%2Fx.supabase.co%2Fstorage%2Fv1%2Fobject%2Fsign%2Fmodelos-ar%2Fa%2Fb.glb%3Ftoken%3Dabc%26x%3D1');
    expect(u).toContain('title=Gabinete%20%26%20pia');
    expect(u).toContain('S.browser_fallback_url=https%3A%2F%2Fapp.exemplo.com.br%2Fprojetos%2F1;end;');
  });
  it('só aceita arquivo em https', () => {
    expect(() => enderecoSceneViewer('http://x/y.glb', 't', 'https://a')).toThrow();
    expect(() => enderecoSceneViewer('javascript:alert(1)', 't', 'https://a')).toThrow();
  });
});
