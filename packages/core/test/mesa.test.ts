import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  calcularMesa,
  dmm,
  lerLargurasGabinetes,
  gerarListaPecas,
  intersecao,
  mm,
  MONTAGEM_MESA,
  orientacaoDaPeca,
  type Componente,
  type EntradaMesa,
  type Furo,
  type ResultadoModulo,
} from "../src";

/** Mesa 1200 × 750 × 600, MDF 18, saia, borda engrossada na frente (1 faixa de 80 mm). */
const REF: EntradaMesa = {
  L: mm(1200),
  A: mm(750),
  P: mm(600),
  espessura: mm(18),
  engrosso: { bordas: "frente", camadas: 1 },
  furacao: { juncao: "minifix", engrosso: true },
};
const por = (r: ResultadoModulo, id: string) =>
  r.componentes.find((c) => c.id === id) as Componente;
const furos = (c: Componente, finalidade: Furo["finalidade"]) =>
  (c.furos ?? []).filter((f) => f.finalidade === finalidade);
const centros = (c: Componente, finalidade: Furo["finalidade"]) =>
  furos(c, finalidade).flatMap((f) => f.centros.map((p) => [p.u, p.v]));

function noMovel(c: Componente, f: Furo) {
  const [ec, el, ee] = orientacaoDaPeca(c)!;
  const k = c.caixa;
  const tam = { x: k.dx, y: k.dy, z: k.dz };
  return f.centros.map((p) => {
    const g = { x: 0, y: 0, z: 0 };
    g[ec] = k[ec] + p.u;
    g[el] = k[el] + p.v;
    g[ee] = f.topo
      ? k[ee] + Math.floor(c.espessura / 2)
      : f.face.endsWith("+")
        ? k[ee] + tam[ee]
        : k[ee];
    return g;
  });
}

