import { useEffect, useMemo } from "react";
import {
  PARAMETROS_FRENTES,
  PARAMETROS_FURACAO,
  PARAMETROS_INTERIOR,
  parametrosDaMesa,
  nomeModeloMesa,
  MONTAGEM_MESA,
  calcularMesa,
  cabeNaChapa,
  calcularModulo,
  dmm,
  formatarMm,
  gerarListaPecas,
  gerarPecas,
  lerMm,
  modeloPadrao,
  type DefinicaoParametro,
  type FrenteDoVao,
  type Dmm,
  type ResultadoModulo,
} from "@marcenaria/core";
import type { Material } from "../lib/catalogo";
import { lerCampo } from "../lib/formulario";
import { FRENTE_VAO_INICIAL, lerGabinetes, type Formulario } from "./formulario";

export const descricaoMaterial = (m: Material) =>
  `${m.nome} ${formatarMm(dmm(m.espessura_nominal_dmm))} mm${m.espessura_real_dmm ? ` (real ${formatarMm(dmm(m.espessura_real_dmm))})` : ""}`;

/**
 * Lê o formulário e roda o motor: módulo, conferência de chapa, peças e lista.
 * Também mantém uma linha de vão por divisória + 1.
 */
export function useCalculo(
  f: Formulario,
  setF: (atualizar: (atual: Formulario) => Formulario) => void,
  materiais: Material[],
) {
  const ativos = materiais.filter((m) => m.ativo);
  const matEstrutura = ativos.find((m) => m.id === f.materialEstrutura) ?? null;
  const matFundo = ativos.find((m) => m.id === f.materialFundo) ?? null;

  const campoL = lerCampo(f.L, lerMm, { obrigatorio: true, nome: "Largura" });
  const campoA = lerCampo(f.A, lerMm, { obrigatorio: true, nome: "Altura" });
  const campoP = lerCampo(f.P, lerMm, {
    obrigatorio: true,
    nome: "Profundidade",
  });
  const campoE = matEstrutura
    ? { valor: dmm(matEstrutura.espessura_calculo_dmm), erro: null }
    : lerCampo(f.espessuraEstrutura, lerMm, {
        obrigatorio: true,
        nome: "Espessura",
      });
  const campoEf = matFundo
    ? { valor: dmm(matFundo.espessura_calculo_dmm), erro: null }
    : lerCampo(f.espessuraFundo, lerMm, {
        obrigatorio: true,
        nome: "Espessura do fundo",
      });
  const matFrente = ativos.find((m) => m.id === f.materialFrente) ?? null;
  const matGaveta = ativos.find((m) => m.id === f.materialGaveta) ?? null;
  const ehMesa = f.tipo === "mesa";
  const temFrente = !ehMesa && f.vaos.some((v) => v.frente !== "aberto");
  const temGaveta = !ehMesa && f.vaos.some((v) => v.frente === "gavetas");
  const campoEp = matFrente
    ? { valor: dmm(matFrente.espessura_calculo_dmm), erro: null }
    : lerCampo(f.espessuraFrente, lerMm, {
        obrigatorio: temFrente,
        nome: "Espessura da frente",
      });
  const campoEc = matGaveta
    ? { valor: dmm(matGaveta.espessura_calculo_dmm), erro: null }
    : lerCampo(f.espessuraGaveta, lerMm, {
        obrigatorio: temGaveta,
        nome: "Espessura da caixa da gaveta",
      });
  const nDivisorias = /^\d{1,2}$/.test(f.divisorias.trim())
    ? Number(f.divisorias)
    : NaN;

  const modelo = useMemo(
    () => modeloPadrao(f.montagem, f.fundo),
    [f.montagem, f.fundo],
  );
  const modeloMesa = f.mesa.modelo;
  const sobreGabinetes = ehMesa && modeloMesa === "sobre_gabinetes";
  const definicoesParametros: DefinicaoParametro[] = ehMesa
    ? [...parametrosDaMesa(modeloMesa, f.mesa.borda !== "nenhuma"), ...PARAMETROS_FURACAO]
    : [
        ...modelo.parametros,
        ...PARAMETROS_INTERIOR,
        ...PARAMETROS_FRENTES,
        ...PARAMETROS_FURACAO,
      ];
  const regras = ehMesa
    ? `mesa_${modeloMesa}@1`
    : `${modelo.montagem.codigo}@${modelo.montagem.versao}+${modelo.fundo.codigo}@${modelo.fundo.versao}`;
  const nomeRegra = ehMesa
    ? `${nomeModeloMesa(modeloMesa)} (v1)`
    : `${modelo.nome} (montagem v${modelo.montagem.versao}, fundo v${modelo.fundo.versao})`;
  const gabinetesLidos = sobreGabinetes ? lerGabinetes(f.mesa.gabinetes) : { valores: [], erro: null };

  useEffect(() => {
    if (!Number.isSafeInteger(nDivisorias) || nDivisorias > 20) return;
    setF((atual) => {
      if (atual.vaos.length === nDivisorias + 1) return atual;
      const ultimo = atual.vaos.at(-1) ?? {
        largura: "",
        prateleiras: "0",
        tipo: "fixa" as const,
        ...FRENTE_VAO_INICIAL,
      };
      const vaos = Array.from(
        { length: nDivisorias + 1 },
        (_, i) => atual.vaos[i] ?? { ...ultimo, largura: "" },
      );
      return { ...atual, vaos };
    });
  }, [nDivisorias, setF]);

  const errosCampos: string[] = [];
  const parametros: Record<string, number> = {};
  for (const d of definicoesParametros) {
    const t = f.parametros[d.nome];
    if (t === undefined || t.trim() === "") continue;
    const c = lerCampo(t, lerMm);
    if (c.erro) errosCampos.push(`${d.rotulo}: ${c.erro}`);
    else if (c.valor !== undefined) parametros[d.nome] = c.valor;
  }
  // Na mesa, os vãos e as divisórias do armário não entram na conta.
  const errosVaos: string[] = [];
  const largurasVaos = f.vaos.map((v, i) => {
    const c = lerCampo(v.largura, lerMm);
    if (c.erro) errosVaos.push(`Vão ${i + 1}: ${c.erro}`);
    return c.valor ?? null;
  });
  const prateleiras = f.vaos.map((v, i) => {
    // Vão com gavetas não tem prateleira.
    if (v.frente === "gavetas") return { quantidade: 0, tipo: v.tipo };
    const q = /^\d{1,2}$/.test(v.prateleiras.trim())
      ? Number(v.prateleiras)
      : NaN;
    if (!Number.isSafeInteger(q))
      errosVaos.push(`Vão ${i + 1}: quantidade de prateleiras inválida.`);
    const quantidade = Number.isSafeInteger(q) ? q : 0;
    // Alturas definidas pelo desenho; as que faltam ficam automáticas.
    const textos = (v.alturas ?? []).slice(0, quantidade);
    const alturas = textos.some((t) => t.trim())
      ? Array.from({ length: quantidade }, (_, j) => {
          const t = textos[j] ?? "";
          if (!t.trim()) return null;
          const c = lerCampo(t, lerMm);
          if (c.erro) errosVaos.push(`Vão ${i + 1}, prateleira ${j + 1}: ${c.erro}`);
          return c.valor ?? null;
        })
      : undefined;
    return { quantidade, tipo: v.tipo, alturas };
  });
  const frentesVaos: FrenteDoVao[] = f.vaos.map((v, i) => {
    if (v.frente === "porta")
      return { tipo: "porta", portas: v.portas === "2" ? 2 : 1, lado: v.lado };
    if (v.frente === "gavetas") {
      const g = /^\d$/.test(v.gavetas.trim()) ? Number(v.gavetas) : NaN;
      if (!(g >= 1 && g <= 8))
        errosVaos.push(`Vão ${i + 1}: use de 1 a 8 gavetas.`);
      return { tipo: "gavetas", gavetas: g >= 1 && g <= 8 ? g : 1 };
    }
    return { tipo: "aberto" };
  });
  if (!ehMesa) {
    if (!Number.isSafeInteger(nDivisorias))
      errosVaos.push("Divisórias: informe um número inteiro.");
    errosCampos.push(...errosVaos);
  }
  for (const c of ehMesa
    ? [...(sobreGabinetes ? [] : [campoL]), campoA, campoP, campoE]
    : [campoL, campoA, campoP, campoE, campoEf, campoEp, campoEc])
    if (c.erro) errosCampos.push(c.erro);
  if (gabinetesLidos.erro) errosCampos.push(gabinetesLidos.erro);

  const prontoParaCalcular =
    errosCampos.length === 0 &&
    (sobreGabinetes || campoL.valor !== undefined) &&
    campoA.valor !== undefined &&
    campoP.valor !== undefined &&
    campoE.valor !== undefined &&
    (ehMesa ||
      (campoEf.valor !== undefined && f.vaos.length === nDivisorias + 1));

  const furacao = {
    juncao: f.furacao.juncao,
    cavilhaComMinifix: f.furacao.cavilhaComMinifix,
    calcoDobradica: f.furacao.calco,
    puxadorEntreFuros:
      f.furacao.puxador.trim() === ""
        ? null
        : dmm(Number(f.furacao.puxador) * 10),
    juncaoGaveta: f.furacao.juncaoGaveta,
    corredica: f.furacao.corredica,
    frenteGaveta: f.furacao.frenteGaveta,
    engrosso: f.furacao.engrosso,
  };

  const resultado: ResultadoModulo | null = !prontoParaCalcular
    ? null
    : ehMesa
      ? calcularMesa({
          modelo: modeloMesa,
          // No tampo sobre gabinetes, o motor calcula a largura pelas larguras dos gabinetes.
          L: (campoL.valor ?? dmm(1)) as Dmm,
          sapatas: f.mesa.sapatas,
          suporte: f.mesa.suporte,
          gabinetes: gabinetesLidos.valores,
          A: campoA.valor as Dmm,
          P: campoP.valor as Dmm,
          espessura: campoE.valor as Dmm,
          saia: f.mesa.saia,
          travessa: f.mesa.travessa,
          engrosso:
            f.mesa.borda === "nenhuma"
              ? undefined
              : {
                  bordas: f.mesa.borda,
                  camadas: f.mesa.camadas === "2" ? 2 : 1,
                },
          parametros,
          furacao,
        })
      : calcularModulo(modelo, {
          L: campoL.valor as Dmm,
          A: campoA.valor as Dmm,
          P: campoP.valor as Dmm,
          espessuraEstrutura: campoE.valor as Dmm,
          espessuraFundo: campoEf.valor as Dmm,
          parametros,
          interior: {
            divisorias: nDivisorias,
            largurasVaos: largurasVaos.some((v) => v !== null)
              ? largurasVaos
              : undefined,
            prateleiras,
          },
          frentes: temFrente
            ? {
                modo: f.modoFrente,
                espessuraFrente: (campoEp.valor ?? dmm(180)) as Dmm,
                espessuraGaveta: (campoEc.valor ?? dmm(150)) as Dmm,
                vaos: frentesVaos,
                puxador: f.puxador,
              }
            : undefined,
          furacao,
        });

  // Cada peça precisa caber em alguma chapa ativa do material escolhido.
  const problemasChapa: string[] = [];
  const avisosChapa: string[] = [];
  if (resultado?.valido) {
    for (const [material, papelMaterial] of [
      [matEstrutura, "estrutura"],
      [matFundo, "fundo"],
      [matFrente, "frente"],
      [matGaveta, "gaveta"],
    ] as const) {
      if (!material) continue;
      const chapas = material.chapas.filter((c) => c.ativo);
      if (chapas.length === 0) {
        avisosChapa.push(
          `${descricaoMaterial(material)} não tem formato de chapa cadastrado; não dá para conferir se as peças cabem.`,
        );
        continue;
      }
      for (const c of resultado.componentes.filter(
        (x) => x.material === papelMaterial && !x.comprado,
      )) {
        if (
          !chapas.some((ch) =>
            cabeNaChapa(
              c,
              { comprimento: ch.comprimento_dmm, largura: ch.largura_dmm },
              material.veio,
            ),
          )
        ) {
          problemasChapa.push(
            `${c.nome} (${formatarMm(c.comprimento)} × ${formatarMm(c.largura)} mm) não cabe em nenhuma chapa de ${descricaoMaterial(material)}` +
              (material.veio !== "sem_veio" ? ", respeitando o veio." : "."),
          );
        }
      }
    }
  }

  const qtdModulos = /^\d{1,3}$/.test(f.quantidadeModulos.trim())
    ? Number(f.quantidadeModulos)
    : NaN;
  const sobraFita = /^\d{1,3}$/.test(f.sobraFita.trim())
    ? Number(f.sobraFita)
    : NaN;
  const opcoesOk =
    qtdModulos >= 1 && qtdModulos <= 999 && sobraFita >= 0 && sobraFita <= 100;

  const entradaGeracao =
    resultado?.valido && (ehMesa || campoEf.valor !== undefined)
      ? {
          resultado,
          montagem: ehMesa ? MONTAGEM_MESA : f.montagem,
          fundo: ehMesa ? "nenhum" : f.fundo,
          espessuraFundo: (campoEf.valor ?? dmm(0)) as Dmm,
          opcoes: {
            quantidadeModulos: opcoesOk ? qtdModulos : 1,
            sobraFitaPercentual: opcoesOk ? sobraFita : 0,
            veioEstrutura: matEstrutura
              ? matEstrutura.veio !== "sem_veio"
              : true,
            veioFundo: matFundo ? matFundo.veio !== "sem_veio" : false,
            veioFrente: matFrente ? matFrente.veio !== "sem_veio" : true,
            veioGaveta: matGaveta ? matGaveta.veio !== "sem_veio" : true,
            bordas: f.bordas,
          },
        }
      : null;

  // Peças individuais: alimentam o 3D (fita por peça) mesmo quando a lista
  // ainda não pode sair (por exemplo, peça maior que a chapa).
  const pecas = entradaGeracao ? gerarPecas(entradaGeracao) : [];
  const pecasPadrao = entradaGeracao
    ? gerarPecas({
        ...entradaGeracao,
        opcoes: { ...entradaGeracao.opcoes, bordas: undefined },
      })
    : [];
  const liberado = !!entradaGeracao && problemasChapa.length === 0;
  const lista = liberado && opcoesOk ? gerarListaPecas(entradaGeracao) : null;

  return {
    ativos,
    matEstrutura,
    matFundo,
    matFrente,
    matGaveta,
    temFrente,
    temGaveta,
    campos: {
      L: campoL,
      A: campoA,
      P: campoP,
      E: campoE,
      Ef: campoEf,
      Ep: campoEp,
      Ec: campoEc,
    },
    modelo,
    regras,
    nomeRegra,
    ehMesa,
    definicoesParametros,
    errosCampos,
    resultado,
    problemasChapa,
    avisosChapa,
    pecas,
    pecasPadrao,
    lista,
    liberado,
    opcoesOk,
    sobraFita,
    qtdModulos: opcoesOk ? qtdModulos : 1,
  };
}

export type Calculo = ReturnType<typeof useCalculo>;
