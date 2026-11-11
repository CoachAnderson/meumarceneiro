import {
  PARAMETROS_FURACAO,
  type BordaEngrossada,
  type Bordas,
  type LadoDobradica,
  type TipoFrente,
  type TipoJuncao,
  type TipoJuncaoGaveta,
  type TipoPrateleira,
} from "@marcenaria/core";

export interface VaoForm {
  largura: string;
  prateleiras: string;
  tipo: TipoPrateleira;
  frente: TipoFrente;
  portas: "1" | "2";
  lado: LadoDobradica;
  gavetas: string;
}

export const FRENTE_VAO_INICIAL = {
  frente: "aberto" as TipoFrente,
  portas: "1" as const,
  lado: "esquerda" as LadoDobradica,
  gavetas: "3",
};

/**
 * Tudo o que o usuário digita no editor. É o que vai para o banco em cada
 * versão do projeto: o cálculo nunca é guardado, é refeito pelo motor.
 */
/** Que tipo de móvel o editor está desenhando. */
export type TipoMovel = "caixa" | "mesa";

export interface MesaForm {
  saia: boolean;
  travessa: boolean;
  borda: BordaEngrossada;
  /** Faixas embaixo do tampo: 1 (2 chapas aparentes) ou 2 (3 chapas). */
  camadas: "1" | "2";
}

export const MESA_INICIAL: MesaForm = {
  saia: true,
  travessa: false,
  borda: "frente",
  camadas: "1",
};

/** Medidas que o editor sugere ao trocar de tipo (só se ainda estiverem no padrão do outro tipo). */
export const MEDIDAS_PADRAO: Record<
  TipoMovel,
  { L: string; A: string; P: string }
> = {
  caixa: { L: "600", A: "700", P: "550" },
  mesa: { L: "1200", A: "750", P: "600" },
};

export interface Formulario {
  /** Ausente nos projetos antigos: armário (caixa). */
  tipo: TipoMovel;
  mesa: MesaForm;
  montagem: string;
  fundo: string;
  L: string;
  A: string;
  P: string;
  materialEstrutura: string; // id do material ou '' para espessura manual
  espessuraEstrutura: string;
  materialFundo: string;
  espessuraFundo: string;
  divisorias: string;
  vaos: VaoForm[];
  parametros: Record<string, string>;
  quantidadeModulos: string;
  sobraFita: string;
  /** Bordas trocadas pelo usuário, por id de componente. */
  bordas: Record<string, Partial<Bordas>>;
  /** Plano de corte. */
  corte: CorteForm;
  /** Frentes: modo e materiais (a configuração de cada vão fica em `vaos`). */
  modoFrente: "sobreposta" | "embutida";
  materialFrente: string;
  espessuraFrente: string;
  materialGaveta: string;
  espessuraGaveta: string;
  puxador: boolean;
  /** Item do catálogo escolhido para cada ferragem necessária (chave: código/comprimento). */
  ferragens: Record<string, string>;
  orcamento: OrcamentoForm;
  furacao: FuracaoForm;
}

export interface FuracaoForm {
  /** Como as peças da caixa se prendem. */
  juncao: TipoJuncao;
  cavilhaComMinifix: boolean;
  /** Furos do calço da dobradiça na lateral. */
  calco: boolean;
  /** Distância entre furos do puxador em mm; '' = não fura; '0' = um furo. */
  puxador: string;
  /** Montagem da caixa da gaveta. */
  juncaoGaveta: TipoJuncaoGaveta;
  /** Furos da corrediça (móvel e gaveta). */
  corredica: boolean;
  /** Furos para prender a frente da gaveta pela contrafrente. */
  frenteGaveta: boolean;
  /** Mesa: parafusos da borda engrossada. */
  engrosso: boolean;
}