describe("mesa com pés de MDF (conferido à mão)", () => {
  const r = calcularMesa(REF);

  it("peças e medidas", () => {
    expect(r.erros).toEqual([]);
    const medida = (id: string) => {
      const c = por(r, id);
      return [c.comprimento, c.largura, c.espessura];
    };
    expect(r.componentes.map((c) => c.id)).toEqual([
      "tampo",
      "engrosso_frente_1",
      "pe_esquerdo",
      "pe_direito",
      "saia",
    ]);
    expect(medida("tampo")).toEqual([mm(1200), mm(600), mm(18)]);
    expect(medida("engrosso_frente_1")).toEqual([mm(1200), mm(80), mm(18)]);
    // Pé: 750 − 18 = 732 de altura; 600 − 80 (atrás da faixa) = 520 de profundidade.
    expect(medida("pe_esquerdo")).toEqual([mm(732), mm(520), mm(18)]);
    // Saia: 1200 − 2 × 18 = 1164 entre os pés, 300 de altura, encostada atrás.
    expect(medida("saia")).toEqual([mm(1164), mm(300), mm(18)]);
    expect(por(r, "saia").caixa).toMatchObject({
      x: mm(18),
      y: mm(432),
      z: mm(582),
    });
    expect(por(r, "pe_direito").caixa).toMatchObject({
      x: mm(1182),
      z: mm(80),
    });
  });

  it("o recuo da frente dos pés foi levado para trás da faixa, com aviso", () => {
    expect(r.avisos.map((a) => a.codigo)).toEqual(
      expect.arrayContaining(["recuo_ajustado", "fita_larga"]),
    );
    expect(r.avisos.find((a) => a.codigo === "fita_larga")!.mensagem).toContain(
      "36 mm",
    );
  });

  it("minifix: pé no tampo (2 + 2), saia nos pés (2 + 2), saia no tampo (4) = 12", () => {
    expect(r.juncoes.length).toBe(5);
    expect(r.ferragens.find((f) => f.codigo === "minifix")?.quantidade).toBe(
      12,
    );
    const pe = por(r, "pe_esquerdo");
    // Haste no topo de cima do pé, a 50 mm da frente e do fundo do pé.
    expect(furos(pe, "minifix_haste")[0]).toMatchObject({
      face: "y+",
      topo: true,
    });
    expect(centros(pe, "minifix_haste")).toEqual([
      [mm(732), mm(50)],
      [mm(732), mm(470)],
    ]);
    // Tambor na face de dentro do pé, 34 mm abaixo do topo.
    expect(furos(pe, "minifix_tambor")[0]!.face).toBe("x+");
    expect(centros(pe, "minifix_tambor").map((p) => p[0])).toEqual([
      mm(698),
      mm(698),
    ]);
    // A saia recebe a haste nas pontas e no topo de cima.
    expect(
      furos(por(r, "saia"), "minifix_haste")
        .map((f) => f.face)
        .sort(),
    ).toEqual(["x+", "x-", "y+"]);
    // O tampo recebe os pinos por baixo.
    expect(furos(por(r, "tampo"), "minifix_pino")[0]!.face).toBe("y-");
  });

  it("borda engrossada: 6 parafusos de 50 em 50 até 1150, no meio da faixa (40 mm), passante na faixa e guia de 10 mm no tampo", () => {
    const faixa = por(r, "engrosso_frente_1");
    expect(furos(faixa, "engrosso")[0]).toMatchObject({
      face: "y-",
      passante: true,
      diametro: mm(4),
      profundidade: mm(18),
    });
    expect(centros(faixa, "engrosso")).toEqual(
      [50, 270, 490, 710, 930, 1150].map((x) => [mm(x), mm(40)]),
    );
    const guia = furos(por(r, "tampo"), "engrosso")[0]!;
    expect(guia).toMatchObject({
      face: "y-",
      diametro: mm(3),
      profundidade: mm(10),
    });
    expect(noMovel(por(r, "tampo"), guia).map((g) => `${g.x},${g.z}`)).toEqual(
      noMovel(faixa, furos(faixa, "engrosso")[0]!).map((g) => `${g.x},${g.z}`),
    );
    expect(
      r.ferragens.find((f) => f.codigo === "parafuso_engrosso")?.quantidade,
    ).toBe(6);
  });

  it("fita: tampo em volta toda, pé na frente e atrás, saia embaixo, faixa sem fita", () => {
    const lista = gerarListaPecas({
      resultado: r,
      montagem: MONTAGEM_MESA,
      fundo: "nenhum",
      espessuraFundo: mm(0),
    });
    const b = (papel: string) =>
      lista.itens.find((i) => i.papel === papel)!.bordas;
    expect(b("tampo")).toEqual({
      frente: true,
      tras: true,
      ext1: true,
      ext2: true,
    });
    expect(b("pe")).toEqual({
      frente: true,
      tras: true,
      ext1: false,
      ext2: false,
    });
    expect(b("saia")).toEqual({
      frente: true,
      tras: false,
      ext1: false,
      ext2: false,
    });
    expect(b("engrosso")).toEqual({
      frente: false,
      tras: false,
      ext1: false,
      ext2: false,
    });
    // Os dois pés são iguais (espelhados só na face do tambor): duas linhas na lista.
    expect(
      lista.itens
        .filter((i) => i.papel === "pe")
        .reduce((s, i) => s + i.quantidade, 0),
    ).toBe(2);
  });
});

