import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  analisarParede,
  anguloDoCanto,
  diagonalEsquadro,
  dmm,
  interferencias,
  mm,
  novaMedicao,
  novaParede,
  notaParaVisao,
  type ParedeMedida,
  type PontoParede,
} from '../src';

const ponto = (p: Partial<PontoParede> & Pick<PontoParede, 'tipo'>): PontoParede => ({ id: p.tipo, x: null, y: null, largura: null, altura: null, saliencia: null, observacao: '', ...p });

/** Parede do quarto (conferida à mão): 2430 / 2418 / 2425 de largura, 2600 / 2592 / 2598 de altura. */
function parede(): ParedeMedida {
  const p = novaParede('a', 'Parede A');
  p.larguras = { baixo: mm(2430), meio: mm(2418), alto: mm(2425) };
  p.alturas = { esquerda: mm(2600), meio: mm(2592), direita: mm(2598) };
  return p;
}

describe('parede fora de prumo e piso desnivelado', () => {
  it('vale a menor medida; a diferença vira aviso', () => {
    const a = analisarParede(parede(), mm(550));
    expect(a.larguraUtil).toBe(mm(2418));
    expect(a.variacaoLargura).toBe(mm(12));
    expect(a.alturaUtil).toBe(mm(2592));
    expect(a.variacaoAltura).toBe(mm(8));
    expect(a.avisos.map((x) => x.codigo)).toEqual(['fora_de_prumo', 'desnivel']);
    expect(a.avisos[0]!.mensagem).toContain('no meio é mais estreita que embaixo');
    // Sem canto medido: 2418 − 2 × 5 de folga; 2592 − 10 até o teto.
    expect(a.maximo).toEqual({ L: mm(2408), A: mm(2582), P: mm(550) });
    expect(a.erros).toEqual([]);
  });

  it('diferença dentro da tolerância (3 mm): sem aviso', () => {
    const p = novaParede('b', 'Parede B');
    p.larguras = { baixo: mm(1500), meio: mm(1502), alto: mm(1503) };
    p.alturas = { esquerda: mm(2400), meio: null, direita: mm(2401) };
    expect(analisarParede(p, null).avisos).toEqual([]);
  });

  it('largura faltando: erro; só uma largura: pede as outras alturas', () => {
    expect(analisarParede(novaParede('c', 'Parede C'), null).erros.map((e) => e.codigo)).toEqual(['sem_largura']);
    const p = novaParede('d', 'Parede D');
    p.larguras.meio = mm(1000);
    p.alturas.meio = mm(2500);
    expect(analisarParede(p, null).avisos[0]!.mensagem).toBe('Parede D: meça a largura também perto do piso e perto do teto, para saber se a parede está no prumo.');
  });
});

describe('esquadro do canto pelo 3-4-5', () => {
  it('600, 800 e 1000: 90° exatos', () => {
    expect(anguloDoCanto({ naParede: mm(600), naVizinha: mm(800), diagonal: mm(1000) })).toBeCloseTo(90, 9);
    expect(diagonalEsquadro(mm(600), mm(800))).toBe(mm(1000));
  });

  it('diagonal de 990: canto fechado de 88,81°; a 550 mm da parede cabem 11,4 mm a menos', () => {
    // cos θ = (600² + 800² − 990²) / (2·600·800) = 19900 / 960000 → θ = 88,812°; 550 · tan(1,188°) = 11,40.
    const p = parede();
    p.cantoEsquerdo = { naParede: mm(600), naVizinha: mm(800), diagonal: mm(990) };
    const a = analisarParede(p, mm(550));
    expect(a.cantos[0]!.angulo).toBeCloseTo(88.812, 3);
    expect(a.cantos[0]!.diferencaNaFrente).toBe(dmm(114));
    expect(a.larguraNaFrente).toBe(dmm(24180 - 114));
    // 2418 − 11,4 − 2 × 5 = 2396,6 → 2396 (mm inteiro, para baixo).
    expect(a.maximo.L).toBe(mm(2396));
    expect(a.avisos.find((x) => x.codigo === 'fora_de_esquadro')!.mensagem).toBe(
      'Parede A: o canto esquerdo está fechado (88,8°). Na frente do móvel, a 550 mm da parede, cabem 11,4 mm a menos que no fundo.',
    );
  });

  it('canto aberto: não tira largura, mas avisa da fresta na frente', () => {
    const p = parede();
    p.cantoDireito = { naParede: mm(600), naVizinha: mm(800), diagonal: mm(1010) };
    const a = analisarParede(p, mm(550));
    expect(a.cantos[0]!.angulo).toBeGreaterThan(90);
    expect(a.cantos[0]!.diferencaNaFrente!).toBeLessThan(0);
    expect(a.larguraNaFrente).toBe(mm(2418));
    expect(a.avisos.find((x) => x.codigo === 'fora_de_esquadro')!.mensagem).toMatch(/aberto .* fresta de 11,\d mm/);
  });

  it('medidas que não fecham triângulo: erro para conferir', () => {
    const p = parede();
    p.cantoEsquerdo = { naParede: mm(600), naVizinha: mm(800), diagonal: mm(1500) };
    expect(analisarParede(p, mm(550)).erros.map((e) => e.codigo)).toEqual(['canto_invalido']);
  });

  it('propriedade: com a diagonal do esquadro, o canto não muda nada na frente do móvel', () => {
    fc.assert(
      fc.property(fc.integer({ min: 3000, max: 20000 }), fc.integer({ min: 3000, max: 20000 }), fc.integer({ min: 2500, max: 9000 }), (a, b, prof) => {
        const p = parede();
        p.cantoEsquerdo = { naParede: dmm(a), naVizinha: dmm(b), diagonal: diagonalEsquadro(dmm(a), dmm(b)) };
        const r = analisarParede(p, dmm(prof));
        // Diagonal arredondada a 0,1 mm: menos de 0,5 mm de diferença na frente, e nenhum aviso de esquadro.
        expect(Math.abs(r.cantos[0]!.diferencaNaFrente!)).toBeLessThan(5);
        expect(r.avisos.some((x) => x.codigo === 'fora_de_esquadro')).toBe(false);
      }),
    );
  });
});

