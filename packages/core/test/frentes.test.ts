import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  caixaConfere,
  calcularModulo,
  colisoes,
  corredicaPara,
  dmm,
  dobradicasPorAltura,
  gerarListaPecas,
  mm,
  modeloPadrao,
  type Componente,
  type EntradaFrentes,
  type EntradaModulo,
  type ResultadoModulo,
} from '../src';

/** 600 × 700 × 550, MDF 18, fundo 6 em canal (8 mm, folga 1, a 10 da traseira). Li 564, Hi 664, Pint 534. */
const REF: EntradaModulo = { L: mm(600), A: mm(700), P: mm(550), espessuraEstrutura: mm(18), espessuraFundo: mm(6), parametros: { c: 80, g: 10, r: 100 } };
const FR: EntradaFrentes = { modo: 'sobreposta', espessuraFrente: mm(18), espessuraGaveta: mm(15), vaos: { tipo: 'porta' } };

function calc(e: Partial<EntradaModulo> = {}, f: Partial<EntradaFrentes> = {}, montagem = 'tampo_base_entre_laterais', fundo = 'fundo_canal'): ResultadoModulo {
  return calcularModulo(modeloPadrao(montagem, fundo), { ...REF, ...e, frentes: { ...FR, ...f } });
}
const por = (r: ResultadoModulo, id: string) => r.componentes.find((c) => c.id === id) as Componente;
const codigos = (r: ResultadoModulo) => r.erros.map((e) => e.codigo);

describe('regras de ferragem', () => {
  it('dobradiças pela altura da porta', () => {
    expect([mm(700), mm(900), mm(901), mm(1600), mm(2000), mm(2400), mm(2401)].map(dobradicasPorAltura)).toEqual([2, 2, 3, 3, 4, 5, null]);
  });
  it('maior corrediça comercial que cabe', () => {
    expect(corredicaPara(mm(524))).toBe(mm(500));
    expect(corredicaPara(mm(250))).toBe(mm(250));
    expect(corredicaPara(mm(249))).toBeNull();
  });
});

describe('portas (conferido à mão)', () => {
  it('uma porta sobreposta: 697 × 597, folga de 1,5 na borda, duas dobradiças retas', () => {
    const r = calc({}, { vaos: { tipo: 'porta', portas: 1, lado: 'esquerda' } });
    expect(r.erros).toEqual([]);
    const p = por(r, 'porta_v1');
    expect([p.comprimento, p.largura, p.espessura]).toEqual([mm(697), mm(597), mm(18)]);
    expect(p.caixa).toEqual({ x: 15, y: 15, z: -180, dx: mm(597), dy: mm(697), dz: mm(18) });
    // Copa a 5 + 17,5 = 22,5 mm da borda esquerda; a 100 mm do pé e do topo.
    expect(p.furos![0]!.centros).toEqual([
      { u: mm(100), v: 225 },
      { u: mm(597), v: 225 },
    ]);
    expect(r.ferragens).toEqual([
      expect.objectContaining({ codigo: 'dobradica_reta', quantidade: 2 }),
      expect.objectContaining({ codigo: 'puxador', quantidade: 1 }),
    ]);
  });

  it('dobradiças à direita: a copa fica a 22,5 da borda direita', () => {
    const r = calc({}, { vaos: { tipo: 'porta', lado: 'direita' } });
    expect(por(r, 'porta_v1').furos![0]!.centros[0]!.v).toBe(mm(597) - 225);
  });

  it('par de portas: 297 cada, 3 mm entre elas', () => {
    const r = calc({}, { vaos: { tipo: 'porta', portas: 2 } });
    const [a, b] = [por(r, 'porta_v1_1'), por(r, 'porta_v1_2')];
    expect([a.largura, b.largura]).toEqual([mm(297), mm(297)]);
    expect(b.caixa.x - (a.caixa.x + a.caixa.dx)).toBe(mm(3));
    expect(r.ferragens.find((f) => f.codigo === 'dobradica_reta')!.quantidade).toBe(4);
  });

  it('meia-sobreposição na divisória: cada porta cobre metade dela menos meia folga; dobradiça curva', () => {
    const r = calc({ interior: { divisorias: 1 } }, { vaos: [{ tipo: 'porta', lado: 'esquerda' }, { tipo: 'porta', lado: 'esquerda' }] });
    expect(r.erros).toEqual([]);
    const [a, b] = [por(r, 'porta_v1'), por(r, 'porta_v2')];
    // Divisória de 291 a 309: a porta 1 vai até 298,5; a 2 começa em 301,5.
    expect(a.caixa.x + a.caixa.dx).toBe(2985);
    expect(b.caixa.x).toBe(3015);
    expect([a.largura, b.largura]).toEqual([mm(297), mm(297)]);
    expect(r.ferragens.map((f) => [f.codigo, f.quantidade])).toEqual([
      ['dobradica_reta', 2],
      ['dobradica_curva', 2],
      ['puxador', 2],
    ]);
  });

  it('tampo sobre as laterais: a porta para embaixo do tampo', () => {
    const r = calc({ parametros: {} }, {}, 'tampo_sobre_laterais', 'fundo_sobreposto');
    expect(por(r, 'porta_v1').comprimento).toBe(mm(679)); // 700 − 18 − 2 × 1,5
  });

  it('embutida: boca do vão − 2 mm por lado; precisa de recuo nas prateleiras', () => {
    const sem = calc({ interior: { divisorias: 0, prateleiras: { quantidade: 1, tipo: 'fixa' } } }, { modo: 'embutida' });
    expect(codigos(sem)).toContain('frente_embutida_recuo');
    const com = calc({ parametros: { c: 80, g: 10, r: 100, rfp: 200 }, interior: { divisorias: 0, prateleiras: { quantidade: 1, tipo: 'fixa' } } }, { modo: 'embutida' });
    expect(com.erros).toEqual([]);
    const p = por(com, 'porta_v1');
    expect([p.comprimento, p.largura]).toEqual([mm(660), mm(560)]);
    expect(p.caixa.z).toBe(0);
    expect(com.ferragens[0]!.codigo).toBe('dobradica_supercurva');
  });

  it('porta alta demais e porta baixa demais', () => {
    expect(codigos(calc({ A: mm(2500) }))).toContain('porta_alta');
    expect(codigos(calc({ A: mm(200) }))).toContain('porta_baixa');
  });

  it('porta larga gera aviso, não erro', () => {
    const r = calc({ L: mm(800) });
    expect(r.erros).toEqual([]);
    expect(r.avisos.map((a) => a.codigo)).toContain('porta_larga');
  });
});