describe("variações", () => {
  it("em volta toda, 2 faixas: faixas na frente, atrás e nas pontas; cada camada fura numa linha diferente", () => {
    const r = calcularMesa({
      ...REF,
      engrosso: { bordas: "todos", camadas: 2 },
    });
    expect(r.erros).toEqual([]);
    expect(r.componentes.filter((c) => c.papel === "engrosso").length).toBe(8);
    // Pés recuados 80 mm nas pontas, na frente e atrás.
    expect(por(r, "pe_esquerdo").caixa).toMatchObject({
      x: mm(80),
      z: mm(80),
      dz: mm(440),
    });
    const linha = (id: string) =>
      new Set(
        furos(por(r, id), "engrosso")
          .filter((f) => f.passante)
          .flatMap((f) => f.centros.map((p) => p.v)),
      );
    expect(linha("engrosso_frente_1")).toEqual(
      new Set([Math.floor(mm(80) / 3)]),
    );
    expect(linha("engrosso_frente_2")).toEqual(
      new Set([Math.floor((mm(80) * 2) / 3)]),
    );
    // A faixa de baixo é parafusada na de cima, não no tampo.
    expect(
      furos(por(r, "engrosso_frente_1"), "engrosso")
        .map((f) => f.passante ?? false)
        .sort(),
    ).toEqual([false, true]);
    expect(r.avisos.find((a) => a.codigo === "fita_larga")!.mensagem).toContain(
      "54 mm",
    );
  });

  it("sem borda engrossada: pé a 50 mm da frente, sem faixa e sem aviso de fita", () => {
    const r = calcularMesa({ ...REF, engrosso: undefined });
    expect(r.componentes.some((c) => c.papel === "engrosso")).toBe(false);
    expect(por(r, "pe_esquerdo").caixa.z).toBe(mm(50));
    expect(r.avisos.map((a) => a.codigo)).not.toContain("fita_larga");
  });

  it("com travessa: 80 mm de altura a 100 mm do chão, presa nos dois pés", () => {
    const r = calcularMesa({ ...REF, travessa: true });
    expect(r.erros).toEqual([]);
    expect(por(r, "travessa").caixa).toMatchObject({
      y: mm(100),
      dy: mm(80),
      x: mm(18),
    });
    expect(r.juncoes.filter((j) => j.a === "travessa").length).toBe(2);
  });

  it("sem saia nem travessa: aviso de que a mesa pode balançar", () => {
    expect(
      calcularMesa({ ...REF, saia: false }).avisos.map((a) => a.codigo),
    ).toContain("mesa_sem_travamento");
  });

  it("erros claros: medidas fora, pé raso, saia alta, travessa batendo na saia", () => {
    expect(calcularMesa({ ...REF, A: mm(200) }).erros[0]!.codigo).toBe(
      "entrada_fora_limite",
    );
    expect(
      calcularMesa({ ...REF, parametros: { mrf: 3500, mrt: 2000 } }).erros[0]!
        .codigo,
    ).toBe("pe_raso");
    expect(
      calcularMesa({ ...REF, parametros: { msa: 7000 } }).erros[0]!.codigo,
    ).toBe("saia_alta");
    expect(
      calcularMesa({ ...REF, travessa: true, parametros: { mtp: 4000 } })
        .erros[0]!.codigo,
    ).toBe("pecas_colidem");
    expect(
      calcularMesa({ ...REF, parametros: { mel: 10 } }).erros[0]!.codigo,
    ).toBe("parametro_fora_limite");
  });
});

