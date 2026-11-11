import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  calcularModulo,
  descreverUsinagem,
  gerarListaPecas,
  mm,
  modeloPadrao,
  orientacaoDaPeca,
  posicoesDaJuncao,
  type Componente,
  type EntradaFrentes,
  type EntradaFuracao,
  type EntradaModulo,
  type Furo,
  type ResultadoModulo,
} from '../src';

/** 600 × 700 × 550, MDF 18, fundo 6 em canal. Tampo e base entre as laterais: 564 × 550. */
const REF: EntradaModulo = { L: mm(600), A: mm(700), P: mm(550), espessuraEstrutura: mm(18), espessuraFundo: mm(6), parametros: { c: 80, g: 10, r: 100 } };
const FR: EntradaFrentes = { modo: 'sobreposta', espessuraFrente: mm(18), espessuraGaveta: mm(15), vaos: { tipo: 'porta', portas: 1, lado: 'esquerda' } };
const MONTAGENS = ['tampo_base_entre_laterais', 'tampo_sobre_laterais', 'base_entre_laterais_travessas'] as const;

function calc(furacao: EntradaFuracao, e: Partial<EntradaModulo> = {}, montagem: string = MONTAGENS[0], fundo = 'fundo_canal'): ResultadoModulo {
  return calcularModulo(modeloPadrao(montagem, fundo), { ...REF, ...e, furacao });
}
const por = (r: ResultadoModulo, id: string) => r.componentes.find((c) => c.id === id) as Componente;
const furos = (c: Componente, finalidade: Furo['finalidade']) => (c.furos ?? []).filter((f) => f.finalidade === finalidade);
const centros = (c: Componente, finalidade: Furo['finalidade']) => furos(c, finalidade).flatMap((f) => f.centros.map((p) => [p.u, p.v]));

/** Centro do furo em coordenadas do móvel (na superfície furada). */
function noMovel(c: Componente, f: Furo): Array<{ x: number; y: number; z: number }> {
  const [ec, el, ee] = orientacaoDaPeca(c)!;
  const k = c.caixa;
  const tam = { x: k.dx, y: k.dy, z: k.dz };
  return f.centros.map((p) => {
    const g = { x: 0, y: 0, z: 0 };
    g[ec] = k[ec] + p.u;
    g[el] = k[el] + p.v;
    if (f.topo) g[ee] = k[ee] + Math.floor(c.espessura / 2);
    else g[ee] = f.face.endsWith('+') ? k[ee] + tam[ee] : k[ee];
    return g;
  });
}
const chave = (g: { x: number; y: number; z: number }) => `${g.x},${g.y},${g.z}`;

describe('posições ao longo da junção', () => {
  it('dois pontos a 50 mm das bordas; mais um a cada 500 mm de vão', () => {
    expect(posicoesDaJuncao(0, 5500, 500, 500, 5000)).toEqual([500, 5000]);
    expect(posicoesDaJuncao(0, 6000, 500, 500, 5000)).toEqual([500, 5500]);
    expect(posicoesDaJuncao(0, 6010, 500, 500, 5000)).toEqual([500, 3005, 5510]);
    expect(posicoesDaJuncao(1000, 21000, 500, 500, 5000)).toEqual([1500, 6250, 11000, 15750, 20500]);
  });
  it('encontro curto: um ponto no meio; menor que 40 mm: nenhum', () => {
    expect(posicoesDaJuncao(0, 1200, 500, 500, 5000)).toEqual([600]);
    expect(posicoesDaJuncao(0, 399, 500, 500, 5000)).toEqual([]);
  });
  it('a soma dos passos fecha exata mesmo com resto', () => {
    const p = posicoesDaJuncao(0, 11001, 500, 500, 3300);
    expect(p[0]).toBe(500);
    expect(p.at(-1)).toBe(10501);
    expect(p.length).toBe(5);
  });
});

