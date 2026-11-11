import { describe, expect, it } from 'vitest';
import {
  ErroRegra,
  FUNDOS_PADRAO,
  FUNDO_CANAL,
  MONTAGENS_PADRAO,
  MONTAGEM_TAMPO_BASE_ENTRE_LATERAIS,
  compilarModelo,
  dependentesDe,
  ordenarTopologicamente,
  type DefinicaoRegra,
} from '../src';

function problemas(montagem: DefinicaoRegra, fundo: DefinicaoRegra = FUNDO_CANAL): string[] {
  try {
    compilarModelo(montagem, fundo);
  } catch (e) {
    if (e instanceof ErroRegra) return e.problemas;
    throw e;
  }
  return [];
}

const base = MONTAGEM_TAMPO_BASE_ENTRE_LATERAIS;

describe('regras padrão', () => {
  it('todas as combinações de montagem e fundo compilam', () => {
    for (const m of MONTAGENS_PADRAO) {
      for (const f of FUNDOS_PADRAO) {
        expect(() => compilarModelo(m, f), `${m.codigo}+${f.codigo}`).not.toThrow();
      }
    }
  });

  it('as medidas são calculadas em ordem de dependência, juntando montagem e fundo', () => {
    const modelo = compilarModelo(base, FUNDO_CANAL);
    const ordem = modelo.derivados.map((d) => d.nome);
    expect(ordem).toEqual(expect.arrayContaining(['Li', 'Hi', 'Pc', 'Pint']));
    // Pint usa só entradas e parâmetros; Li também. Nenhuma medida antes das que ela usa.
    const posicao = new Map(ordem.map((n, i) => [n, i]));
    for (const d of modelo.derivados) {
      for (const dep of modelo.dependencias.get(d.nome) ?? []) {
        if (posicao.has(dep)) expect(posicao.get(dep)!).toBeLessThan(posicao.get(d.nome)!);
      }
    }
  });
});

describe('compilação recusa regras com problema', () => {
  it('dependência circular, mostrando o caminho', () => {
    const r = problemas({ ...base, derivados: { ...base.derivados, X: 'Y + 1', Y: 'Z + 1', Z: 'X + 1' } });
    expect(r.some((p) => p.includes('Dependência circular') && p.includes('X → Y → Z → X'))).toBe(true);
  });

  it('nome desconhecido', () => {
    const r = problemas({ ...base, derivados: { ...base.derivados, Li: 'Largura - 2*e' } });
    expect(r.some((p) => p.includes('"Largura" não é entrada'))).toBe(true);
  });

  it('medida obrigatória do contrato ausente', () => {
    const { xi: _xi, ...semXi } = base.derivados;
    expect(problemas({ ...base, derivados: semXi })).toContain(`Montagem "${base.codigo}" precisa definir a medida xi.`);
  });

  it('id de componente repetido', () => {
    const r = problemas({ ...base, componentes: [...base.componentes, base.componentes[0]!] });
    expect(r.some((p) => p.includes('id repetido'))).toBe(true);
  });

  it('parâmetro com o mesmo nome de uma entrada', () => {
    const r = problemas({ ...base, parametros: [{ nome: 'e', rotulo: 'x', padrao: 1, min: 0, max: 2 }] });
    expect(r.some((p) => p.includes('"e" aparece em entradas do módulo'))).toBe(true);
  });

  it('erro de sintaxe com posição', () => {
    const r = problemas({ ...base, derivados: { ...base.derivados, Li: 'L / 2' } });
    expect(r.some((p) => p.includes('div_baixo') && p.includes('posição 3'))).toBe(true);
  });

  it('parâmetro com padrão fora dos limites', () => {
    const r = problemas({ ...base, parametros: [{ nome: 'k', rotulo: 'k', padrao: 50, min: 0, max: 10 }] });
    expect(r.some((p) => p.includes('"k" com limites'))).toBe(true);
  });

  it('montagem no lugar de fundo', () => {
    expect(problemas(base, base).some((p) => p.includes('não é uma regra de fundo'))).toBe(true);
  });

  it('junta todos os problemas numa única mensagem', () => {
    const r = problemas({ ...base, derivados: { ...base.derivados, Li: 'nada', Hi: '(' } });
    expect(r.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ordenarTopologicamente()', () => {
  it('ignora folhas que não são medidas derivadas', () => {
    const r = ordenarTopologicamente(new Map([['b', new Set(['a', 'L'])], ['a', new Set(['L'])]]));
    expect(r).toEqual({ ordem: ['a', 'b'] });
  });
});

describe('dependentesDe()', () => {
  const modelo = compilarModelo(base, FUNDO_CANAL);

  it('mudar a largura afeta tampo, base e fundo, mas não as laterais', () => {
    const d = dependentesDe(modelo, 'L');
    expect(d.has('#tampo')).toBe(true);
    expect(d.has('#base')).toBe(true);
    expect(d.has('#fundo')).toBe(true);
    expect(d.has('#lateral_esquerda')).toBe(false);
    expect(d.has('#lateral_direita')).toBe(false);
  });

  it('mudar a profundidade do canal afeta só o fundo', () => {
    const d = dependentesDe(modelo, 'c');
    expect([...d].filter((x) => x.startsWith('#'))).toEqual(['#fundo']);
  });

  it('mudar a espessura do fundo afeta a profundidade livre, não a caixa', () => {
    const d = dependentesDe(modelo, 'ef');
    expect(d.has('Pint')).toBe(true);
    expect(d.has('Pc')).toBe(false);
    expect(d.has('#lateral_esquerda')).toBe(false);
  });
});