describe("propriedades: qualquer mesa válida", () => {
  const entrada = fc.record({
    L: fc.integer({ min: 400, max: 3000 }),
    A: fc.integer({ min: 300, max: 1200 }),
    P: fc.integer({ min: 250, max: 1200 }),
    e: fc.constantFrom(15, 18, 25),
    saia: fc.boolean(),
    travessa: fc.boolean(),
    bordas: fc.constantFrom(
      "nenhuma" as const,
      "frente" as const,
      "tres_lados" as const,
      "todos" as const,
    ),
    camadas: fc.constantFrom(1 as const, 2 as const),
    juncao: fc.constantFrom(
      "minifix" as const,
      "cavilha" as const,
      "parafuso" as const,
    ),
    mrf: fc.integer({ min: 0, max: 2000 }),
    msa: fc.integer({ min: 500, max: 5000 }),
    mtp: fc.integer({ min: 0, max: 3000 }),
  });
  const montar = (
    v: typeof entrada extends fc.Arbitrary<infer T> ? T : never,
  ) =>
    calcularMesa({
      L: mm(v.L),
      A: mm(v.A),
      P: mm(v.P),
      espessura: mm(v.e),
      saia: v.saia,
      travessa: v.travessa,
      engrosso: { bordas: v.bordas, camadas: v.camadas },
      parametros: { mrf: v.mrf, msa: v.msa, mtp: v.mtp },
      furacao: { juncao: v.juncao, engrosso: true },
    });

  it("nenhuma peça ocupa o espaço de outra; tudo fica dentro do tampo e no chão", () => {
    fc.assert(
      fc.property(entrada, (v) => {
        const r = montar(v);
        fc.pre(r.valido);
        for (let i = 0; i < r.componentes.length; i++)
          for (let j = i + 1; j < r.componentes.length; j++)
            expect(
              intersecao(r.componentes[i]!.caixa, r.componentes[j]!.caixa),
            ).toBeNull();
        for (const c of r.componentes) {
          expect(c.caixa.x).toBeGreaterThanOrEqual(0);
          expect(c.caixa.x + c.caixa.dx).toBeLessThanOrEqual(mm(v.L));
          expect(c.caixa.z + c.caixa.dz).toBeLessThanOrEqual(mm(v.P));
          expect(c.caixa.y + c.caixa.dy).toBeLessThanOrEqual(mm(v.A));
          expect(orientacaoDaPeca(c)).not.toBeNull();
        }
        expect(
          Math.min(
            ...r.componentes
              .filter((c) => c.papel === "pe")
              .map((c) => c.caixa.y),
          ),
        ).toBe(0);
      }),
    );
  }, 600_000);

  it("furos dentro das peças, sem varar, e os dois lados de cada junção no mesmo ponto", () => {
    fc.assert(
      fc.property(entrada, (v) => {
        const r = montar(v);
        fc.pre(r.valido);
        for (const c of r.componentes) {
          for (const f of c.furos ?? []) {
            for (const p of f.centros) {
              expect(p.u).toBeGreaterThanOrEqual(0);
              expect(p.u).toBeLessThanOrEqual(c.comprimento);
              expect(p.v).toBeGreaterThanOrEqual(0);
              expect(p.v).toBeLessThanOrEqual(c.largura);
              if (!f.topo) {
                expect(p.u - f.diametro / 2).toBeGreaterThanOrEqual(0);
                expect(p.v - f.diametro / 2).toBeGreaterThanOrEqual(0);
              }
            }
            if (!f.passante && !f.topo)
              expect(f.profundidade, `${c.id} ${f.finalidade}`).toBeLessThan(
                c.espessura,
              );
          }
        }
        // Face e topo de cada junção.
        const [naFace, noTopo] =
          v.juncao === "minifix"
            ? ["minifix_pino", "minifix_haste"]
            : v.juncao === "cavilha"
              ? ["cavilha", "cavilha"]
              : ["parafuso", "parafuso_guia"];
        const face = new Map<string, number>();
        const topo = new Map<string, number>();
        for (const c of r.componentes) {
          const [, , ee] = orientacaoDaPeca(c)!;
          for (const f of c.furos ?? []) {
            if (f.finalidade === naFace && !f.topo)
              for (const g of noMovel(c, f)) {
                if (f.passante)
                  g[ee] += f.face.endsWith("+") ? -c.espessura : c.espessura;
                face.set(
                  `${g.x},${g.y},${g.z}`,
                  (face.get(`${g.x},${g.y},${g.z}`) ?? 0) + 1,
                );
              }
            if (f.finalidade === noTopo && f.topo)
              for (const g of noMovel(c, f))
                topo.set(
                  `${g.x},${g.y},${g.z}`,
                  (topo.get(`${g.x},${g.y},${g.z}`) ?? 0) + 1,
                );
          }
        }
        expect([...face.entries()].sort()).toEqual([...topo.entries()].sort());
        // Os dois pés sempre presos no tampo.
        expect(
          r.juncoes.filter((j) => j.b === "tampo" && j.a.startsWith("pe_"))
            .length,
        ).toBe(2);
        // Furos da borda engrossada: passante na faixa e guia na peça de cima, no mesmo ponto.
        const passantes = r.componentes.flatMap((c) =>
          (c.furos ?? [])
            .filter((f) => f.finalidade === "engrosso" && f.passante)
            .flatMap((f) =>
              noMovel(c, f).map((g) => `${g.x},${g.z},${g.y + c.espessura}`),
            ),
        );
        const guias = r.componentes.flatMap((c) =>
          (c.furos ?? [])
            .filter((f) => f.finalidade === "engrosso" && !f.passante)
            .flatMap((f) => noMovel(c, f).map((g) => `${g.x},${g.z},${g.y}`)),
        );
        expect(passantes.sort()).toEqual(guias.sort());
      }),
    );
  }, 600_000);
});