describe('minifix (conferido à mão)', () => {
  const r = calc({ juncao: 'minifix' });
  const tampo = por(r, 'tampo');
  const latE = por(r, 'lateral_esquerda');
  const latD = por(r, 'lateral_direita');

  it('sem erros; 4 junções de 2 pontos = 8 minifix', () => {
    expect(r.erros).toEqual([]);
    expect(r.juncoes.length).toBe(4);
    expect(r.ferragens.find((f) => f.codigo === 'minifix')?.quantidade).toBe(8);
  });

  it('tampo (564 × 550): tambores Ø15 × 13 a 34 mm de cada ponta, a 50 mm da frente e do fundo, por baixo', () => {
    const t = furos(tampo, 'minifix_tambor');
    expect(t.length).toBe(1);
    expect(t[0]).toMatchObject({ diametro: mm(15), profundidade: mm(13), face: 'y-' });
    expect(centros(tampo, 'minifix_tambor').sort()).toEqual([[mm(34), mm(50)], [mm(34), mm(500)], [mm(530), mm(50)], [mm(530), mm(500)]].sort());
  });

  it('tampo: furos da haste Ø8 × 34 no topo de cada ponta, nas mesmas posições', () => {
    const h = furos(tampo, 'minifix_haste');
    expect(h.map((f) => [f.face, f.topo, f.diametro, f.profundidade]).sort()).toEqual([['x+', true, mm(8), mm(34)], ['x-', true, mm(8), mm(34)]].sort());
    expect(centros(tampo, 'minifix_haste').sort()).toEqual([[0, mm(50)], [0, mm(500)], [mm(564), mm(50)], [mm(564), mm(500)]].sort());
  });

  it('base: tambores por cima (face de dentro)', () => {
    expect(furos(por(r, 'base'), 'minifix_tambor')[0]!.face).toBe('y+');
  });

  it('lateral esquerda (700 × 550): pinos Ø5 × 12 na face de dentro, no meio da espessura do tampo e da base', () => {
    const p = furos(latE, 'minifix_pino');
    expect(p.length).toBe(1);
    expect(p[0]).toMatchObject({ diametro: mm(5), profundidade: mm(12), face: 'x+' });
    // Base ocupa 0–18 (meio 9); tampo ocupa 682–700 (meio 691).
    expect(centros(latE, 'minifix_pino').sort()).toEqual([[mm(9), mm(50)], [mm(9), mm(500)], [mm(691), mm(50)], [mm(691), mm(500)]].sort());
    expect(furos(latD, 'minifix_pino')[0]!.face).toBe('x-');
    expect(centros(latD, 'minifix_pino').sort()).toEqual(centros(latE, 'minifix_pino').sort());
  });

  it('as duas laterais viram dois itens na lista: a face furada é oposta (peças espelhadas)', () => {
    const lista = gerarListaPecas({ resultado: r, montagem: MONTAGENS[0], fundo: 'fundo_canal', espessuraFundo: mm(6) });
    const laterais = lista.itens.filter((i) => i.papel === 'lateral');
    expect(laterais.map((l) => l.quantidade)).toEqual([1, 1]);
    expect(laterais.map((l) => l.usinagens.filter((u) => u.tipo === 'furos').map(descreverUsinagem)).flat()).toEqual([
      '4 furos de pino de minifix Ø5 × 12 (face direita)',
      '4 furos de pino de minifix Ø5 × 12 (face esquerda)',
    ]);
  });

  it('com cavilha ao lado: uma a 32 mm de cada minifix, para dentro', () => {
    const c = calc({ juncao: 'minifix', cavilhaComMinifix: true });
    expect(c.erros).toEqual([]);
    expect(c.ferragens.find((f) => f.codigo === 'cavilha')?.quantidade).toBe(8);
    expect(centros(por(c, 'lateral_esquerda'), 'cavilha').sort()).toEqual([[mm(9), mm(82)], [mm(9), mm(468)], [mm(691), mm(82)], [mm(691), mm(468)]].sort());
  });
});

describe('cavilha e parafuso (conferido à mão)', () => {
  it('cavilha 8 × 30: 12 na face, 20 no topo (18 + 2 de folga)', () => {
    const r = calc({ juncao: 'cavilha' });
    expect(r.erros).toEqual([]);
    expect(furos(por(r, 'lateral_esquerda'), 'cavilha')[0]).toMatchObject({ diametro: mm(8), profundidade: mm(12), face: 'x+' });
    expect(furos(por(r, 'tampo'), 'cavilha').map((f) => [f.topo, f.profundidade])).toEqual([[true, mm(20)], [true, mm(20)]]);
    expect(r.ferragens.find((f) => f.codigo === 'cavilha')?.quantidade).toBe(8);
  });

  it('parafuso: passante pela face de FORA da lateral, guia Ø3 × 30 no topo', () => {
    const r = calc({ juncao: 'parafuso' });
    expect(r.erros).toEqual([]);
    expect(furos(por(r, 'lateral_esquerda'), 'parafuso')[0]).toMatchObject({ diametro: mm(4), profundidade: mm(18), face: 'x-', passante: true });
    expect(furos(por(r, 'lateral_direita'), 'parafuso')[0]!.face).toBe('x+');
    expect(furos(por(r, 'base'), 'parafuso_guia').every((f) => f.topo && f.diametro === mm(3) && f.profundidade === mm(30))).toBe(true);
    expect(r.ferragens.find((f) => f.codigo === 'parafuso_montagem')?.quantidade).toBe(8);
    expect(descreverUsinagem({ tipo: 'furos', ...furos(por(r, 'lateral_esquerda'), 'parafuso')[0]! })).toBe('4 furos de parafuso Ø4 passante (face esquerda)');
  });

  it('sem junção: nenhuma furação de montagem, nenhuma ferragem a mais', () => {
    const r = calc({ juncao: 'nenhuma' });
    expect(r.componentes.flatMap((c) => c.furos ?? [])).toEqual([]);
    expect(r.ferragens).toEqual([]);
    expect(r.juncoes).toEqual([]);
  });
});