/** Projeto novo: minifix e calço. O puxador fica sem furo até a marcenaria dizer a medida do dela. */
export const FURACAO_INICIAL: FuracaoForm = {
  juncao: "minifix",
  cavilhaComMinifix: false,
  calco: true,
  puxador: "",
  juncaoGaveta: "parafuso",
  corredica: true,
  frenteGaveta: true,
  engrosso: true,
};
/** Projeto salvo antes de existir a furação de montagem: continua como era. */
const FURACAO_ANTIGA: FuracaoForm = {
  juncao: "nenhuma",
  cavilhaComMinifix: false,
  calco: false,
  puxador: "",
  juncaoGaveta: "nenhuma",
  corredica: false,
  frenteGaveta: false,
  engrosso: false,
};

const JUNCOES: readonly TipoJuncao[] = [
  "nenhuma",
  "minifix",
  "cavilha",
  "parafuso",
];
const JUNCOES_GAVETA: readonly TipoJuncaoGaveta[] = [
  "nenhuma",
  "cavilha",
  "parafuso",
];

function furacao(v: unknown): FuracaoForm {
  if (!ehObjeto(v)) return FURACAO_ANTIGA;
  return {
    juncao: JUNCOES.includes(v.juncao as TipoJuncao)
      ? (v.juncao as TipoJuncao)
      : "nenhuma",
    cavilhaComMinifix: v.cavilhaComMinifix === true,
    calco: v.calco === true,
    puxador:
      typeof v.puxador === "string" && /^\d{0,4}$/.test(v.puxador)
        ? v.puxador
        : "",
    // Gravado antes de existir a furação da gaveta: continua sem ela.
    juncaoGaveta: JUNCOES_GAVETA.includes(v.juncaoGaveta as TipoJuncaoGaveta)
      ? (v.juncaoGaveta as TipoJuncaoGaveta)
      : "nenhuma",
    corredica: v.corredica === true,
    frenteGaveta: v.frenteGaveta === true,
    engrosso: v.engrosso === true,
  };
}

/** Padrão de furação da marcenaria (empresas.configuracoes.furacao): opções e medidas do gabarito. */
export interface PadraoFuracao {
  opcoes: FuracaoForm;
  parametros: Record<string, string>;
}

const NOMES_FURACAO = new Set(PARAMETROS_FURACAO.map((p) => p.nome));

export function padraoDoFormulario(f: Formulario): PadraoFuracao {
  return {
    opcoes: f.furacao,
    parametros: Object.fromEntries(
      Object.entries(f.parametros).filter(
        ([k, v]) => NOMES_FURACAO.has(k) && v.trim() !== "",
      ),
    ),
  };
}

/** Lê o padrão gravado; null se a empresa ainda não gravou (ou se o conteúdo não serve). */
export function lerPadraoFuracao(v: unknown): PadraoFuracao | null {
  if (!ehObjeto(v) || !ehObjeto(v.opcoes)) return null;
  const parametros = Object.fromEntries(
    Object.entries(textos(v.parametros)).filter(
      ([k, t]) => NOMES_FURACAO.has(k) && t.length <= 12,
    ),
  );
  return { opcoes: furacao(v.opcoes), parametros };
}

/** Aplica o padrão: troca as opções e as medidas de furação, sem tocar no resto do projeto. */
export function aplicarPadraoFuracao(
  f: Formulario,
  p: PadraoFuracao,
): Formulario {
  const outros = Object.fromEntries(
    Object.entries(f.parametros).filter(([k]) => !NOMES_FURACAO.has(k)),
  );
  return {
    ...f,
    furacao: p.opcoes,
    parametros: { ...outros, ...p.parametros },
  };
}

export interface OrcamentoForm {
  /** Horas de mão de obra (uma casa decimal: 2,5 = 2 h 30). */
  horas: string;
  valorHora: string;
  outros: Array<{ descricao: string; valor: string }>;
  /** Margem sobre o custo, em %. */
  margem: string;
  desconto: string;
  validadeDias: string;
  condicoes: string;
}

export const ORCAMENTO_INICIAL: OrcamentoForm = {
  horas: "",
  valorHora: "",
  outros: [],
  margem: "40",
  desconto: "0",
  validadeDias: "15",
  condicoes:
    "Entrada de 50% no pedido e 50% na entrega. Prazo de entrega a combinar.",
};

