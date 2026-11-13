import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  calcularMesa,
  calcularModulo,
  dxfDaPeca,
  gerarListaPecas,
  mm,
  modeloPadrao,
  MONTAGEM_MESA,
  nomeDeArquivo,
  numeroDxf,
  type EntradaModulo,
  type ItemLista,
} from "../src";

/** Leitor mínimo de DXF R12: só o que o gerador escreve. */
interface Lido {
  versao: string | null;
  camadas: string[];
  circulos: Array<{ camada: string; x: number; y: number; r: number }>;
  linhas: Array<{
    camada: string;
    x: number;
    y: number;
    x2: number;
    y2: number;
  }>;
  poligonos: Array<{
    camada: string;
    pontos: Array<[number, number]>;
    fechado: boolean;
  }>;
}
function lerDxf(texto: string): Lido {
  const l = texto.split("\r\n");
  expect(l.at(-1)).toBe("");
  l.pop();
  expect(l.length % 2).toBe(0);
  const pares: Array<[number, string]> = [];
  for (let i = 0; i < l.length; i += 2) pares.push([Number(l[i]), l[i + 1]!]);
  expect(pares.at(-1)).toEqual([0, "EOF"]);
  const r: Lido = {
    versao: null,
    camadas: [],
    circulos: [],
    linhas: [],
    poligonos: [],
  };
  for (let i = 0; i < pares.length; i++) {
    const [c, v] = pares[i]!;
    if (c === 9 && v === "$ACADVER") r.versao = pares[i + 1]![1];
    if (c !== 0) continue;
    const campos = (inicio: number) => {
      const m = new Map<number, string>();
      for (let j = inicio + 1; j < pares.length && pares[j]![0] !== 0; j++)
        m.set(pares[j]![0], pares[j]![1]);
      return m;
    };
    const m = campos(i);
    const n = (k: number) => Number(m.get(k));
    if (v === "LAYER") r.camadas.push(m.get(2)!);
    if (v === "CIRCLE")
      r.circulos.push({ camada: m.get(8)!, x: n(10), y: n(20), r: n(40) });
    if (v === "LINE")
      r.linhas.push({
        camada: m.get(8)!,
        x: n(10),
        y: n(20),
        x2: n(11),
        y2: n(21),
      });
    if (v === "POLYLINE") {
      const pontos: Array<[number, number]> = [];
      let j = i + 1;
      for (; pares[j]![1] !== "SEQEND"; j++) {
        if (pares[j]![0] === 0 && pares[j]![1] === "VERTEX") {
          const mv = campos(j);
          pontos.push([Number(mv.get(10)), Number(mv.get(20))]);
        }
      }
      r.poligonos.push({
        camada: m.get(8)!,
        pontos,
        fechado: m.get(70) === "1",
      });
    }
  }
  return r;
}

const REF: EntradaModulo = {
  L: mm(600),
  A: mm(700),
  P: mm(550),
  espessuraEstrutura: mm(18),
  espessuraFundo: mm(6),
  parametros: { c: 80, g: 10, r: 100 },
};
const FITA = { espessuraFitaCmm: 45 };
function lista(e: Partial<EntradaModulo> = {}) {
  const r = calcularModulo(
    modeloPadrao("tampo_base_entre_laterais", "fundo_canal"),
    {
      ...REF,
      interior: {
        divisorias: 0,
        prateleiras: { quantidade: 2, tipo: "regulavel" },
      },
      frentes: {
        modo: "sobreposta",
        espessuraFrente: mm(18),
        espessuraGaveta: mm(15),
        vaos: { tipo: "porta", portas: 1, lado: "esquerda" },
      },
      furacao: {
        juncao: "minifix",
        calcoDobradica: true,
        puxadorEntreFuros: mm(128),
      },
      ...e,
    },
  );
  expect(r.erros).toEqual([]);
  return gerarListaPecas({
    resultado: r,
    montagem: "tampo_base_entre_laterais",
    fundo: "fundo_canal",
    espessuraFundo: mm(6),
  });
}
const item = (l: ReturnType<typeof lista>, nome: string) =>
  l.itens.find((i) => i.nome === nome) as ItemLista;