describe('interior', () => {
  it('divisória: fura no topo de cima e de baixo; tampo e base recebem os pinos na face de dentro', () => {
    const r = calc({ juncao: 'minifix' }, { interior: { divisorias: 1 } });
    expect(r.erros).toEqual([]);
    const d = por(r, 'divisoria_1');
    expect(furos(d, 'minifix_haste').map((f) => f.face).sort()).toEqual(['y+', 'y-']);
    expect(furos(d, 'minifix_tambor')[0]!.face).toBe('x+');
    expect(furos(por(r, 'tampo'), 'minifix_pino')[0]!.face).toBe('y-');
    expect(furos(por(r, 'base'), 'minifix_pino')[0]!.face).toBe('y+');
    expect(r.juncoes.length).toBe(6);
  });

  it('prateleira fixa: tambor por baixo; prateleira regulável não é furada', () => {
    const r = calc({ juncao: 'minifix' }, { interior: { divisorias: 0, prateleiras: { quantidade: 1, tipo: 'fixa' } } });
    expect(r.erros).toEqual([]);
    const p = r.componentes.find((c) => c.papel === 'prateleira_fixa')!;
    expect(furos(p, 'minifix_tambor')[0]!.face).toBe('y-');
    const reg = calc({ juncao: 'minifix' }, { interior: { divisorias: 0, prateleiras: { quantidade: 2, tipo: 'regulavel' } } });
    expect(reg.componentes.filter((c) => c.papel === 'prateleira_regulavel').flatMap((c) => c.furos ?? [])).toEqual([]);
    // Os furos de pino das reguláveis continuam lá, junto com os de minifix.
    expect(furos(por(reg, 'lateral_esquerda'), 'pino_prateleira').length).toBe(1);
  });
});

describe('limites', () => {
  it('tambor fundo demais para a chapa: erro claro, módulo inválido', () => {
    const r = calc({ juncao: 'minifix' }, { espessuraEstrutura: mm(12) });
    expect(r.valido).toBe(false);
    expect(r.erros[0]).toMatchObject({ codigo: 'furo_profundo' });
    expect(r.erros[0]!.mensagem).toContain('13 mm');
    // Ajustando o parâmetro, passa.
    expect(calc({ juncao: 'minifix' }, { espessuraEstrutura: mm(12), parametros: { ...REF.parametros, mfp: 100, mfq: 90 } }).valido).toBe(true);
  });

  it('cavilha com furo da face maior que a cavilha: erro', () => {
    expect(calc({ juncao: 'cavilha' }, { parametros: { ...REF.parametros, cvc: 200, cvf: 200 } }).erros.map((e) => e.codigo)).toContain('cavilha_invalida');
  });

  it('parâmetro de furação fora do limite é recusado', () => {
    expect(calc({ juncao: 'minifix' }, { parametros: { ...REF.parametros, mfd: 10 } }).erros.map((e) => e.codigo)).toEqual(['parametro_fora_limite']);
  });
});