export interface CorteForm {
  /** id da fita do catálogo, 'manual' (espessura digitada) ou 'nenhuma' (não desconta). */
  fita: string;
  espessuraFita: string;
  sobremedidaFita: string;
  serra: string;
  refilo: string;
  refiloRetalho: string;
  sobraMinComprimento: string;
  sobraMinLargura: string;
  usarRetalhos: boolean;
}

export const CORTE_INICIAL: CorteForm = {
  fita: "nenhuma",
  espessuraFita: "0,45",
  sobremedidaFita: "0",
  serra: "4",
  refilo: "10",
  refiloRetalho: "5",
  sobraMinComprimento: "300",
  sobraMinLargura: "100",
  usarRetalhos: true,
};

export const INICIAL: Formulario = {
  tipo: "caixa",
  mesa: MESA_INICIAL,
  montagem: "tampo_base_entre_laterais",
  fundo: "fundo_canal",
  L: "600",
  A: "700",
  P: "550",
  materialEstrutura: "",
  espessuraEstrutura: "18",
  materialFundo: "",
  espessuraFundo: "6",
  divisorias: "0",
  vaos: [
    { largura: "", prateleiras: "2", tipo: "regulavel", ...FRENTE_VAO_INICIAL },
  ],
  parametros: {},
  quantidadeModulos: "1",
  sobraFita: "10",
  bordas: {},
  corte: CORTE_INICIAL,
  modoFrente: "sobreposta",
  materialFrente: "",
  espessuraFrente: "18",
  materialGaveta: "",
  espessuraGaveta: "15",
  puxador: true,
  ferragens: {},
  orcamento: ORCAMENTO_INICIAL,
  furacao: FURACAO_INICIAL,
};

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown, padrao: string) =>
  typeof v === "string" ? v : padrao;

function textos(v: unknown): Record<string, string> {
  if (!ehObjeto(v)) return {};
  return Object.fromEntries(
    Object.entries(v).filter(
      (par): par is [string, string] => typeof par[1] === "string",
    ),
  );
}

function bordas(v: unknown): Record<string, Partial<Bordas>> {
  if (!ehObjeto(v)) return {};
  const r: Record<string, Partial<Bordas>> = {};
  for (const [id, b] of Object.entries(v)) {
    if (!ehObjeto(b)) continue;
    const limpo: Partial<Bordas> = {};
    for (const k of ["frente", "tras", "ext1", "ext2"] as const)
      if (typeof b[k] === "boolean") limpo[k] = b[k];
    if (Object.keys(limpo).length) r[id] = limpo;
  }
  return r;
}

function orcamento(v: unknown): OrcamentoForm {
  if (!ehObjeto(v)) return ORCAMENTO_INICIAL;
  const outros = Array.isArray(v.outros)
    ? v.outros
        .filter(ehObjeto)
        .slice(0, 30)
        .map((o) => ({
          descricao: texto(o.descricao, ""),
          valor: texto(o.valor, ""),
        }))
    : [];
  return {
    horas: texto(v.horas, ""),
    valorHora: texto(v.valorHora, ""),
    outros,
    margem: texto(v.margem, ORCAMENTO_INICIAL.margem),
    desconto: texto(v.desconto, "0"),
    validadeDias: texto(v.validadeDias, ORCAMENTO_INICIAL.validadeDias),
    condicoes: texto(v.condicoes, ""),
  };
}

function corte(v: unknown): CorteForm {
  if (!ehObjeto(v)) return CORTE_INICIAL;
  const t = (k: keyof CorteForm) => texto(v[k], CORTE_INICIAL[k] as string);
  return {
    fita: t("fita"),
    espessuraFita: t("espessuraFita"),
    sobremedidaFita: t("sobremedidaFita"),
    serra: t("serra"),
    refilo: t("refilo"),
    refiloRetalho: t("refiloRetalho"),
    sobraMinComprimento: t("sobraMinComprimento"),
    sobraMinLargura: t("sobraMinLargura"),
    usarRetalhos: typeof v.usarRetalhos === "boolean" ? v.usarRetalhos : true,
  };
}