const tem = (lista: Array<{ x: number; y: number }>, x: number, y: number) =>
  lista.some((p) => Math.abs(p.x - x) < 0.001 && Math.abs(p.y - y) < 0.001);

describe("formato", () => {
  it("números com ponto e até 2 casas; nomes de arquivo sem acento", () => {
    expect(numeroDxf(549.55)).toBe("549.55");
    expect(numeroDxf(12)).toBe("12");
    expect(numeroDxf(2.5)).toBe("2.5");
    expect(numeroDxf(-0.001)).toBe("0");
    expect(nomeDeArquivo("Prateleira regulável / 2")).toBe(
      "Prateleira-regulavel-2",
    );
  });
});

describe("módulo 600 × 700 × 550 com porta, minifix e fita de 0,45 mm (conferido à mão)", () => {
  const l = lista();

  it("lateral esquerda: contorno de corte 700 × 549,6 (550 − 0,45 de fita, arredondado para cima como no plano de corte), um arquivo só", () => {
    const d = dxfDaPeca(item(l, "Lateral esquerda"), FITA);
    expect(d.arquivos.map((a) => a.nome)).toEqual([
      "P01_Lateral-esquerda_ladoA.dxf",
    ]);
    const x = lerDxf(d.arquivos[0]!.conteudo);
    expect(x.versao).toBe("AC1009");
    expect(x.poligonos.find((p) => p.camada === "CONTORNO")).toEqual({
      camada: "CONTORNO",
      fechado: true,
      pontos: [
        [0, 0],
        [700, 0],
        [700, 549.6],
        [0, 549.6],
      ],
    });
    expect([d.comprimentoMm, d.larguraMm, d.espessuraMm]).toEqual([
      700, 549.6, 18,
    ]);
  });

  it("lateral: pinos do minifix a 9 e 691 mm, 50 e 500 mm da frente acabada (49,55 e 499,55 no corte)", () => {
    const x = lerDxf(
      dxfDaPeca(item(l, "Lateral esquerda"), FITA).arquivos[0]!.conteudo,
    );
    const pinos = x.circulos.filter((c) => c.camada === "FURO_D5_P12");
    for (const [px, py] of [
      [9, 49.55],
      [9, 499.55],
      [691, 49.55],
      [691, 499.55],
    ])
      expect(tem(pinos, px!, py!), `${px},${py}`).toBe(true);
    expect(pinos.every((c) => c.r === 2.5)).toBe(true);
    // Sistema 32 das prateleiras, Ø5 × 10.
    expect(x.circulos.filter((c) => c.camada === "FURO_D5_P10").length).toBe(
      30,
    );
  });

  it("lateral: canal de 6 × 8 em todo o comprimento, na mesma face dos pinos (lado A)", () => {
    const it = item(l, "Lateral esquerda");
    const canal = it.usinagens.find((u) => u.tipo === "canal_fundo")!;
    const x = lerDxf(dxfDaPeca(it, FITA).arquivos[0]!.conteudo);
    const r = x.poligonos.find((p) => p.camada === "CANAL_L6_P8")!;
    const yIni = 550 - canal.distanciaTras / 10 - 6 - 0.45;
    expect(r.pontos).toEqual(
      [
        [0, yIni],
        [700, yIni],
        [700, yIni + 6],
        [0, yIni + 6],
      ].map(([a, b]) => [a, Math.round(b! * 100) / 100]),
    );
  });

  it("tampo: haste do minifix no topo, linha de 34 mm entrando pelas duas pontas", () => {
    const x = lerDxf(dxfDaPeca(item(l, "Tampo"), FITA).arquivos[0]!.conteudo);
    const topo = x.linhas.filter((c) => c.camada === "TOPO_D8_P34");
    expect(topo.length).toBe(4);
    expect(topo.filter((t) => t.x === 0).every((t) => t.x2 === 34)).toBe(true);
    expect(topo.filter((t) => t.x === 564).every((t) => t.x2 === 530)).toBe(
      true,
    );
    expect(new Set(topo.map((t) => t.y))).toEqual(new Set([49.55, 499.55]));
    expect(x.circulos.filter((c) => c.camada === "FURO_D15_P13").length).toBe(
      4,
    );
  });

  it("porta (fita em volta): copas Ø35 × 13 a 100 mm e K 22,5 → (99,55; 22,05); puxador passante no mesmo arquivo", () => {
    const d = dxfDaPeca(item(l, "Porta"), FITA);
    expect(d.arquivos.length).toBe(1);
    const x = lerDxf(d.arquivos[0]!.conteudo);
    const copas = x.circulos.filter((c) => c.camada === "FURO_D35_P13");
    expect(copas.length).toBe(2);
    expect(tem(copas, 99.55, 22.05)).toBe(true);
    expect(copas[0]!.r).toBe(17.5);
    expect(
      x.circulos.filter((c) => c.camada === "FURO_D5_PASSANTE").length,
    ).toBe(2);
  });

  it("peça sem usinagem (fundo, prateleira): só o contorno", () => {
    const x = lerDxf(dxfDaPeca(item(l, "Fundo"), FITA).arquivos[0]!.conteudo);
    expect(x.circulos.length + x.linhas.length).toBe(0);
    expect(x.poligonos.map((p) => p.camada)).toEqual(["CONTORNO"]);
  });

  it("sem fita: contorno igual à medida acabada e furos sem deslocamento", () => {
    const x = lerDxf(
      dxfDaPeca(item(l, "Lateral esquerda"), { espessuraFitaCmm: 0 })
        .arquivos[0]!.conteudo,
    );
    expect(x.poligonos[0]!.pontos[2]).toEqual([700, 550]);
    expect(tem(x.circulos, 9, 50)).toBe(true);
  });
});