describe('sapatas niveladoras nos pés de MDF (conferido à mão)', () => {
  it('2 furos de topo por pé, Ø10 × 20, a 50 mm da frente e de trás do pé, no meio da espessura', () => {
    const r = calcularMesa({ ...REF, sapatas: true });
    expect(r.erros).toEqual([]);
    const pe = por(r, 'pe_esquerdo');
    expect(furos(pe, 'sapata')[0]).toMatchObject({ face: 'y-', topo: true, diametro: mm(10), profundidade: mm(20) });
    // Pé de 520 de profundidade: 50 e 470.
    expect(centros(pe, 'sapata')).toEqual([[0, mm(50)], [0, mm(470)]]);
    expect(r.ferragens.find((f) => f.codigo === 'sapata_niveladora')?.quantidade).toBe(4);
  });
  it('furo largo demais para o pé vira erro', () => {
    expect(calcularMesa({ ...REF, sapatas: true, espessura: mm(15), parametros: { snd: 140 } }).erros[0]!.codigo).toBe('furo_largo');
  });
});

describe('mesa com pés comprados (conferido à mão)', () => {
  const BASE: EntradaMesa = { modelo: 'pes_comprados', L: mm(1200), A: mm(750), P: mm(800), espessura: mm(18), furacao: { juncao: 'minifix', engrosso: true } };

  it('4 pés de 50 mm a 50 mm das bordas, 732 mm de altura, fora da lista de corte', () => {
    const r = calcularMesa(BASE);
    expect(r.erros).toEqual([]);
    const pes = r.componentes.filter((c) => c.papel === 'pe_comprado');
    expect(pes.map((p) => [p.caixa.x, p.caixa.z, p.caixa.dy])).toEqual([[mm(50), mm(50), mm(732)], [mm(1100), mm(50), mm(732)], [mm(50), mm(700), mm(732)], [mm(1100), mm(700), mm(732)]]);
    expect(pes.every((p) => p.comprado)).toBe(true);
    const lista = gerarListaPecas({ resultado: r, montagem: MONTAGEM_MESA, fundo: 'nenhum', espessuraFundo: mm(0) });
    expect(lista.itens.map((i) => i.nome)).toEqual(['Tampo']);
  });

  it('chapa: 4 furos-guia Ø3 × 10 em quadrado de 60 mm centrado no pé (75 ± 30)', () => {
    const r = calcularMesa(BASE);
    const t = furos(por(r, 'tampo'), 'fixacao_pe');
    expect(t[0]).toMatchObject({ face: 'y-', diametro: mm(3), profundidade: mm(10) });
    const pts = centros(por(r, 'tampo'), 'fixacao_pe');
    expect(pts.length).toBe(16);
    for (const p of [[45, 45], [105, 45], [45, 105], [105, 105], [1095, 695], [1155, 755]]) expect(pts).toContainEqual(p.map((v) => mm(v!)));
    expect(r.ferragens).toEqual(expect.arrayContaining([expect.objectContaining({ codigo: 'pe_mesa', quantidade: 4, comprimento: mm(732) }), expect.objectContaining({ codigo: 'parafuso_pe', quantidade: 16 })]));
  });

  it('com borda engrossada na frente: o pé recua para a chapa ficar atrás da faixa (80 + 15 = 95 mm)', () => {
    const r = calcularMesa({ ...BASE, engrosso: { bordas: 'frente', camadas: 1 } });
    expect(r.erros).toEqual([]);
    expect(r.componentes.find((c) => c.id === 'pe_comprado_1')!.caixa.z).toBe(mm(95));
    expect(r.avisos.map((a) => a.codigo)).toContain('recuo_ajustado');
  });
});