describe('calço da dobradiça e puxador (conferido à mão)', () => {
  const comPorta = (f: EntradaFuracao, fr: Partial<EntradaFrentes> = {}, e: Partial<EntradaModulo> = {}) => calc(f, { ...e, frentes: { ...FR, ...fr } });

  it('porta sobreposta de 697: copas a 100 e 597; calço na lateral a 37 mm da frente, furos a ±16 mm da copa', () => {
    const r = comPorta({ juncao: 'nenhuma' });
    expect(r.erros).toEqual([]);
    const porta = por(r, 'porta_v1');
    expect(porta.caixa.y).toBe(mm(1.5));
    const lat = por(r, 'lateral_esquerda');
    const calco = furos(lat, 'calco_dobradica');
    expect(calco[0]).toMatchObject({ diametro: mm(5), profundidade: mm(12), face: 'x+' });
    // Alturas no móvel: 1,5 + 100 = 101,5 e 1,5 + 597 = 598,5.
    expect(centros(lat, 'calco_dobradica')).toEqual([[mm(85.5), mm(37)], [mm(117.5), mm(37)], [mm(582.5), mm(37)], [mm(614.5), mm(37)]]);
    expect(furos(por(r, 'lateral_direita'), 'calco_dobradica')).toEqual([]);
  });

  it('dobradiças à direita: calço na lateral direita, face esquerda', () => {
    const r = comPorta({ juncao: 'nenhuma' }, { vaos: { tipo: 'porta', portas: 1, lado: 'direita' } });
    expect(furos(por(r, 'lateral_direita'), 'calco_dobradica')[0]!.face).toBe('x-');
    expect(furos(por(r, 'lateral_esquerda'), 'calco_dobradica')).toEqual([]);
  });

  it('porta embutida: o calço recua a espessura da porta (18 + 37 = 55)', () => {
    const r = comPorta({ juncao: 'nenhuma' }, { modo: 'embutida' });
    expect(r.erros).toEqual([]);
    expect(new Set(centros(por(r, 'lateral_esquerda'), 'calco_dobradica').map((c) => c[1]))).toEqual(new Set([mm(55)]));
  });

  it('duas portas com divisória no meio: cada porta fura a lateral do seu lado', () => {
    const r = comPorta({ juncao: 'nenhuma' }, { vaos: { tipo: 'porta', portas: 2 } });
    expect(r.erros).toEqual([]);
    expect(centros(por(r, 'lateral_esquerda'), 'calco_dobradica').length).toBe(4);
    expect(centros(por(r, 'lateral_direita'), 'calco_dobradica').length).toBe(4);
  });

  it('calço desligado não fura', () => {
    const r = comPorta({ juncao: 'nenhuma', calcoDobradica: false });
    expect(r.componentes.flatMap((c) => furos(c, 'calco_dobradica'))).toEqual([]);
  });

  it('puxador de 128 mm na porta: em pé, a 50 mm da borda de abrir, no meio da altura', () => {
    const r = comPorta({ juncao: 'nenhuma', puxadorEntreFuros: mm(128) });
    const porta = por(r, 'porta_v1');
    expect(furos(porta, 'puxador')[0]).toMatchObject({ diametro: mm(5), passante: true, face: 'z-', profundidade: mm(18) });
    // Porta 697 × 597, dobradiças à esquerda: x = 597 − 50 = 547; meio = 348,5 → 348,5 ± 64.
    expect(centros(porta, 'puxador')).toEqual([[mm(284.5), mm(547)], [mm(412.5), mm(547)]]);
  });

  it('puxador de um furo, a 100 mm do topo', () => {
    const r = comPorta({ juncao: 'nenhuma', puxadorEntreFuros: mm(0) }, {}, { parametros: { ...REF.parametros, pxa: 1000 } });
    expect(centros(por(r, 'porta_v1'), 'puxador')).toEqual([[mm(597), mm(547)]]);
  });

  it('frente de gaveta: puxador deitado, no centro', () => {
    const r = comPorta({ juncao: 'nenhuma', puxadorEntreFuros: mm(160) }, { vaos: { tipo: 'gavetas', gavetas: 2 } });
    expect(r.erros).toEqual([]);
    const frentes = r.componentes.filter((c) => c.papel === 'frente_gaveta');
    expect(frentes.length).toBe(2);
    for (const f of frentes) {
      const pts = noMovel(f, furos(f, 'puxador')[0]!);
      expect(pts.map((p) => p.x - f.caixa.x)).toEqual([f.caixa.dx / 2 - 800, f.caixa.dx / 2 + 800].map(Math.floor));
      expect(new Set(pts.map((p) => p.y))).toEqual(new Set([f.caixa.y + Math.floor(f.caixa.dy / 2)]));
    }
  });

  it('sem puxador nas frentes, não fura puxador; puxador que não cabe vira aviso', () => {
    expect(comPorta({ juncao: 'nenhuma', puxadorEntreFuros: mm(128) }, { puxador: false }).componentes.flatMap((c) => furos(c, 'puxador'))).toEqual([]);
    const r = comPorta({ juncao: 'nenhuma', puxadorEntreFuros: mm(900) });
    expect(r.valido).toBe(true);
    expect(r.avisos.map((a) => a.codigo)).toContain('puxador_fora');
  });
});

