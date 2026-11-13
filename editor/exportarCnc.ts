import { strToU8, zipSync } from "fflate";
import {
  dxfDaPeca,
  formatarMm,
  type ItemLista,
  type OpcoesMedidaCorte,
  type PecaDxf,
} from "@marcenaria/core";
import type { Material } from "../lib/catalogo";
import { paraCsv } from "../lib/exportar";
import { NOME_MATERIAL } from "./estilo";

const LEIAME = (
  nome: string,
  fitaMm: string,
  pecas: PecaDxf[],
) => `MEU MARCENEIRO - ARQUIVOS PARA CNC
Projeto: ${nome}

UM ARQUIVO DXF POR LADO DE CADA PECA
- ..._ladoA.dxf: contorno + furos da face de cima + furos passantes + canal (se houver).
- ..._ladoB.dxf: so existe quando a peca tem furo na outra face. A peca e virada sobre o
  comprimento (a borda de tras fica embaixo); o arquivo ja vem espelhado para isso.
- A quantidade de cada peca esta em pecas.csv e no comentario do arquivo.

MEDIDAS
- Unidade: milimetro. Formato DXF R12.
- Origem (0,0): canto da ponta 1 com a borda da frente. X = comprimento (sentido do veio).
- O contorno e a MEDIDA DE CORTE: ja descontada a fita (${fitaMm} mm por borda com fita),
  arredondada para cima em 0,1 mm como no plano de corte. Os furos ja estao deslocados
  para cair no lugar certo depois de passar a fita.

CAMADAS (associe cada uma a uma ferramenta no programa da maquina)
- CONTORNO              corte passante da peca
- FURO_D5_P12           furo vertical: diametro 5 mm, 12 mm de profundidade
- FURO_D4_PASSANTE      furo que atravessa a peca
- CANAL_L6_P8           canal: area de 6 mm de largura, 8 mm de fundo, no comprimento todo
- TOPO_D8_P34           furo horizontal no topo: a linha sai da borda e entra o comprimento
                        do furo. CNC de nesting sem furacao horizontal: faca com gabarito
                        ou furadeira horizontal (estes furos estao tambem na folha de furacao).

CONFIRA ANTES DE PRODUZIR
Corte uma peca de teste e confira com a folha de furacao impressa. Pecas com furo de topo:
${
  pecas
    .filter((p) => p.furosDeTopo > 0)
    .map((p) => `${p.codigo} (${p.furosDeTopo})`)
    .join(", ") || "nenhuma"
}.
`;

/** Monta o .zip com um DXF por lado de cada peça, a lista e o leia-me. */
export function montarZipCnc(p: {
  itens: readonly ItemLista[];
  opcoes: OpcoesMedidaCorte;
  materialDe: (item: ItemLista) => Material | null;
  nomeProjeto: string;
}): { zip: Uint8Array; arquivos: number; avisos: string[] } {
  const pecas = p.itens.map((it) => dxfDaPeca(it, p.opcoes));
  const arquivos: Record<string, Uint8Array> = {};
  const linhas: Array<Array<string | number>> = [
    [
      "Código",
      "Peça",
      "Quantidade",
      "Comprimento de corte (mm)",
      "Largura de corte (mm)",
      "Espessura (mm)",
      "Material",
      "Veio",
      "Furos de topo",
      "Arquivos",
    ],
  ];
  for (const [i, d] of pecas.entries()) {
    const it = p.itens[i]!;
    const material = p.materialDe(it);
    // Pasta por material: cada uma vira um lote no programa de nesting.
    const pasta = material
      ? `${material.nome} ${formatarMm(it.espessura).replace(',', '.')}mm`
          .replace(/[^\p{L}\p{N} .-]+/gu, "-")
          .trim()
      : NOME_MATERIAL[it.material];
    for (const a of d.arquivos)
      arquivos[`${pasta}/${a.nome}`] = strToU8(a.conteudo);
    linhas.push([
      d.codigo,
      d.nome,
      d.quantidade,
      d.comprimentoMm.toLocaleString("pt-BR"),
      d.larguraMm.toLocaleString("pt-BR"),
      d.espessuraMm.toLocaleString("pt-BR"),
      material?.nome ?? NOME_MATERIAL[it.material],
      it.veio ? "sim" : "livre",
      d.furosDeTopo,
      d.arquivos.map((a) => `${pasta}/${a.nome}`).join(" + "),
    ]);
  }
  arquivos["pecas.csv"] = strToU8(paraCsv(linhas));
  arquivos["LEIAME.txt"] = strToU8(
    LEIAME(
      p.nomeProjeto,
      (p.opcoes.espessuraFitaCmm / 100).toLocaleString("pt-BR"),
      pecas,
    ).replace(/\n/g, "\r\n"),
  );
  return {
    zip: zipSync(arquivos, { level: 6 }),
    arquivos: Object.keys(arquivos).filter((n) => n.endsWith(".dxf")).length,
    avisos: pecas.flatMap((d) => d.avisos),
  };
}
