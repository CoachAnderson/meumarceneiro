/**
 * Exportação para CNC: um arquivo DXF por lado furado de cada peça.
 *
 * Formato DXF R12 (AC1009), o mais aceito por programas de nesting e CAM.
 * Unidade: milímetro. Origem (0, 0) no canto da ponta 1 com a borda da frente;
 * X ao longo do comprimento (sentido do veio), Y ao longo da largura.
 *
 * O contorno é a MEDIDA DE CORTE (já descontada a fita). Os furos são medidos
 * nas peças acabadas e deslocados aqui pela fita das bordas da origem, para
 * caírem no lugar certo depois de passar a fita.
 *
 * Cada usinagem vai numa camada cujo nome diz a ferramenta e a profundidade,
 * para o programa da máquina associar uma vez e reaproveitar:
 *   CONTORNO               corte passante da peça
 *   FURO_D5_P12            furo vertical Ø5 com 12 mm de profundidade
 *   FURO_D4_PASSANTE       furo que atravessa a peça
 *   CANAL_L6_P8            canal (área a rebaixar) de 6 mm de largura, 8 de fundo
 *   TOPO_D8_P34            furo horizontal no topo (linha da borda para dentro, no
 *                          comprimento do furo); só para máquinas com furação
 *                          horizontal — a maioria das CNCs de nesting ignora
 */
import { medidaDeCorte, type OpcoesMedidaCorte } from "./corte";
import type { ItemLista } from "./pecas";
import type { Dmm } from "./unidades";

export type LadoDxf = "A" | "B";

export interface ArquivoDxf {
  nome: string;
  lado: LadoDxf;
  conteudo: string;
}

export interface PecaDxf {
  codigo: string;
  nome: string;
  quantidade: number;
  /** Medida de corte em mm. */
  comprimentoMm: number;
  larguraMm: number;
  espessuraMm: number;
  arquivos: ArquivoDxf[];
  /** Furos de topo (fora do alcance da CNC de nesting). */
  furosDeTopo: number;
  avisos: string[];
}

interface Entidade {
  camada: string;
  tipo: "circulo" | "retangulo" | "linha";
  /** mm */
  x: number;
  y: number;
  r?: number;
  x2?: number;
  y2?: number;
}

const COR: Record<string, number> = { CONTORNO: 7, FURO: 1, CANAL: 3, TOPO: 6 };