describe("lado B: furos nas duas faces", () => {
  it("gaveta com corrediça e caixa parafusada: a lateral da gaveta tem os dois lados; o B vem espelhado", () => {
    const l = lista({
      interior: { divisorias: 0 },
      frentes: {
        modo: "sobreposta",
        espessuraFrente: mm(18),
        espessuraGaveta: mm(15),
        vaos: { tipo: "gavetas", gavetas: 2 },
      },
      furacao: { juncao: "minifix", juncaoGaveta: "cavilha", corredica: true },
    });
    const it = l.itens.find((i) => i.papel === "lateral_gaveta")!;
    const d = dxfDaPeca(it, FITA);
    expect(d.arquivos.map((a) => a.lado)).toEqual(["A", "B"]);
    const A = lerDxf(d.arquivos[0]!.conteudo);
    const B = lerDxf(d.arquivos[1]!.conteudo);
    // B tem o contorno também, para posicionar a peça virada.
    expect(B.poligonos.find((p) => p.camada === "CONTORNO")).toBeDefined();
    const furosFace = (lado: "A" | "B") =>
      it.usinagens.filter((u) => u.tipo === "furos" && !u.topo && !u.passante)
        .length;
    expect(furosFace("A")).toBeGreaterThan(0);
    // Espelhamento: todo furo do B está a H − y do que seria sem virar.
    const H = d.larguraMm;
    const semVirar = it.usinagens.flatMap((u) =>
      u.tipo === "furos" && !u.topo
        ? u.centros.map((c) => (c.v * 10 - (it.bordas.frente ? 45 : 0)) / 100)
        : [],
    );
    for (const c of B.circulos)
      expect(semVirar.some((y) => Math.abs(H - y - c.y) < 0.001)).toBe(true);
    expect(A.circulos.length + B.circulos.length).toBe(
      it.usinagens.reduce(
        (s, u) => s + (u.tipo === "furos" && !u.topo ? u.centros.length : 0),
        0,
      ),
    );
  });
});

