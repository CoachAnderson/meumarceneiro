import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { formatarMoeda } from "@marcenaria/catalog";
import { useEmpresaAtual } from "../empresa/EmpresaProvider";
import { Botao, Cartao } from "../components/ui";
import { buscarFerragens, chaveFerragens } from "../lib/catalogo";
import {
  chaveFerragem,
  descricaoFerragem,
  linhasDeFerragem,
} from "./ferragens";
import { baixarTexto, paraCsv } from "../lib/exportar";
import type { Formulario } from "./formulario";
import type { Calculo } from "./useCalculo";

/** Ferragens que o projeto pede, ligadas ao catálogo. */
export function ListaFerragens({
  f,
  atualizar,
  calculo,
  somenteLeitura,
  nomeArquivo,
}: {
  f: Formulario;
  atualizar: (parcial: Partial<Formulario>) => void;
  calculo: Calculo;
  somenteLeitura: boolean;
  nomeArquivo: string;
}) {
  const { empresa } = useEmpresaAtual();
  const catalogo = useQuery({
    queryKey: chaveFerragens(empresa.id),
    queryFn: () => buscarFerragens(empresa.id),
  });
  const { resultado, qtdModulos } = calculo;
  if (!resultado?.valido || resultado.ferragens.length === 0) return null;

  const linhas = linhasDeFerragem(calculo, f, catalogo.data ?? []);
  const semPreco = linhas.filter((l) => l.total === null).length;
  const soma = linhas.reduce((s, l) => s + (l.total ?? 0), 0);

  function exportarCsv() {
    baixarTexto(
      `${nomeArquivo}-ferragens.csv`,
      paraCsv([
        [
          "Ferragem",
          "Quantidade",
          "Item do catálogo",
          "Preço unitário (R$)",
          "Total (R$)",
        ],
        ...linhas.map((l) => [
          descricaoFerragem(l.n),
          l.n.quantidade,
          l.escolhido?.nome ?? "",
          l.escolhido?.preco_centavos != null
            ? (l.escolhido.preco_centavos / 100).toFixed(2).replace(".", ",")
            : "",
          l.total != null ? (l.total / 100).toFixed(2).replace(".", ",") : "",
        ]),
      ]),
    );
  }

  return (
    <Cartao
      titulo="Ferragens"
      descricao={`Quantidades para ${calculo.ehMesa ? (qtdModulos === 1 ? "1 mesa" : `${qtdModulos} mesas`) : qtdModulos === 1 ? "1 módulo" : `${qtdModulos} módulos`}.${linhas.some((l) => l.n.codigo === "corredica") ? " Corrediça em pares." : ""}`}
      acoes={
        <Botao variante="secundario" onClick={exportarCsv}>
          CSV
        </Botao>
      }
    >
      <div className="-mx-5 overflow-x-auto sm:-mx-6">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-stone-500">
              <th className="px-5 py-2 font-medium sm:px-6">Ferragem</th>
              <th className="px-3 py-2 text-right font-medium">Qtd</th>
              <th className="px-3 py-2 font-medium">Item do catálogo</th>
              <th className="px-5 py-2 text-right font-medium sm:px-6">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {linhas.map(({ n, opcoes, escolhido, total }) => (
              <tr key={chaveFerragem(n)}>
                <td className="px-5 py-2 sm:px-6">{descricaoFerragem(n)}</td>
                <td className="tabular px-3 py-2 text-right">{n.quantidade}</td>
                <td className="px-3 py-2">
                  {opcoes.length === 0 ? (
                    <Link to="/ferragens" className="text-amber-700 underline">
                      cadastrar
                    </Link>
                  ) : opcoes.length === 1 || somenteLeitura ? (
                    escolhido?.nome
                  ) : (
                    <select
                      aria-label={`Item do catálogo para ${descricaoFerragem(n)}`}
                      value={escolhido?.id ?? ""}
                      onChange={(e) =>
                        atualizar({
                          ferragens: {
                            ...f.ferragens,
                            [chaveFerragem(n)]: e.target.value,
                          },
                        })
                      }
                      className="w-full max-w-64 rounded-md border-0 bg-white py-1 pr-7 pl-2 text-sm ring-1 ring-inset ring-stone-300"
                    >
                      {opcoes.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nome}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="tabular px-5 py-2 text-right whitespace-nowrap sm:px-6">
                  {total === null ? (
                    <span className="text-stone-400">sem preço</span>
                  ) : (
                    formatarMoeda(total)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-right text-sm">
        <span className="text-stone-500">Total das ferragens: </span>
        <span className="tabular font-medium">{formatarMoeda(soma)}</span>
        {semPreco > 0 && (
          <span className="text-stone-500">
            {" "}
            (
            {semPreco === 1
              ? "1 item sem preço fica fora"
              : `${semPreco} itens sem preço ficam fora`}
            )
          </span>
        )}
      </p>
      {linhas.some((l) => l.n.codigo.startsWith("dobradica")) && (
        <p className="mt-2 text-xs text-stone-500">
          Quantidade de dobradiças pela altura da porta e tipo de dobradiça pelo
          que a porta cobre: confira com o fabricante da sua ferragem.
        </p>
      )}
    </Cartao>
  );
}
