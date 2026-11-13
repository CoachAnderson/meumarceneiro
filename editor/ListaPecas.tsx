import {
  comprimentoDeFita,
  descreverBordas,
  descreverUsinagem,
  dmm,
  emM2,
  formatarMm,
} from "@marcenaria/core";
import { Campo, Cartao } from "../components/ui";
import { baixarTexto, metros, paraCsv } from "../lib/exportar";
import type { Formulario } from "./formulario";
import type { Calculo } from "./useCalculo";
import { NOME_MATERIAL } from "./estilo";

/** "Hi + 2*(c - g)" → "664 + 2·(8 − 1)": a fórmula com os números do módulo. */
function explicarOrigem(
  origem: string,
  medidas: Record<string, number>,
): string {
  return origem
    .split(" × ")
    .map((parte) =>
      parte
        .replace(/[A-Za-z_][A-Za-z0-9_]*/g, (nome) =>
          medidas[nome] !== undefined ? formatarMm(dmm(medidas[nome])) : nome,
        )
        .replace(/\s*\*\s*/g, "·")
        .replace(/ - /g, " − ")
        .replace(/^-/, "−"),
    )
    .join("  ×  ");
}

/** Lista técnica: itens agrupados, totais e exportação. */
export function ListaPecas({
  f,
  atualizar,
  calculo,
  selecionado,
  aoSelecionar,
  nomeArquivo,
  somenteLeitura,
}: {
  f: Formulario;
  atualizar: (parcial: Partial<Formulario>) => void;
  calculo: Calculo;
  selecionado: string | null;
  aoSelecionar: (id: string | null) => void;
  nomeArquivo: string;
  somenteLeitura: boolean;
}) {
  const { lista, resultado, opcoesOk, sobraFita } = calculo;
  if (!resultado) return null;

  function exportarCsv() {
    if (!lista) return;
    const linhas: Array<Array<string | number>> = [
      [
        "Código",
        "Peça",
        "Material",
        "Qtd",
        "Comprimento (mm)",
        "Largura (mm)",
        "Espessura (mm)",
        "Veio",
        "Fita de borda",
        "Fita por peça (m)",
        "Usinagem",
      ],
      ...lista.itens.map((i) => [
        i.codigo,
        i.nome,
        NOME_MATERIAL[i.material],
        i.quantidade,
        formatarMm(i.comprimento),
        formatarMm(i.largura),
        formatarMm(i.espessura),
        i.veio ? "Segue o comprimento" : "Sem veio",
        descreverBordas(i.bordas),
        metros(comprimentoDeFita(i)),
        i.usinagens.map(descreverUsinagem).join(" | "),
      ]),
      [],
      ["Fita total (m)", metros(lista.fitaDmm)],
      [`Fita com ${sobraFita}% de sobra (m)`, metros(lista.fitaComSobraDmm)],
    ];
    baixarTexto(`${nomeArquivo}.csv`, paraCsv(linhas));
  }

  return (
    <Cartao
      titulo="Lista de peças"
      descricao={
        lista
          ? `${lista.totalPecas} peças em ${lista.itens.length} itens. Comprimento é sempre a medida no sentido do veio. Medidas acabadas, com a fita.`
          : "Corrija os problemas acima; a lista só sai de um módulo válido."
      }
    >
      <fieldset
        disabled={somenteLeitura}
        className="mb-4 grid max-w-md grid-cols-2 gap-3"
      >
        <Campo
          rotulo={
            calculo.ehMesa ? "Quantidade de mesas" : "Quantidade de módulos"
          }
          inputMode="numeric"
          value={f.quantidadeModulos}
          onChange={(e) => atualizar({ quantidadeModulos: e.target.value })}
          erro={opcoesOk ? null : "Use 1 a 999 e sobra de 0 a 100."}
        />
        <Campo
          rotulo="Sobra de fita (%)"
          inputMode="numeric"
          value={f.sobraFita}
          onChange={(e) => atualizar({ sobraFita: e.target.value })}
        />
      </fieldset>
      {lista && (
        <>
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="cartoes-tablet min-w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-stone-500">
                  <th className="px-5 py-2 font-medium sm:px-6">Cód.</th>
                  <th className="px-3 py-2 font-medium">Peça</th>
                  <th className="px-3 py-2 text-right font-medium">Qtd</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">
                    Comp. × larg. × esp. (mm)
                  </th>
                  <th className="px-3 py-2 font-medium">Veio</th>
                  <th className="px-3 py-2 font-medium">Fita</th>
                  <th className="px-3 py-2 font-medium">Usinagem</th>
                  <th className="px-5 py-2 font-medium sm:px-6">Como saiu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {lista.itens.map((i) => {
                  const ativo =
                    selecionado !== null && i.ids.includes(selecionado);
                  const exemplo = resultado.componentes.find(
                    (c) => c.id === i.ids[0],
                  );
                  return (
                    <tr
                      key={i.codigo}
                      className={`cursor-pointer ${ativo ? "bg-amber-50" : "hover:bg-stone-50"}`}
                      onClick={() =>
                        aoSelecionar(ativo ? null : (i.ids[0] ?? null))
                      }
                    >
                      <td data-cartao="titulo" className="tabular px-5 py-2 text-stone-500 sm:px-6">
                        {i.codigo}
                      </td>
                      <td data-cartao="titulo" className="px-3 py-2">{i.nome}</td>
                      <td data-rotulo="Quantidade" className="tabular px-3 py-2 text-right">
                        {i.quantidade}
                      </td>
                      <td data-rotulo="Comp. × larg. × esp. (mm)" className="tabular px-3 py-2 font-medium whitespace-nowrap">
                        {formatarMm(i.comprimento)} × {formatarMm(i.largura)} ×{" "}
                        {formatarMm(i.espessura)}
                      </td>
                      <td data-rotulo="Veio" className="px-3 py-2 whitespace-nowrap text-stone-600">
                        {i.veio ? "↕ comprimento" : "livre"}
                      </td>
                      <td data-rotulo="Fita" className="px-3 py-2 whitespace-nowrap text-stone-600">
                        {descreverBordas(i.bordas)}
                      </td>
                      <td data-rotulo="Usinagem" className="px-3 py-2 text-xs text-stone-600">
                        {i.usinagens.length === 0
                          ? "–"
                          : i.usinagens.map((u, k) => (
                              <span key={k} className="block whitespace-nowrap">
                                {descreverUsinagem(u)}
                              </span>
                            ))}
                      </td>
                      <td
                        data-rotulo="Como saiu"
                        className="tabular px-5 py-2 text-xs whitespace-nowrap text-stone-500 sm:px-6"
                        title={
                          exemplo ? `Fórmula: ${exemplo.origem}` : undefined
                        }
                      >
                        {exemplo
                          ? explicarOrigem(exemplo.origem, resultado.medidas)
                          : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <dl className="mt-5 grid gap-x-6 gap-y-3 border-t border-stone-100 pt-4 text-sm sm:grid-cols-3">
            {lista.porMaterial.map((m) => (
              <div key={`${m.material}${m.espessura}`}>
                <dt className="text-stone-500">
                  {NOME_MATERIAL[m.material]} {formatarMm(m.espessura)} mm
                </dt>
                <dd className="tabular font-medium">
                  {emM2(m.area).toLocaleString("pt-BR", {
                    minimumFractionDigits: 3,
                    maximumFractionDigits: 3,
                  })}{" "}
                  m² · {m.pecas} {m.pecas === 1 ? "peça" : "peças"}
                </dd>
              </div>
            ))}
            <div>
              <dt className="text-stone-500">Fita de borda</dt>
              <dd className="tabular font-medium">
                {metros(lista.fitaDmm)} m{" "}
                <span className="font-normal text-stone-500">
                  ({metros(lista.fitaComSobraDmm)} m com {sobraFita}% de sobra)
                </span>
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-stone-500">
              Regra: {calculo.nomeRegra}. Área é só das peças, sem perda de
              corte; o aproveitamento da chapa vem com o plano de corte.
            </p>
            <button
              type="button"
              onClick={exportarCsv}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              Baixar CSV
            </button>
          </div>
        </>
      )}
    </Cartao>
  );
}