describe("propriedades: qualquer móvel ou mesa", () => {
  it("todo arquivo é legível, tudo fica dentro do contorno e nenhum furo se perde", () => {
    fc.assert(
      fc.property(
        fc.record({
          mesa: fc.boolean(),
          L: fc.integer({ min: 400, max: 2000 }),
          A: fc.integer({ min: 400, max: 1200 }),
          P: fc.integer({ min: 300, max: 700 }),
          frente: fc.constantFrom(
            "aberto" as const,
            "porta" as const,
            "gavetas" as const,
          ),
          juncao: fc.constantFrom(
            "minifix" as const,
            "cavilha" as const,
            "parafuso" as const,
          ),
          fita: fc.integer({ min: 0, max: 200 }),
          sobra: fc.integer({ min: 0, max: 30 }),
        }),
        (v) => {
          const r = v.mesa
            ? calcularMesa({
                L: mm(v.L),
                A: mm(v.A),
                P: mm(v.P),
                espessura: mm(18),
                travessa: true,
                engrosso: { bordas: "tres_lados", camadas: 1 },
                furacao: { juncao: v.juncao, engrosso: true },
              })
            : calcularModulo(
                modeloPadrao("tampo_base_entre_laterais", "fundo_canal"),
                {
                  ...REF,
                  L: mm(v.L),
                  A: mm(v.A),
                  P: mm(v.P),
                  interior: {
                    divisorias: 1,
                    prateleiras: { quantidade: 1, tipo: "regulavel" },
                  },
                  frentes: {
                    modo: "sobreposta",
                    espessuraFrente: mm(18),
                    espessuraGaveta: mm(15),
                    vaos: {
                      tipo: v.frente,
                      portas: 1,
                      lado: "esquerda",
                      gavetas: 2,
                    },
                  },
                  furacao: {
                    juncao: v.juncao,
                    calcoDobradica: true,
                    puxadorEntreFuros: mm(96),
                    juncaoGaveta: "parafuso",
                    corredica: true,
                    frenteGaveta: true,
                  },
                },
              );
          fc.pre(r.valido);
          const l = gerarListaPecas({
            resultado: r,
            montagem: v.mesa ? MONTAGEM_MESA : "tampo_base_entre_laterais",
            fundo: v.mesa ? "nenhum" : "fundo_canal",
            espessuraFundo: mm(6),
          });
          for (const it of l.itens) {
            const d = dxfDaPeca(it, {
              espessuraFitaCmm: v.fita,
              sobremedidaCmm: Math.min(v.sobra, v.fita),
            });
            expect(d.avisos, it.nome).toEqual([]);
            let circulos = 0;
            let linhas = 0;
            for (const a of d.arquivos) {
              const x = lerDxf(a.conteudo);
              const dentro = (px: number, py: number) =>
                px >= -0.01 &&
                py >= -0.01 &&
                px <= d.comprimentoMm + 0.01 &&
                py <= d.larguraMm + 0.01;
              for (const c of x.circulos)
                expect(
                  dentro(c.x - c.r, c.y - c.r) || dentro(c.x, c.y),
                  `${it.nome} ${c.camada}`,
                ).toBe(true);
              for (const c of x.circulos) expect(dentro(c.x, c.y)).toBe(true);
              for (const t of x.linhas)
                expect(dentro(t.x, t.y) && dentro(t.x2, t.y2)).toBe(true);
              for (const p of x.poligonos)
                for (const [px, py] of p.pontos)
                  expect(dentro(px, py)).toBe(true);
              // Toda camada usada está declarada.
              const usadas = new Set(
                [...x.circulos, ...x.linhas, ...x.poligonos].map(
                  (e) => e.camada,
                ),
              );
              for (const c of usadas) expect(x.camadas).toContain(c);
              circulos += x.circulos.length;
              linhas += x.linhas.length;
            }
            const furos = it.usinagens.reduce(
              (s, u) =>
                s + (u.tipo === "furos" && !u.topo ? u.centros.length : 0),
              0,
            );
            const topo = it.usinagens.reduce(
              (s, u) =>
                s + (u.tipo === "furos" && u.topo ? u.centros.length : 0),
              0,
            );
            expect(circulos).toBe(furos);
            expect(linhas).toBe(topo);
            expect(d.furosDeTopo).toBe(topo);
          }
        },
      ),
      { numRuns: Number(process.env.FC_RUNS ?? 150) },
    );
  }, 600_000);
});