describe('gavetas: corrediça, caixa e frente (conferido à mão)', () => {
  // 600 × 700 × 550, sobreposta, 2 gavetas. Corrediça de 500 mm; caixa 539 × 286 × 500, laterais de 15 mm.
  const GAV: EntradaFrentes = { ...FR, vaos: { tipo: 'gavetas', gavetas: 2 } };
  const gav = (f: EntradaFuracao, fr: Partial<EntradaFrentes> = {}) => calc(f, { frentes: { ...GAV, ...fr } });
  const tudo: EntradaFuracao = { juncao: 'minifix', juncaoGaveta: 'parafuso', corredica: true, frenteGaveta: true, puxadorEntreFuros: mm(128) };

  it('sem as opções novas, a gaveta não recebe furação nenhuma (projetos antigos não mudam)', () => {
    const r = gav({ juncao: 'minifix' });
    expect(r.componentes.filter((c) => c.id.startsWith('gaveta_')).flatMap((c) => c.furos ?? [])).toEqual([]);
    expect(r.ferragens.map((f) => f.codigo)).not.toContain('parafuso_corredica');
  });

  it('corrediça na lateral da gaveta: 37, 165, 293 e 421 mm da frente, 22,5 mm acima da base, Ø2,5 × 8, face de fora', () => {
    const r = gav(tudo);
    expect(r.erros).toEqual([]);
    const le = por(r, 'gaveta_v1_1_lateral_e');
    expect(le.comprimento).toBe(mm(500));
    expect(furos(le, 'corredica')[0]).toMatchObject({ diametro: mm(2.5), profundidade: mm(8), face: 'x-' });
    expect(centros(le, 'corredica')).toEqual([[mm(37), mm(22.5)], [mm(165), mm(22.5)], [mm(293), mm(22.5)], [mm(421), mm(22.5)]]);
    expect(furos(por(r, 'gaveta_v1_1_lateral_d'), 'corredica')[0]!.face).toBe('x+');
  });

  it('corrediça na lateral do móvel: mesma altura da gaveta (24 + 22,5 = 46,5 mm; 2ª gaveta 378,5 mm), Ø2,5 × 10, face de dentro', () => {
    const r = gav(tudo);
    const lat = por(r, 'lateral_esquerda');
    expect(furos(lat, 'corredica')[0]).toMatchObject({ diametro: mm(2.5), profundidade: mm(10), face: 'x+' });
    expect(centros(lat, 'corredica')).toEqual([46.5, 378.5].flatMap((y) => [37, 165, 293, 421].map((z) => [mm(y), mm(z)])));
    expect(furos(por(r, 'lateral_direita'), 'corredica')[0]!.face).toBe('x-');
    expect(r.ferragens.find((f) => f.codigo === 'parafuso_corredica')?.quantidade).toBe(32);
  });

  it('caixa parafusada: passante pela lateral (por fora) no meio da contrafrente e da traseira; fundo parafusado por baixo', () => {
    const r = gav(tudo);
    const le = por(r, 'gaveta_v1_1_lateral_e');
    expect(furos(le, 'parafuso')[0]).toMatchObject({ face: 'x-', passante: true, profundidade: mm(15) });
    expect(centros(le, 'parafuso')).toEqual([[mm(7.5), mm(50)], [mm(7.5), mm(236)], [mm(492.5), mm(50)], [mm(492.5), mm(236)]]);
    const cf = por(r, 'gaveta_v1_1_contrafrente');
    expect(furos(cf, 'parafuso_guia').map((f) => f.face).sort()).toEqual(['x+', 'x-', 'y-']);
    const fundo = por(r, 'gaveta_v1_1_fundo');
    expect(furos(fundo, 'parafuso')[0]).toMatchObject({ face: 'y-', passante: true, profundidade: mm(6) });
    // Por gaveta: 4 + 4 (contrafrente e traseira) + 4 + 2 + 2 (fundo) = 16.
    expect(r.ferragens.find((f) => f.codigo === 'parafuso_gaveta')?.quantidade).toBe(32);
    // Parafuso da gaveta não se mistura com o da caixa do móvel.
    expect(r.ferragens.find((f) => f.codigo === 'parafuso_montagem')).toBeUndefined();
  });

  it('caixa com cavilha: o fundo de 6 mm não é furado', () => {
    const r = gav({ ...tudo, juncaoGaveta: 'cavilha' });
    expect(r.erros).toEqual([]);
    expect(por(r, 'gaveta_v1_1_fundo').furos ?? []).toEqual([]);
    expect(furos(por(r, 'gaveta_v1_1_lateral_e'), 'cavilha')[0]).toMatchObject({ diametro: mm(8), profundidade: mm(12), face: 'x+' });
    // Minifix na caixa do móvel (8) + 4 junções × 2 pontos por gaveta (16).
    expect(r.ferragens.find((f) => f.codigo === 'cavilha')?.quantidade).toBe(16);
  });

  it('frente presa pela contrafrente: 4 parafusos a 30 mm das bordas, passante na contrafrente e guia Ø3 × 10 atrás da frente, no mesmo ponto', () => {
    const r = gav(tudo);
    const cf = por(r, 'gaveta_v1_1_contrafrente');
    const fr = por(r, 'gaveta_v1_1_frente');
    expect(furos(cf, 'fixacao_frente')[0]).toMatchObject({ face: 'z+', passante: true, diametro: mm(4.5) });
    expect(furos(fr, 'fixacao_frente')[0]).toMatchObject({ face: 'z+', diametro: mm(3), profundidade: mm(10) });
    const naCf = noMovel(cf, furos(cf, 'fixacao_frente')[0]!).map((g) => `${g.x},${g.y}`).sort();
    const naFr = noMovel(fr, furos(fr, 'fixacao_frente')[0]!).map((g) => `${g.x},${g.y}`).sort();
    expect(naCf).toEqual(naFr);
    expect(naCf.length).toBe(4);
    expect(r.ferragens.find((f) => f.codigo === 'parafuso_frente')?.quantidade).toBe(8);
  });

  it('puxador da gaveta atravessa a frente e a contrafrente no mesmo ponto', () => {
    const r = gav(tudo);
    const cf = por(r, 'gaveta_v1_1_contrafrente');
    const fr = por(r, 'gaveta_v1_1_frente');
    const xy = (c: Componente) => noMovel(c, furos(c, 'puxador')[0]!).map((g) => `${g.x},${g.y}`);
    expect(xy(cf)).toEqual(xy(fr));
    expect(furos(cf, 'puxador')[0]).toMatchObject({ passante: true, profundidade: mm(15) });
  });

  it('gaveta embutida: a frente também encosta na contrafrente e recebe a fixação', () => {
    const r = gav(tudo, { modo: 'embutida' });
    expect(r.erros).toEqual([]);
    expect(furos(por(r, 'gaveta_v1_1_frente'), 'fixacao_frente').length).toBe(1);
    expect(centros(por(r, 'lateral_esquerda'), 'corredica').length).toBe(8);
  });

  it('gavetas no vão do meio: a corrediça é furada na divisória', () => {
    const r = calc(tudo, { interior: { divisorias: 1 }, frentes: { ...GAV, vaos: [{ tipo: 'porta', portas: 1, lado: 'esquerda' }, { tipo: 'gavetas', gavetas: 1 }] } });
    expect(r.erros).toEqual([]);
    expect(furos(por(r, 'divisoria_1'), 'corredica')[0]!.face).toBe('x+');
    expect(furos(por(r, 'lateral_direita'), 'corredica')[0]!.face).toBe('x-');
  });

  it('parâmetros que não cabem viram aviso ou erro claro', () => {
    const semFuro = gav(tudo, {});
    expect(semFuro.avisos.map((a) => a.codigo)).not.toContain('corredica_sem_furo');
    const r = calc(tudo, { P: mm(450), frentes: GAV, parametros: { ...REF.parametros, crf: 3000, cgf: 3000, crt: 2000 } });
    expect(r.avisos.map((a) => a.codigo)).toContain('corredica_sem_furo');
    expect(calc(tudo, { frentes: GAV, parametros: { ...REF.parametros, cgq: 150 } }).erros.map((e) => e.codigo)).toContain('furo_profundo');
  });
});