describe('o que fica atrás do móvel', () => {
  const movel = { x: mm(5), y: mm(0), L: mm(2400), A: mm(2580), P: mm(550) };

  it('tomada e cano: posição no fundo do móvel, a partir da lateral esquerda e da base', () => {
    const p = parede();
    p.pontos = [
      ponto({ tipo: 'tomada', x: mm(500), y: mm(300) }),
      ponto({ tipo: 'agua', x: mm(1200), y: mm(600) }),
      ponto({ tipo: 'interruptor', x: mm(2415), y: mm(1100) }), // fora: o móvel vai até 2405
    ];
    const r = interferencias(p, movel);
    expect(r.map((i) => [i.tipo, i.noMovel])).toEqual([
      ['tomada', { x: mm(495), y: mm(300) }],
      ['agua', { x: mm(1195), y: mm(600) }],
    ]);
    expect(r[0]!.mensagem).toBe('Tomada a 495 mm da lateral esquerda e 300 mm da base do móvel fica atrás do móvel: recorte o fundo nesse ponto ou peça para mudar o ponto antes da instalação.');
  });

  it('janela no caminho, viga que sai da parede e rodapé', () => {
    const p = parede();
    p.pontos = [
      ponto({ tipo: 'janela', x: mm(1800), y: mm(1000), largura: mm(1000), altura: mm(1200) }),
      ponto({ tipo: 'viga', x: mm(0), y: mm(2450), largura: mm(2430), altura: mm(150), saliencia: mm(120) }),
      ponto({ tipo: 'rodape', altura: mm(70), saliencia: mm(15) }),
      ponto({ tipo: 'porta', x: mm(3000), y: mm(0), largura: mm(800), altura: mm(2100) }), // fora
    ];
    const r = interferencias(p, movel);
    expect(r.map((i) => i.tipo)).toEqual(['janela', 'viga', 'rodape']);
    expect(r[1]!.mensagem).toBe('Viga a 0 mm da lateral esquerda e 2450 mm da base do móvel entra 120 mm no espaço do móvel: recorte o móvel nesse ponto ou mude a posição.');
    expect(r[2]!.mensagem).toContain('desconte 15 mm da profundidade');
  });

  it('ponto que passa do tamanho da parede: aviso para conferir', () => {
    const p = parede();
    p.pontos = [ponto({ tipo: 'janela', x: mm(1800), y: mm(1000), largura: mm(1000), altura: mm(1200) })];
    expect(analisarParede(p, null).avisos.map((x) => x.codigo)).toContain('ponto_fora');
  });

  it('ponto sem posição medida não entra na conta', () => {
    const p = parede();
    p.pontos = [ponto({ tipo: 'tomada', x: mm(500) })];
    expect(interferencias(p, movel)).toEqual([]);
  });
});

describe('nota para a Visão IA', () => {
  it('resume a medição em até 300 caracteres', () => {
    const d = novaMedicao('a');
    d.movel = 'Roupeiro de 2 portas de correr';
    d.profundidadeLivre = mm(600);
    const p = parede();
    p.pontos = [ponto({ tipo: 'tomada' }), ponto({ tipo: 'tomada' }), ponto({ tipo: 'janela' })];
    d.paredes = [p];
    const n = notaParaVisao(d, p, analisarParede(p, d.profundidadeLivre));
    expect(n).toBe('Roupeiro de 2 portas de correr; parede de 2418 mm (varia 12 mm); altura livre 2592 mm; profundidade livre 600 mm; 2 tomada, 1 janela na parede');
    d.movel = 'x'.repeat(400);
    expect(notaParaVisao(d, p, analisarParede(p, null)).length).toBe(300);
  });
});