describe('bancada suspensa (conferido à mão)', () => {
  const BASE: EntradaMesa = { modelo: 'suspensa', L: mm(1200), A: mm(900), P: mm(500), espessura: mm(18), furacao: { juncao: 'minifix', engrosso: true } };

  it('mão-francesa: 3 suportes (100, 600, 1100), furos a 30 e 180 mm da parede', () => {
    const r = calcularMesa(BASE);
    expect(r.erros).toEqual([]);
    expect(r.componentes.filter((c) => c.papel === 'suporte').length).toBe(3);
    const pts = centros(por(r, 'tampo'), 'suporte');
    expect(pts).toEqual([100, 600, 1100].flatMap((x) => [[mm(x), mm(320)], [mm(x), mm(470)]]));
    expect(r.ferragens).toEqual(expect.arrayContaining([expect.objectContaining({ codigo: 'mao_francesa', quantidade: 3 }), expect.objectContaining({ codigo: 'parafuso_suporte', quantidade: 6 })]));
    expect(r.avisos.map((a) => a.codigo)).toContain('fixacao_parede');
  });

  it('suporte invisível: furo de topo Ø10 × 150 na borda de trás, sem peça no desenho', () => {
    const r = calcularMesa({ ...BASE, suporte: 'invisivel' });
    expect(r.erros).toEqual([]);
    const f = furos(por(r, 'tampo'), 'suporte')[0]!;
    expect(f).toMatchObject({ face: 'z+', topo: true, diametro: mm(10), profundidade: mm(150) });
    expect(f.centros).toEqual([100, 600, 1100].map((x) => ({ u: mm(x), v: mm(500) })));
    expect(r.componentes.some((c) => c.papel === 'suporte')).toBe(false);
    expect(calcularMesa({ ...BASE, suporte: 'invisivel', espessura: mm(15) }).erros[0]!.codigo).toBe('tampo_fino');
  });

  it('borda engrossada atrás não existe na parede; bancada longa ganha mais suportes', () => {
    expect(calcularMesa({ ...BASE, engrosso: { bordas: 'todos', camadas: 1 } }).erros[0]!.codigo).toBe('borda_na_parede');
    expect(calcularMesa({ ...BASE, L: mm(2400) }).componentes.filter((c) => c.papel === 'suporte').length).toBe(5);
  });
});