describe('propriedades: qualquer módulo válido', () => {
  const entrada = fc.record({
    L: fc.integer({ min: 300, max: 2400 }),
    A: fc.integer({ min: 300, max: 2400 }),
    P: fc.integer({ min: 250, max: 700 }),
    e: fc.constantFrom(15, 18, 25),
    montagem: fc.constantFrom(...MONTAGENS),
    fundo: fc.constantFrom('fundo_canal', 'fundo_sobreposto', 'fundo_embutido'),
    divisorias: fc.integer({ min: 0, max: 3 }),
    prateleiras: fc.integer({ min: 0, max: 3 }),
    tipo: fc.constantFrom('fixa' as const, 'regulavel' as const),
    juncao: fc.constantFrom('minifix' as const, 'cavilha' as const, 'parafuso' as const),
    cavilha: fc.boolean(),
    frente: fc.constantFrom('aberto' as const, 'porta' as const, 'gavetas' as const),
    gavetas: fc.integer({ min: 1, max: 4 }),
    juncaoGaveta: fc.constantFrom('nenhuma' as const, 'parafuso' as const, 'cavilha' as const),
    extras: fc.boolean(),
    modo: fc.constantFrom('sobreposta' as const, 'embutida' as const),
    jf: fc.integer({ min: 150, max: 1500 }),
    jp: fc.integer({ min: 640, max: 8000 }),
  });

  function montar(v: typeof entrada extends fc.Arbitrary<infer T> ? T : never): ResultadoModulo {
    return calcularModulo(modeloPadrao(v.montagem, v.fundo), {
      L: mm(v.L), A: mm(v.A), P: mm(v.P), espessuraEstrutura: mm(v.e), espessuraFundo: mm(6),
      parametros: { jf: v.jf, jt: v.jf, jp: v.jp, ...(v.modo === 'embutida' && v.prateleiras ? { rfp: 200 } : {}) },
      interior: { divisorias: v.divisorias, prateleiras: { quantidade: v.prateleiras, tipo: v.tipo } },
      frentes: { ...FR, modo: v.modo, vaos: { tipo: v.frente, portas: 1, lado: 'esquerda', gavetas: v.gavetas } },
      furacao: { juncao: v.juncao, cavilhaComMinifix: v.cavilha, puxadorEntreFuros: mm(96), juncaoGaveta: v.juncaoGaveta, corredica: v.extras, frenteGaveta: v.extras },
    });
  }

  it('todo furo cai dentro da peça, com o raio inteiro, e furo cego não vara', () => {
    fc.assert(
      fc.property(entrada, (v) => {
        const r = montar(v);
        fc.pre(r.valido);
        for (const c of r.componentes) {
          for (const f of c.furos ?? []) {
            const raio = f.diametro / 2;
            for (const p of f.centros) {
              if (f.topo) {
                // Na borda: uma das coordenadas está na ponta; a outra, dentro.
                const naPonta = p.u === 0 || p.u === c.comprimento || p.v === 0 || p.v === c.largura;
                expect(naPonta, `${c.id} ${f.finalidade}`).toBe(true);
                expect(f.diametro).toBeLessThan(c.espessura);
              } else {
                expect(p.u - raio, `${c.id} ${f.finalidade} u`).toBeGreaterThanOrEqual(0);
                expect(p.u + raio).toBeLessThanOrEqual(c.comprimento);
                expect(p.v - raio, `${c.id} ${f.finalidade} v`).toBeGreaterThanOrEqual(0);
                expect(p.v + raio).toBeLessThanOrEqual(c.largura);
              }
              expect(p.u).toBeGreaterThanOrEqual(0);
              expect(p.u).toBeLessThanOrEqual(c.comprimento);
              expect(p.v).toBeGreaterThanOrEqual(0);
              expect(p.v).toBeLessThanOrEqual(c.largura);
            }
            if (!f.passante && !f.topo) expect(f.profundidade, `${c.id} ${f.finalidade}`).toBeLessThan(c.espessura);
            if (f.passante) expect(f.profundidade).toBe(c.espessura);
          }
        }
      }),
    );
  }, 600_000);

  it('os dois lados de cada junção se encontram: furo da face e furo do topo no mesmo ponto do móvel', () => {
    fc.assert(
      fc.property(entrada, (v) => {
        const r = montar(v);
        fc.pre(r.valido);
        const pares: Array<[Furo['finalidade'], Furo['finalidade']]> = v.juncao === 'minifix' ? [['minifix_pino', 'minifix_haste']] : v.juncao === 'cavilha' ? [['cavilha', 'cavilha']] : [['parafuso', 'parafuso_guia']];
        if (v.juncao === 'minifix' && v.cavilha) pares.push(['cavilha', 'cavilha']);
        if (v.frente === 'gavetas' && v.juncaoGaveta === 'parafuso') pares.push(['parafuso', 'parafuso_guia']);
        if (v.frente === 'gavetas' && v.juncaoGaveta === 'cavilha') pares.push(['cavilha', 'cavilha']);
        for (const [naFace, noTopo] of pares) {
          const face = new Map<string, number>();
          const topo = new Map<string, number>();
          for (const c of r.componentes) {
            const [, , ee] = orientacaoDaPeca(c)!;
            for (const f of c.furos ?? []) {
              if (f.finalidade === naFace && !f.topo) {
                for (const g of noMovel(c, f)) {
                  // Parafuso entra pela face de fora: o encontro é do outro lado da espessura.
                  if (f.passante) g[ee] += f.face.endsWith('+') ? -c.espessura : c.espessura;
                  face.set(chave(g), (face.get(chave(g)) ?? 0) + 1);
                }
              }
              if (f.finalidade === noTopo && f.topo) for (const g of noMovel(c, f)) topo.set(chave(g), (topo.get(chave(g)) ?? 0) + 1);
            }
          }
          expect([...face.entries()].sort()).toEqual([...topo.entries()].sort());
          if (naFace !== 'cavilha' || v.juncao === 'cavilha') expect(face.size).toBeGreaterThan(0);
        }
        // A contagem de ferragens é a dos pontos furados, separada entre móvel e gaveta.
        const pontos = (gaveta: boolean) => r.juncoes.filter((j) => j.a.startsWith('gaveta_') === gaveta).reduce((s, j) => s + j.pontos.length, 0);
        const esperado = new Map<string, number>();
        const somar = (codigo: string, n: number) => n && esperado.set(codigo, (esperado.get(codigo) ?? 0) + n);
        somar(v.juncao === 'minifix' ? 'minifix' : v.juncao === 'cavilha' ? 'cavilha' : 'parafuso_montagem', pontos(false));
        if (v.juncaoGaveta !== 'nenhuma') somar(v.juncaoGaveta === 'cavilha' ? 'cavilha' : 'parafuso_gaveta', pontos(true));
        for (const [codigo, n] of esperado) {
          // Cavilha ao lado do minifix soma 2 por junção longa; aí só confere que há pelo menos isso.
          const qtd = r.ferragens.find((f) => f.codigo === codigo)?.quantidade ?? 0;
          if (codigo === 'cavilha' && v.juncao === 'minifix' && v.cavilha) expect(qtd).toBeGreaterThanOrEqual(n);
          else expect(qtd, codigo).toBe(n);
        }
      }),
    );
  }, 600_000);

  it('tambor do minifix: sempre à distância configurada do topo que tem a haste', () => {
    fc.assert(
      fc.property(entrada, (v) => {
        const r = montar({ ...v, juncao: 'minifix' });
        fc.pre(r.valido);
        for (const c of r.componentes) {
          const hastes = (c.furos ?? []).filter((f) => f.finalidade === 'minifix_haste').reduce((s, f) => s + f.centros.length, 0);
          const tambores = (c.furos ?? []).filter((f) => f.finalidade === 'minifix_tambor').flatMap((f) => f.centros);
          expect(tambores.length).toBe(hastes);
          for (const t of tambores) {
            const aBorda = Math.min(t.u, c.comprimento - t.u, t.v, c.largura - t.v);
            expect(aBorda).toBeLessThanOrEqual(340);
          }
        }
      }),
    );
  }, 600_000);

  it('calço: dois furos por copa, na mesma altura da copa (±16 mm), dentro da parede', () => {
    fc.assert(
      fc.property(entrada, (v) => {
        const r = montar({ ...v, frente: 'porta' });
        fc.pre(r.valido && !r.avisos.some((a) => a.codigo === 'calco_fora'));
        const copas = r.componentes.filter((c) => c.papel === 'porta').flatMap((c) => (c.furos ?? []).filter((f) => f.finalidade === 'dobradica').flatMap((f) => noMovel(c, f)));
        const calcos = r.componentes.flatMap((c) => (c.furos ?? []).filter((f) => f.finalidade === 'calco_dobradica').flatMap((f) => noMovel(c, f)));
        expect(calcos.length).toBe(2 * copas.length);
        const alturas = calcos.map((g) => g.y).sort((a, b) => a - b);
        const esperadas = copas.flatMap((g) => [g.y - 160, g.y + 160]).sort((a, b) => a - b);
        expect(alturas).toEqual(esperadas);
      }),
    );
  }, 600_000);

  it('corrediça: cada lateral de gaveta furada tem furos na parede do móvel na mesma altura', () => {
    fc.assert(
      fc.property(entrada, (v) => {
        const r = montar({ ...v, frente: 'gavetas', extras: true });
        fc.pre(r.valido);
        const alturas = (pred: (c: Componente) => boolean) =>
          new Set(r.componentes.filter(pred).flatMap((c) => (c.furos ?? []).filter((f) => f.finalidade === 'corredica').flatMap((f) => noMovel(c, f).map((g) => g.y))));
        const naGaveta = alturas((c) => c.papel === 'lateral_gaveta');
        const noMovelY = alturas((c) => c.papel === 'lateral' || c.papel === 'divisoria');
        if (!r.avisos.some((a) => a.codigo.startsWith('corredica_'))) {
          expect([...naGaveta].sort()).toEqual([...noMovelY].sort());
          expect(naGaveta.size).toBeGreaterThan(0);
        }
      }),
    );
  }, 600_000);

  it('determinístico: mesma entrada, mesma furação', () => {
    fc.assert(
      fc.property(entrada, (v) => {
        expect(JSON.stringify(montar(v).componentes)).toBe(JSON.stringify(montar(v).componentes));
      }),
    );
  }, 600_000);
});