/**
 * Lê dados salvos (do banco ou do navegador) sem confiar no formato: campos
 * ausentes ou de tipo errado voltam ao padrão. Versões antigas abrem assim.
 */
const BORDAS_ENGROSSADAS: readonly BordaEngrossada[] = [
  "nenhuma",
  "frente",
  "tres_lados",
  "todos",
];

function mesa(v: unknown): MesaForm {
  if (!ehObjeto(v)) return MESA_INICIAL;
  return {
    saia: typeof v.saia === "boolean" ? v.saia : MESA_INICIAL.saia,
    travessa: v.travessa === true,
    borda: BORDAS_ENGROSSADAS.includes(v.borda as BordaEngrossada)
      ? (v.borda as BordaEngrossada)
      : "nenhuma",
    camadas: v.camadas === "2" ? "2" : "1",
  };
}

export function normalizarFormulario(dados: unknown): Formulario {
  if (!ehObjeto(dados)) return INICIAL;
  const vaos = Array.isArray(dados.vaos)
    ? dados.vaos.filter(ehObjeto).map((v) => ({
        largura: texto(v.largura, ""),
        prateleiras: texto(v.prateleiras, "0"),
        tipo:
          v.tipo === "regulavel" ? ("regulavel" as const) : ("fixa" as const),
        frente: (v.frente === "porta" || v.frente === "gavetas"
          ? v.frente
          : "aberto") as TipoFrente,
        portas: v.portas === "2" ? ("2" as const) : ("1" as const),
        lado:
          v.lado === "direita" ? ("direita" as const) : ("esquerda" as const),
        gavetas: texto(v.gavetas, FRENTE_VAO_INICIAL.gavetas),
      }))
    : INICIAL.vaos;
  return {
    tipo: dados.tipo === "mesa" ? "mesa" : "caixa",
    mesa: mesa(dados.mesa),
    montagem: texto(dados.montagem, INICIAL.montagem),
    fundo: texto(dados.fundo, INICIAL.fundo),
    L: texto(dados.L, INICIAL.L),
    A: texto(dados.A, INICIAL.A),
    P: texto(dados.P, INICIAL.P),
    materialEstrutura: texto(dados.materialEstrutura, ""),
    espessuraEstrutura: texto(
      dados.espessuraEstrutura,
      INICIAL.espessuraEstrutura,
    ),
    materialFundo: texto(dados.materialFundo, ""),
    espessuraFundo: texto(dados.espessuraFundo, INICIAL.espessuraFundo),
    divisorias: texto(dados.divisorias, "0"),
    vaos: vaos.length ? vaos : INICIAL.vaos,
    parametros: textos(dados.parametros),
    quantidadeModulos: texto(dados.quantidadeModulos, "1"),
    sobraFita: texto(dados.sobraFita, INICIAL.sobraFita),
    bordas: bordas(dados.bordas),
    corte: corte(dados.corte),
    modoFrente: dados.modoFrente === "embutida" ? "embutida" : "sobreposta",
    materialFrente: texto(dados.materialFrente, ""),
    espessuraFrente: texto(dados.espessuraFrente, INICIAL.espessuraFrente),
    materialGaveta: texto(dados.materialGaveta, ""),
    espessuraGaveta: texto(dados.espessuraGaveta, INICIAL.espessuraGaveta),
    puxador: typeof dados.puxador === "boolean" ? dados.puxador : true,
    ferragens: textos(dados.ferragens),
    orcamento: orcamento(dados.orcamento),
    furacao: furacao(dados.furacao),
  };
}

/** Comparação estável, para saber se há alteração não salva. */
export const mesmoFormulario = (a: Formulario, b: Formulario) =>
  JSON.stringify(a) === JSON.stringify(b);
