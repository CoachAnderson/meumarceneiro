/**
 * Mesa com pés de MDF: tampo, dois pés em painel, saia (painel de fundo) e
 * travessa de baixo, com borda engrossada opcional.
 *
 * Devolve o mesmo resultado do módulo de caixa (componentes com caixa 3D), então
 * lista de peças, plano de corte, furação, orçamento e 3D funcionam igual.
 *
 * Eixos como no módulo: x da esquerda para a direita, y do chão para cima,
 * z da frente para trás. Tudo em décimos de mm, inteiro.
 */
import { juntarFerragens, type FerragemNecessaria } from "./frentes";
import {
  furarMontagem,
  PARAMETROS_FURACAO,
  type EntradaFuracao,
} from "./furacao";
import { intersecao } from "./geometria";
import type { Componente, Problema, ResultadoModulo } from "./modulo";
import type { DefinicaoParametro } from "./regra";
import { dmm, formatarMm, type Dmm } from "./unidades";

/** Onde vai a faixa que engrossa a borda do tampo. */
export type BordaEngrossada = "nenhuma" | "frente" | "tres_lados" | "todos";

export interface EntradaMesa {
  /** Largura, altura total (até o topo do tampo) e profundidade. */
  L: Dmm;
  A: Dmm;
  P: Dmm;
  espessura: Dmm;
  /** Painel de fundo entre os pés, logo abaixo do tampo. Padrão: sim. */
  saia?: boolean;
  /** Travessa entre os pés, perto do chão. Padrão: não. */
  travessa?: boolean;
  /** Borda engrossada: em quais bordas e quantas chapas de faixa (1 = tampo + 1 faixa). */
  engrosso?: { bordas: BordaEngrossada; camadas: 1 | 2 };
  parametros?: Readonly<Record<string, number>>;
  furacao?: EntradaFuracao;
}

export const PARAMETROS_MESA: readonly DefinicaoParametro[] = [
  {
    nome: "mrl",
    rotulo: "Pés: recuo nas pontas do tampo",
    padrao: 0,
    min: 0,
    max: 5000,
    ajuda: "Com as pontas engrossadas, o pé fica no mínimo atrás da faixa.",
  },
  {
    nome: "mrf",
    rotulo: "Pés: recuo da frente do tampo",
    padrao: 500,
    min: 0,
    max: 5000,
  },
  {
    nome: "mrt",
    rotulo: "Pés: recuo de trás do tampo",
    padrao: 0,
    min: 0,
    max: 5000,
  },
  { nome: "msa", rotulo: "Saia: altura", padrao: 3000, min: 500, max: 9000 },
  {
    nome: "msr",
    rotulo: "Saia e travessa: recuo da traseira dos pés",
    padrao: 0,
    min: 0,
    max: 5000,
  },
  { nome: "mta", rotulo: "Travessa: altura", padrao: 800, min: 300, max: 3000 },
  {
    nome: "mtp",
    rotulo: "Travessa: distância do chão",
    padrao: 1000,
    min: 0,
    max: 6000,
  },
  {
    nome: "mel",
    rotulo: "Borda engrossada: largura da faixa",
    padrao: 800,
    min: 300,
    max: 2000,
  },
];

function falha(erros: Problema[], avisos: Problema[]): ResultadoModulo {
  return {
    valido: false,
    erros,
    medidas: {},
    vaos: [],
    componentes: [],
    avisos,
    ferragens: [],
    juncoes: [],
  };
}