describe('tampo sobre gabinetes (conferido à mão)', () => {
  const BASE: EntradaMesa = { modelo: 'sobre_gabinetes', L: mm(1), A: mm(900), P: mm(600), espessura: mm(18), gabinetes: [mm(600), mm(400), mm(800)], furacao: { juncao: 'minifix', engrosso: true } };

  it('tampo de 1800 mm (600 + 400 + 800), gabinetes de referência embaixo, fora da lista', () => {
    const r = calcularMesa(BASE);
    expect(r.erros).toEqual([]);
    expect(por(r, 'tampo').comprimento).toBe(mm(1800));
    const g = r.componentes.filter((c) => c.papel === 'gabinete_ref');
    expect(g.map((c) => [c.caixa.x, c.caixa.dx, c.caixa.dy, c.caixa.z, c.caixa.dz])).toEqual([
      [0, mm(600), mm(882), mm(20), mm(580)],
      [mm(600), mm(400), mm(882), mm(20), mm(580)],
      [mm(1000), mm(800), mm(882), mm(20), mm(580)],
    ]);
    expect(gerarListaPecas({ resultado: r, montagem: MONTAGEM_MESA, fundo: 'nenhum', espessuraFundo: mm(0) }).itens.map((i) => i.nome)).toEqual(['Tampo']);
  });

  it('fixação: 2 por gabinete na frente (70 mm) e atrás (550 mm), a 50 mm das laterais', () => {
    const r = calcularMesa(BASE);
    const pts = centros(por(r, 'tampo'), 'fixacao_tampo');
    const xs = [50, 550, 650, 950, 1050, 1750];
    expect(pts).toEqual([...xs.map((x) => [mm(x), mm(70)]), ...xs.map((x) => [mm(x), mm(550)])]);
    expect(r.ferragens.find((f) => f.codigo === 'parafuso_tampo')?.quantidade).toBe(12);
    expect(r.avisos.map((a) => a.codigo)).toContain('furar_gabinete');
  });

  it('com balanço nas pontas: o tampo cresce e os gabinetes andam junto', () => {
    const r = calcularMesa({ ...BASE, parametros: { tbe: 300, tbd: 200 } });
    expect(por(r, 'tampo').comprimento).toBe(mm(1850));
    expect(r.componentes.find((c) => c.id === 'gabinete_1')!.caixa.x).toBe(mm(30));
  });

  it('borda engrossada: régua de apoio atrás, gabinetes 18 mm mais baixos, parafuso na faixa e fora da linha dos parafusos dela', () => {
    const r = calcularMesa({ ...BASE, engrosso: { bordas: 'frente', camadas: 1 } });
    expect(r.erros).toEqual([]);
    expect(por(r, 'engrosso_tras_1').nome).toBe('Régua de apoio, trás');
    expect(r.componentes.find((c) => c.id === 'gabinete_1')!.caixa.dy).toBe(mm(864));
    const frente = por(r, 'engrosso_frente_1');
    const tras = por(r, 'engrosso_tras_1');
    // Faixa 80 mm, balanço 20: apoio de 20 a 80; parafuso da faixa a 40 → fixação a 65.
    expect(new Set(centros(frente, 'fixacao_tampo').map((p) => p[1]))).toEqual(new Set([mm(65)]));
    // Régua 520–600; parafuso dela a 560 → fixação a 540 (20 mm da régua).
    expect(new Set(centros(tras, 'fixacao_tampo').map((p) => p[1]))).toEqual(new Set([mm(20)]));
    expect(furos(por(r, 'tampo'), 'fixacao_tampo')).toEqual([]);
    expect(r.avisos.map((a) => a.codigo)).not.toContain('furos_encostados');
  });

  it('erros claros: sem gabinete, balanço maior que a faixa, borda engrossada atrás', () => {
    expect(calcularMesa({ ...BASE, gabinetes: [] }).erros[0]!.codigo).toBe('gabinetes_invalidos');
    expect(calcularMesa({ ...BASE, engrosso: { bordas: 'frente', camadas: 1 }, parametros: { tbf: 900 } }).erros[0]!.codigo).toBe('faixa_sem_apoio');
    expect(calcularMesa({ ...BASE, engrosso: { bordas: 'todos', camadas: 1 } }).erros[0]!.codigo).toBe('borda_na_parede');
  });
});