describe('gavetas (conferido à mão)', () => {
  const r = calc({}, { vaos: { tipo: 'gavetas', gavetas: 3 } });

  it('três frentes iguais dividindo 697 − 2 × 3 = 691 (230,3 cada; o 0,1 que sobra fica em cima)', () => {
    expect(r.erros).toEqual([]);
    const h = [1, 2, 3].map((k) => por(r, `gaveta_v1_${k}_frente`).largura);
    expect(h).toEqual([2303, 2303, 2303]);
    expect(por(r, 'gaveta_v1_1_frente').comprimento).toBe(mm(597));
  });

  it('caixa: corrediça de 500, 539 de largura, laterais de 175,4 de altura', () => {
    // Profundidade livre 534 − 10 de folga = 524 → corrediça de 500.
    expect(por(r, 'gaveta_v1_1_lateral_e').comprimento).toBe(mm(500));
    expect(por(r, 'gaveta_v1_1_fundo').comprimento).toBe(mm(539)); // 564 − 2 × 12,5
    expect(por(r, 'gaveta_v1_1_contrafrente').comprimento).toBe(mm(509)); // 539 − 2 × 15
    // faixa 664 / 3 = 221,3 − 40 de folga − 6 do fundo
    expect(por(r, 'gaveta_v1_1_lateral_e').largura).toBe(1753);
  });

  it('ferragens: 3 pares de corrediça de 500 e 3 puxadores', () => {
    expect(r.ferragens.map((f) => [f.codigo, f.quantidade, f.comprimento])).toEqual([
      ['corredica', 3, mm(500)],
      ['puxador', 3, undefined],
    ]);
  });

  it('lista: fita em volta da frente e em cima das peças da caixa', () => {
    const lista = gerarListaPecas({ resultado: r, montagem: 'tampo_base_entre_laterais', fundo: 'fundo_canal', espessuraFundo: mm(6) });
    const it_ = (papel: string) => lista.itens.find((i) => i.papel === papel)!;
    expect(it_('frente_gaveta').bordas).toEqual({ frente: true, tras: true, ext1: true, ext2: true });
    expect(it_('lateral_gaveta').bordas).toEqual({ frente: false, tras: true, ext1: false, ext2: false });
    expect(it_('lateral_gaveta').quantidade).toBe(6);
    expect(it_('fundo_gaveta').material).toBe('fundo');
  });

  it('erros: rasa, com prateleira, baixa demais', () => {
    expect(codigos(calc({ P: mm(270) }, { vaos: { tipo: 'gavetas', gavetas: 1 } }))).toContain('gaveta_rasa');
    expect(codigos(calc({ P: mm(280) }, { vaos: { tipo: 'gavetas', gavetas: 1 } }))).not.toContain('gaveta_rasa');
    expect(codigos(calc({ interior: { divisorias: 0, prateleiras: { quantidade: 1, tipo: 'fixa' } } }, { vaos: { tipo: 'gavetas', gavetas: 1 } }))).toContain('gaveta_com_prateleira');
    expect(codigos(calc({}, { vaos: { tipo: 'gavetas', gavetas: 8 } }))).toContain('gaveta_baixa');
  });
});