export function calcularMesa(entrada: EntradaMesa): ResultadoModulo {
  const erros: Problema[] = [];
  const avisos: Problema[] = [];
  const { L, A, P, espessura: e } = entrada;

  const faixa = (v: number, min: number, max: number, nome: string) => {
    if (!Number.isSafeInteger(v) || v < min || v > max)
      erros.push({
        codigo: "entrada_fora_limite",
        mensagem: `${nome} precisa ficar entre ${formatarMm(dmm(min))} e ${formatarMm(dmm(max))} mm.`,
      });
  };
  faixa(L, 3000, 30000, "Largura");
  faixa(A, 3000, 12000, "Altura");
  faixa(P, 2500, 12000, "Profundidade");
  faixa(e, 90, 500, "Espessura");

  // Parâmetros da mesa e da furação, com os padrões.
  const valores = new Map<string, number>();
  for (const d of [...PARAMETROS_MESA, ...PARAMETROS_FURACAO]) {
    const v = entrada.parametros?.[d.nome] ?? d.padrao;
    if (!Number.isSafeInteger(v) || v < d.min || v > d.max) {
      erros.push({
        codigo: "parametro_fora_limite",
        mensagem: `${d.rotulo}: use de ${formatarMm(dmm(d.min))} a ${formatarMm(dmm(d.max))} mm.`,
      });
    }
    valores.set(d.nome, v);
  }
  if (erros.length) return falha(erros, avisos);
  const n = (nome: string) => valores.get(nome)!;

  const bordas = entrada.engrosso?.bordas ?? "nenhuma";
  const camadas = bordas === "nenhuma" ? 0 : (entrada.engrosso?.camadas ?? 1);
  if (camadas !== 0 && camadas !== 1 && camadas !== 2)
    return falha(
      [
        {
          codigo: "entrada_fora_limite",
          mensagem: "Borda engrossada: use 1 ou 2 faixas.",
        },
      ],
      avisos,
    );
  const engFrente = camadas > 0;
  const engPontas =
    camadas > 0 && (bordas === "tres_lados" || bordas === "todos");
  const engTras = camadas > 0 && bordas === "todos";
  const w = n("mel");

  // Pés atrás das faixas: o recuo nunca é menor que a largura da faixa daquele lado.
  const ajustar = (param: string, engrossado: boolean, lado: string) => {
    const v = n(param);
    if (engrossado && v < w) {
      avisos.push({
        codigo: "recuo_ajustado",
        mensagem: `Pés: o recuo ${lado} passou de ${formatarMm(dmm(v))} para ${formatarMm(dmm(w))} mm, para o pé ficar atrás da faixa da borda engrossada.`,
      });
      return w;
    }
    return v;
  };
  const rl = ajustar("mrl", engPontas, "nas pontas");
  const rf = ajustar("mrf", engFrente, "da frente");
  const rt = ajustar("mrt", engTras, "de trás");

  const yTampo = A - e;
  const alturaPe = yTampo;
  const profPe = P - rf - rt;
  const vaoEntrePes = L - 2 * rl - 2 * e;
  if (alturaPe < 2000)
    erros.push({
      codigo: "mesa_baixa",
      mensagem: `Os pés ficam com ${formatarMm(dmm(alturaPe))} mm de altura; o mínimo é 200 mm.`,
    });
  if (profPe < 1000)
    erros.push({
      codigo: "pe_raso",
      mensagem: `Os pés ficam com ${formatarMm(dmm(profPe))} mm de profundidade (mínimo 100 mm). Diminua os recuos.`,
    });
  if (vaoEntrePes < 2000)
    erros.push({
      codigo: "mesa_estreita",
      mensagem: `Sobram ${formatarMm(dmm(vaoEntrePes))} mm entre os pés; o mínimo é 200 mm.`,
    });
  if (camadas > 0 && (2 * w >= P || ((engPontas && 2 * w >= L) as boolean)))
    erros.push({
      codigo: "faixa_larga",
      mensagem: "A faixa da borda engrossada é larga demais para este tampo.",
    });
  if (camadas > 0 && yTampo - camadas * e < 2000)
    erros.push({
      codigo: "mesa_baixa",
      mensagem: "Com a borda engrossada, sobra pouca altura embaixo do tampo.",
    });
  if (erros.length) return falha(erros, avisos);

  const componentes: Componente[] = [];
  const c = (
    x: Omit<Componente, "caixa"> & {
      x: number;
      y: number;
      z: number;
      dx: number;
      dy: number;
      dz: number;
    },
  ): Componente => {
    const { x: cx, y, z, dx, dy, dz, ...resto } = x;
    return {
      ...resto,
      caixa: {
        x: dmm(cx),
        y: dmm(y),
        z: dmm(z),
        dx: dmm(dx),
        dy: dmm(dy),
        dz: dmm(dz),
      },
    };
  };

  componentes.push(
    c({
      id: "tampo",
      papel: "tampo",
      nome: "Tampo",
      material: "estrutura",
      comprimento: L,
      largura: P,
      espessura: e,
      origem: "L × P",
      x: 0,
      y: yTampo,
      z: 0,
      dx: L,
      dy: e,
      dz: P,
    }),
  );

  // Faixas da borda engrossada, empilhadas embaixo do tampo.
  for (let k = 1; k <= camadas; k++) {
    const y = yTampo - k * e;
    const sufixo = camadas > 1 ? ` (${k}ª camada)` : "";
    const zIni = engFrente ? w : 0;
    const zFim = engTras ? P - w : P;
    componentes.push(
      c({
        id: `engrosso_frente_${k}`,
        papel: "engrosso",
        nome: `Faixa da borda, frente${sufixo}`,
        material: "estrutura",
        comprimento: L,
        largura: dmm(w),
        espessura: e,
        origem: "L × faixa",
        x: 0,
        y,
        z: 0,
        dx: L,
        dy: e,
        dz: w,
      }),
    );
    if (engTras)
      componentes.push(
        c({
          id: `engrosso_tras_${k}`,
          papel: "engrosso",
          nome: `Faixa da borda, trás${sufixo}`,
          material: "estrutura",
          comprimento: L,
          largura: dmm(w),
          espessura: e,
          origem: "L × faixa",
          x: 0,
          y,
          z: P - w,
          dx: L,
          dy: e,
          dz: w,
        }),
      );
    if (engPontas) {
      for (const [lado, x] of [
        ["esquerda", 0],
        ["direita", L - w],
      ] as const) {
        componentes.push(
          c({
            id: `engrosso_${lado}_${k}`,
            papel: "engrosso",
            nome: `Faixa da borda, ponta ${lado}${sufixo}`,
            material: "estrutura",
            comprimento: dmm(zFim - zIni),
            largura: dmm(w),
            espessura: e,
            origem: "P − faixas × faixa",
            x,
            y,
            z: zIni,
            dx: w,
            dy: e,
            dz: zFim - zIni,
          }),
        );
      }
    }
  }

  for (const [lado, x] of [
    ["esquerdo", rl],
    ["direito", L - rl - e],
  ] as const) {
    componentes.push(
      c({
        id: `pe_${lado === "esquerdo" ? "esquerdo" : "direito"}`,
        papel: "pe",
        nome: `Pé ${lado}`,
        material: "estrutura",
        comprimento: dmm(alturaPe),
        largura: dmm(profPe),
        espessura: e,
        origem: "A − tampo × P − recuos",
        x,
        y: 0,
        z: rf,
        dx: e,
        dy: alturaPe,
        dz: profPe,
      }),
    );
  }

  // Saia e travessa: entre os pés, encostadas atrás (com o recuo msr).
  const zTrasPe = P - rt;
  const zPainel = zTrasPe - n("msr") - e;
  if ((entrada.saia ?? true) || entrada.travessa) {
    if (zPainel < rf) {
      erros.push({
        codigo: "saia_fora",
        mensagem: "O recuo da saia passa da frente dos pés.",
      });
      return falha(erros, avisos);
    }
  }
  if (entrada.saia ?? true) {
    const hs = n("msa");
    if (hs > alturaPe - 1000)
      erros.push({
        codigo: "saia_alta",
        mensagem: `A saia de ${formatarMm(dmm(hs))} mm não cabe: os pés têm ${formatarMm(dmm(alturaPe))} mm.`,
      });
    else
      componentes.push(
        c({
          id: "saia",
          papel: "saia",
          nome: "Saia",
          material: "estrutura",
          comprimento: dmm(vaoEntrePes),
          largura: dmm(hs),
          espessura: e,
          origem: "vão entre os pés × altura da saia",
          x: rl + e,
          y: yTampo - hs,
          z: zPainel,
          dx: vaoEntrePes,
          dy: hs,
          dz: e,
        }),
      );
  }
  if (entrada.travessa) {
    const ht = n("mta");
    const yt = n("mtp");
    if (yt + ht > alturaPe)
      erros.push({
        codigo: "travessa_alta",
        mensagem: "A travessa passa da altura dos pés.",
      });
    else
      componentes.push(
        c({
          id: "travessa",
          papel: "travessa",
          nome: "Travessa",
          material: "estrutura",
          comprimento: dmm(vaoEntrePes),
          largura: dmm(ht),
          espessura: e,
          origem: "vão entre os pés × altura da travessa",
          x: rl + e,
          y: yt,
          z: zPainel,
          dx: vaoEntrePes,
          dy: ht,
          dz: e,
        }),
      );
  }
  if (!(entrada.saia ?? true) && !entrada.travessa) {
    avisos.push({
      codigo: "mesa_sem_travamento",
      mensagem:
        "Sem saia nem travessa, nada trava os pés um no outro; a mesa pode balançar.",
    });
  }

  // Nenhuma peça pode ocupar o espaço de outra.
  for (let i = 0; i < componentes.length; i++) {
    for (let j = i + 1; j < componentes.length; j++) {
      if (intersecao(componentes[i]!.caixa, componentes[j]!.caixa)) {
        erros.push({
          codigo: "pecas_colidem",
          mensagem: `${componentes[j]!.nome} ocupa o mesmo espaço que ${componentes[i]!.nome}. Revise as alturas e os recuos.`,
          componente: componentes[j]!.id,
        });
      }
    }
  }
  if (erros.length) return falha(erros, avisos);

  if (camadas > 0) {
    avisos.push({
      codigo: "fita_larga",
      mensagem: `Borda engrossada de ${formatarMm(dmm((camadas + 1) * e))} mm: use fita de pelo menos ${formatarMm(dmm((camadas + 1) * e + 40))} mm de largura nas bordas engrossadas. A lista conta essa fita na borda do tampo.`,
    });
  }

  const ferragens: FerragemNecessaria[] = [];
  const juncoes = entrada.furacao
    ? furarMontagem(entrada.furacao, {
        n,
        componentes,
        erros,
        avisos,
        ferragens,
      })
    : [];

  return {
    valido: erros.length === 0,
    erros,
    medidas: {
      L,
      A,
      P,
      e,
      ...Object.fromEntries(valores),
      rl,
      rf,
      rt,
      alturaPe,
      profPe,
      vaoEntrePes,
    },
    vaos: [],
    componentes,
    avisos,
    ferragens: juntarFerragens(ferragens),
    juncoes,
  };
}