describe('propriedades: os quatro modelos', () => {
  it('sem colisão, furos dentro das peças e sem furos encostados; comprados fora da lista', () => {
    fc.assert(
      fc.property(
        fc.record({
          modelo: fc.constantFrom('pes_mdf' as const, 'pes_comprados' as const, 'suspensa' as const, 'sobre_gabinetes' as const),
          L: fc.integer({ min: 400, max: 2600 }),
          A: fc.integer({ min: 500, max: 1100 }),
          P: fc.integer({ min: 300, max: 1000 }),
          e: fc.constantFrom(15, 18, 25),
          bordas: fc.constantFrom('nenhuma' as const, 'frente' as const, 'tres_lados' as const),
          camadas: fc.constantFrom(1 as const, 2 as const),
          suporte: fc.constantFrom('mao_francesa' as const, 'cantoneira' as const, 'invisivel' as const),
          gabinetes: fc.array(fc.integer({ min: 150, max: 1200 }), { minLength: 1, maxLength: 5 }),
          tbf: fc.integer({ min: 0, max: 600 }),
          sapatas: fc.boolean(),
        }),
        (v) => {
          const r = calcularMesa({
            modelo: v.modelo, L: mm(v.L), A: mm(v.A), P: mm(v.P), espessura: mm(v.e), sapatas: v.sapatas, suporte: v.suporte, travessa: true,
            gabinetes: v.gabinetes.map((g) => mm(g)), engrosso: { bordas: v.bordas, camadas: v.camadas }, parametros: { tbf: v.tbf },
            furacao: { juncao: 'minifix', engrosso: true },
          });
          fc.pre(r.valido);
          for (let i = 0; i < r.componentes.length; i++) for (let j = i + 1; j < r.componentes.length; j++) expect(intersecao(r.componentes[i]!.caixa, r.componentes[j]!.caixa)).toBeNull();
          for (const c of r.componentes) {
            expect(orientacaoDaPeca(c), c.id).not.toBeNull();
            for (const f of c.furos ?? []) {
              for (const p of f.centros) {
                expect(p.u).toBeGreaterThanOrEqual(0);
                expect(p.u).toBeLessThanOrEqual(c.comprimento);
                expect(p.v).toBeGreaterThanOrEqual(0);
                expect(p.v).toBeLessThanOrEqual(c.largura);
                if (!f.topo) expect(Math.min(p.u, p.v, c.comprimento - p.u, c.largura - p.v), `${c.id} ${f.finalidade}`).toBeGreaterThanOrEqual(f.diametro / 2);
              }
              if (!f.passante && !f.topo) expect(f.profundidade + 15).toBeLessThanOrEqual(c.espessura);
            }
          }
          expect(r.avisos.map((a) => a.codigo), JSON.stringify(v)).not.toContain('furos_encostados');
          const lista = gerarListaPecas({ resultado: r, montagem: MONTAGEM_MESA, fundo: 'nenhum', espessuraFundo: mm(0) });
          expect(lista.itens.flatMap((i) => i.ids).some((id) => r.componentes.find((c) => c.id === id)?.comprado)).toBe(false);
          // O tampo sempre existe e fica no topo.
          expect(Math.max(...r.componentes.map((c) => c.caixa.y + c.caixa.dy))).toBe(mm(v.A));
        },
      ),
    );
  }, 600_000);
});

describe('lerLargurasGabinetes', () => {
  it('lê as larguras na ordem, com +, ; ou espaço, e aceita "mm" e vírgula decimal', () => {
    expect(lerLargurasGabinetes('600 + 400 + 800')).toEqual({ valores: [dmm(6000), dmm(4000), dmm(8000)], erro: null });
    expect(lerLargurasGabinetes('600mm; 450,5 mm 300')).toEqual({ valores: [dmm(6000), dmm(4505), dmm(3000)], erro: null });
  });

  it('devolve mensagem (sem lançar erro) para texto inválido, vazio, zero ou ambíguo', () => {
    expect(lerLargurasGabinetes('600 + abc').erro).toMatch(/^Gabinete 2: "abc" não é uma medida válida/);
    expect(lerLargurasGabinetes('   ').erro).toMatch(/Informe a largura/);
    expect(lerLargurasGabinetes('600 + 0').erro).toMatch(/Gabinete 2: a largura precisa ser maior que zero/);
    expect(lerLargurasGabinetes('-600').erro).toMatch(/Gabinete 1/);
    expect(lerLargurasGabinetes('2.750').erro).toMatch(/ambíguo/);
    expect(lerLargurasGabinetes(Array(21).fill('300').join(' + ')).erro).toMatch(/no máximo 20/);
  });

  it('nunca lança erro, qualquer que seja o texto', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (texto) => {
        const r = lerLargurasGabinetes(texto);
        expect(r.erro === null ? r.valores.length > 0 && r.valores.every((v) => v > 0) : r.valores.length === 0).toBe(true);
      }),
      { numRuns: Number(process.env.FC_RUNS ?? 300) },
    );
  });
});