describe('furos de pino (sistema 32)', () => {
  const r = calcularModulo(modeloPadrao('tampo_base_entre_laterais', 'fundo_canal'), { ...REF, interior: { divisorias: 1, prateleiras: [{ quantidade: 2, tipo: 'regulavel' }, { quantidade: 0, tipo: 'fixa' }] } });

  it('só nas paredes do vão com prateleira regulável, nas faces de dentro', () => {
    expect(por(r, 'lateral_esquerda').furos!.map((f) => f.face)).toEqual(['x+']);
    expect(por(r, 'divisoria_1').furos!.map((f) => f.face)).toEqual(['x-']);
    expect(por(r, 'lateral_direita').furos).toBeUndefined();
  });

  it('colunas a 37 mm da frente e do fundo da prateleira; linhas de 114 a 562, a cada 32', () => {
    const f = por(r, 'lateral_esquerda').furos![0]!;
    const us = [...new Set(f.centros.map((c) => c.u))];
    const vs = [...new Set(f.centros.map((c) => c.v))];
    expect(us[0]).toBe(mm(114));
    expect(us.at(-1)).toBe(mm(562));
    expect(us).toHaveLength(15);
    // Profundidade livre 534 − folga traseira 2 − 37 = 495
    expect(vs).toEqual([mm(37), mm(495)]);
    expect(r.ferragens).toEqual([expect.objectContaining({ codigo: 'suporte_prateleira', quantidade: 8 })]);
  });
});

describe('propriedade: frentes e gavetas nunca invadem outras peças', () => {
  const arb = fc.record({
    montagem: fc.constantFrom('tampo_base_entre_laterais', 'tampo_sobre_laterais', 'base_entre_laterais_travessas'),
    fundo: fc.constantFrom('fundo_sobreposto', 'fundo_canal', 'fundo_embutido'),
    L: fc.integer({ min: 3000, max: 24000 }),
    A: fc.integer({ min: 3000, max: 24000 }),
    P: fc.integer({ min: 2800, max: 7000 }),
    divisorias: fc.integer({ min: 0, max: 3 }),
    modo: fc.constantFrom('sobreposta' as const, 'embutida' as const),
    rfp: fc.integer({ min: 0, max: 400 }),
    frentes: fc.array(
      fc.record({
        tipo: fc.constantFrom('aberto' as const, 'porta' as const, 'gavetas' as const),
        portas: fc.constantFrom(1 as const, 2 as const),
        lado: fc.constantFrom('esquerda' as const, 'direita' as const),
        gavetas: fc.integer({ min: 1, max: 5 }),
        prat: fc.integer({ min: 0, max: 3 }),
      }),
      { minLength: 4, maxLength: 4 },
    ),
  });

  it('módulo válido: só o fundo no canal se sobrepõe; tudo com tamanho de peça', () => {
    let validos = 0;
    fc.assert(
      fc.property(arb, (x) => {
        const n = x.divisorias + 1;
        const fr = x.frentes.slice(0, n);
        const r = calcularModulo(modeloPadrao(x.montagem, x.fundo), {
          L: dmm(x.L),
          A: dmm(x.A),
          P: dmm(x.P),
          espessuraEstrutura: mm(18),
          espessuraFundo: mm(6),
          parametros: { rfp: x.rfp },
          interior: { divisorias: x.divisorias, prateleiras: fr.map((f) => ({ quantidade: f.tipo === 'gavetas' ? 0 : f.prat, tipo: 'regulavel' as const })) },
          frentes: { modo: x.modo, espessuraFrente: mm(18), espessuraGaveta: mm(15), vaos: fr },
        });
        if (!r.valido) return;
        validos++;
        for (const c of r.componentes) expect(caixaConfere(c), c.id).toBe(true);
        for (const col of colisoes(r.componentes)) {
          expect(x.fundo).toBe('fundo_canal');
          expect([col.a, col.b]).toContain('fundo');
        }
        // Todo furo cai dentro da peça.
        for (const c of r.componentes) {
          for (const f of c.furos ?? []) {
            for (const p of f.centros) {
              expect(p.u).toBeGreaterThan(0);
              expect(p.u).toBeLessThan(c.comprimento);
              expect(p.v).toBeGreaterThan(0);
              expect(p.v).toBeLessThan(c.largura);
            }
          }
        }
      }),
    );
    // A propriedade só vale alguma coisa se boa parte dos casos for válida.
    expect(validos).toBeGreaterThan(0);
  }, 600_000);
});

describe('descreverUsinagem()', () => {
  it('textos', async () => {
    const { descreverUsinagem } = await import('../src');
    expect(descreverUsinagem({ tipo: 'canal_fundo', largura: mm(6), profundidade: mm(8), distanciaTras: mm(10), comprimento: mm(700) })).toBe('Canal 6 × 8, a 10 da borda de trás');
    expect(
      descreverUsinagem({ tipo: 'furos', finalidade: 'dobradica', diametro: mm(35), profundidade: mm(13), face: 'z+', centros: [{ u: mm(100), v: 225 as never }, { u: mm(597), v: 225 as never }] }),
    ).toBe('2 copas de dobradiça Ø35 × 13 (face de trás)');
  });
});