/** Número em mm com até 2 casas, ponto decimal, sem zeros sobrando. */
export function numeroDxf(v: number): string {
  const r = Math.round(v * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toFixed(2).replace(/\.?0+$/, "");
}

/** Medida em décimos de mm para o nome da camada: 25 → "2.5", 120 → "12". */
const mmCamada = (dmm: number) => numeroDxf(dmm / 10);

/** Nome de arquivo seguro: sem acento, sem espaço, sem barra. */
export function nomeDeArquivo(texto: string): string {
  return (
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "peca"
  );
}

/** Escreve um DXF R12 mínimo, com as camadas usadas e as entidades. */
export function escreverDxf(
  larguraMm: number,
  alturaMm: number,
  entidades: readonly Entidade[],
  comentario: string[],
): string {
  const l: string[] = [];
  const par = (codigo: number, valor: string | number) =>
    l.push(
      String(codigo),
      typeof valor === "number" ? numeroDxf(valor) : valor,
    );
  for (const c of comentario) par(999, c.replace(/[\r\n]+/g, " "));
  par(0, "SECTION");
  par(2, "HEADER");
  par(9, "$ACADVER");
  par(1, "AC1009");
  par(9, "$EXTMIN");
  par(10, 0);
  par(20, 0);
  par(9, "$EXTMAX");
  par(10, larguraMm);
  par(20, alturaMm);
  par(0, "ENDSEC");

  const camadas = [...new Set(["CONTORNO", ...entidades.map((e) => e.camada)])];
  par(0, "SECTION");
  par(2, "TABLES");
  par(0, "TABLE");
  par(2, "LTYPE");
  par(70, "1");
  par(0, "LTYPE");
  par(2, "CONTINUOUS");
  par(70, "0");
  par(3, "Solid line");
  par(72, "65");
  par(73, "0");
  par(40, 0);
  par(0, "ENDTAB");
  par(0, "TABLE");
  par(2, "LAYER");
  par(70, String(camadas.length));
  for (const c of camadas) {
    par(0, "LAYER");
    par(2, c);
    par(70, "0");
    par(62, String(COR[c.split("_")[0]!] ?? 7));
    par(6, "CONTINUOUS");
  }
  par(0, "ENDTAB");
  par(0, "ENDSEC");

  par(0, "SECTION");
  par(2, "ENTITIES");
  const retangulo = (
    camada: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ) => {
    par(0, "POLYLINE");
    par(8, camada);
    par(66, "1");
    par(10, 0);
    par(20, 0);
    par(30, 0);
    par(70, "1");
    for (const [x, y] of [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
    ] as const) {
      par(0, "VERTEX");
      par(8, camada);
      par(10, x);
      par(20, y);
      par(30, 0);
    }
    par(0, "SEQEND");
    par(8, camada);
  };
  retangulo("CONTORNO", 0, 0, larguraMm, alturaMm);
  for (const e of entidades) {
    if (e.tipo === "circulo") {
      par(0, "CIRCLE");
      par(8, e.camada);
      par(10, e.x);
      par(20, e.y);
      par(30, 0);
      par(40, e.r!);
    } else if (e.tipo === "linha") {
      par(0, "LINE");
      par(8, e.camada);
      par(10, e.x);
      par(20, e.y);
      par(30, 0);
      par(11, e.x2!);
      par(21, e.y2!);
      par(31, 0);
    } else {
      retangulo(e.camada, e.x, e.y, e.x2!, e.y2!);
    }
  }
  par(0, "ENDSEC");
  par(0, "EOF");
  return l.join("\r\n") + "\r\n";
}

/**
 * Arquivos DXF de uma peça da lista. Lado A: a face com mais usinagens (vai
 * com o contorno e com os furos passantes). Lado B: a outra face, se tiver
 * usinagem, já espelhada para a peça virada sobre o comprimento (a borda de
 * trás passa para baixo).
 */
export function dxfDaPeca(item: ItemLista, opcoes: OpcoesMedidaCorte): PecaDxf {
  const corte = medidaDeCorte(item, opcoes);
  const W = corte.comprimento / 10;
  const H = corte.largura / 10;
  const desconto = opcoes.espessuraFitaCmm - (opcoes.sobremedidaCmm ?? 0);
  // Posição acabada (dmm) → posição na peça cortada (mm).
  const xDe = (u: Dmm) => (u * 10 - (item.bordas.ext1 ? desconto : 0)) / 100;
  const yDe = (v: Dmm) => (v * 10 - (item.bordas.frente ? desconto : 0)) / 100;
  const avisos: string[] = [];

  // Face de cada usinagem: sinal da direção (+ ou −) da espessura da peça.
  const sinal = (face: string | undefined) =>
    face ? (face.endsWith("+") ? "+" : "-") : null;
  const contagem = { "+": 0, "-": 0 };
  for (const u of item.usinagens) {
    // Topo e passante não decidem o lado: o passante sai do lado A, atravessando.
    const s =
      u.tipo === "furos"
        ? u.topo || u.passante
          ? null
          : sinal(u.face)
        : sinal(u.face);
    if (s) contagem[s] += u.tipo === "furos" ? u.centros.length : 1;
  }
  const ladoA: "+" | "-" = contagem["-"] > contagem["+"] ? "-" : "+";
  const porLado: Record<LadoDxf, Entidade[]> = { A: [], B: [] };
  let furosDeTopo = 0;

  for (const u of item.usinagens) {
    if (u.tipo === "canal_fundo") {
      const s = sinal(u.face);
      if (!s)
        avisos.push(
          `${item.codigo}: a face do canal não foi identificada; ele foi posto no lado A. Confira antes de usinar.`,
        );
      const lado: LadoDxf = !s || s === ladoA ? "A" : "B";
      const inicio = u.inicio ?? item.largura - u.distanciaTras - u.largura;
      porLado[lado].push({
        camada: `CANAL_L${mmCamada(u.largura)}_P${mmCamada(u.profundidade)}`,
        tipo: "retangulo",
        x: 0,
        y: yDe(inicio as Dmm),
        x2: W,
        y2: yDe((inicio + u.largura) as Dmm),
      });
      continue;
    }
    if (u.topo) {
      // Na borda: a linha entra na peça no comprimento do furo.
      for (const c of u.centros) {
        const p = u.profundidade / 10;
        let x = xDe(c.u);
        let y = yDe(c.v);
        let [dx, dy] = [0, 0];
        if (c.u === 0) [x, dx] = [0, p];
        else if (c.u === item.comprimento) [x, dx] = [W, -p];
        else if (c.v === 0) [y, dy] = [0, p];
        else [y, dy] = [H, -p];
        porLado.A.push({
          camada: `TOPO_D${mmCamada(u.diametro)}_P${mmCamada(u.profundidade)}`,
          tipo: "linha",
          x,
          y,
          x2: x + dx,
          y2: y + dy,
        });
        furosDeTopo++;
      }
      continue;
    }
    const lado: LadoDxf = u.passante || sinal(u.face) === ladoA ? "A" : "B";
    const camada = u.passante
      ? `FURO_D${mmCamada(u.diametro)}_PASSANTE`
      : `FURO_D${mmCamada(u.diametro)}_P${mmCamada(u.profundidade)}`;
    for (const c of u.centros)
      porLado[lado].push({
        camada,
        tipo: "circulo",
        x: xDe(c.u),
        y: yDe(c.v),
        r: u.diametro / 20,
      });
  }

  // Lado B: peça virada sobre o comprimento — Y espelhado.
  const espelhar = (e: Entidade): Entidade => ({
    ...e,
    y: H - e.y,
    ...(e.y2 !== undefined ? { y2: H - e.y2 } : {}),
  });
  porLado.B = porLado.B.map(espelhar);

  // Usinagem fora da peça cortada: nunca deveria acontecer; avisa em vez de esconder.
  for (const lado of ["A", "B"] as const) {
    for (const e of porLado[lado]) {
      const pontos = [
        [e.x, e.y],
        ...(e.x2 !== undefined ? [[e.x2, e.y2!]] : []),
      ];
      if (
        pontos.some(
          ([x, y]) =>
            x! < -0.01 || y! < -0.01 || x! > W + 0.01 || y! > H + 0.01,
        )
      ) {
        avisos.push(
          `${item.codigo}: há usinagem fora da peça na camada ${e.camada} (lado ${lado}).`,
        );
        break;
      }
    }
  }

  const base = `${item.codigo}_${nomeDeArquivo(item.nome)}`;
  const info = (lado: LadoDxf) => [
    `Meu Marceneiro - ${item.codigo} ${item.nome} - lado ${lado}`,
    `Quantidade ${item.quantidade}; corte ${numeroDxf(W)} x ${numeroDxf(H)} x ${numeroDxf(item.espessura / 10)} mm; unidade mm`,
    lado === "A"
      ? "Origem: ponta 1 com a borda da frente; X no comprimento (veio)"
      : "Lado B: peca virada sobre o comprimento (borda de tras embaixo)",
  ];
  const arquivos: ArquivoDxf[] = [
    {
      nome: `${base}_ladoA.dxf`,
      lado: "A",
      conteudo: escreverDxf(W, H, porLado.A, info("A")),
    },
  ];
  if (porLado.B.length)
    arquivos.push({
      nome: `${base}_ladoB.dxf`,
      lado: "B",
      conteudo: escreverDxf(W, H, porLado.B, info("B")),
    });

  return {
    codigo: item.codigo,
    nome: item.nome,
    quantidade: item.quantidade,
    comprimentoMm: W,
    larguraMm: H,
    espessuraMm: item.espessura / 10,
    arquivos,
    furosDeTopo,
    avisos,
  };
}
