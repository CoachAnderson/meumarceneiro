import {
  comprimentoDeFita,
  descreverUsinagem,
  formatarMm,
  type Bordas,
  type Componente,
  type Peca,
} from "@marcenaria/core";
import { Botao } from "../components/ui";
import { metros } from "../lib/exportar";
import { NOME_MATERIAL } from "./estilo";

const BORDAS: Array<{
  chave: keyof Bordas;
  rotulo: string;
  medida: "comprimento" | "largura";
}> = [
  { chave: "frente", rotulo: "Frente", medida: "comprimento" },
  { chave: "tras", rotulo: "Trás", medida: "comprimento" },
  { chave: "ext1", rotulo: "Ponta 1", medida: "largura" },
  { chave: "ext2", rotulo: "Ponta 2", medida: "largura" },
];

/** Detalhes da peça clicada no desenho, com as bordas editáveis. */
export function PecaSelecionada({
  componente,
  peca,
  trocada,
  podeEditar,
  aoMudarBorda,
  aoRestaurar,
  aoFechar,
}: {
  componente: Componente;
  peca: Peca | undefined;
  trocada: boolean;
  podeEditar: boolean;
  aoMudarBorda: (borda: keyof Bordas, valor: boolean) => void;
  aoRestaurar: () => void;
  aoFechar: () => void;
}) {
  return (
    <div className="rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-stone-900">{componente.nome}</p>
          <p className="tabular text-sm text-stone-600">
            {formatarMm(componente.comprimento)} ×{" "}
            {formatarMm(componente.largura)} ×{" "}
            {formatarMm(componente.espessura)} mm ·{" "}
            {NOME_MATERIAL[componente.material].toLowerCase()}
            {peca && (peca.veio ? " · veio no comprimento" : " · sem veio")}
          </p>
        </div>
        <button
          type="button"
          onClick={aoFechar}
          className="rounded px-2 text-lg leading-none text-stone-500 hover:text-stone-900"
          aria-label="Fechar detalhes da peça"
        >
          ×
        </button>
      </div>

      {peca ? (
        <>
          <fieldset disabled={!podeEditar} className="mt-3">
            <legend className="mb-1.5 text-sm font-medium text-stone-800">
              Fita de borda
            </legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {BORDAS.map((b) => (
                <label
                  key={b.chave}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={peca.bordas[b.chave]}
                    onChange={(e) => aoMudarBorda(b.chave, e.target.checked)}
                    className="accent-amber-600"
                  />
                  <span>
                    {b.rotulo}{" "}
                    <span className="tabular text-stone-500">
                      ({formatarMm(peca[b.medida])})
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-2 text-sm text-stone-600">
            {metros(comprimentoDeFita(peca))} m de fita nesta peça.
            {trocada && podeEditar && (
              <Botao
                variante="discreto"
                className="ml-2 min-h-0 px-2 py-0.5"
                onClick={aoRestaurar}
              >
                Voltar ao padrão
              </Botao>
            )}
          </p>
          {peca.usinagens.map((u, i) => (
            <div key={i} className="mt-1 text-sm text-stone-600">
              {u.tipo === "canal_fundo" ? (
                <p>
                  Canal do fundo: {formatarMm(u.largura)} mm de largura ×{" "}
                  {formatarMm(u.profundidade)} mm de profundidade, a{" "}
                  {formatarMm(u.distanciaTras)} mm da borda de trás, em todo o
                  comprimento.
                </p>
              ) : (
                <details>
                  <summary className="cursor-pointer">
                    {descreverUsinagem(u)}
                  </summary>
                  <p className="tabular mt-1 text-xs text-stone-500">
                    Centros (mm, a partir da ponta 1 × da borda da frente da
                    peça):{" "}
                    {u.centros
                      .slice(0, 40)
                      .map((c) => `${formatarMm(c.u)} × ${formatarMm(c.v)}`)
                      .join(" · ")}
                    {u.centros.length > 40 ? " …" : ""}
                  </p>
                </details>
              )}
            </div>
          ))}
        </>
      ) : componente.comprado ? (
        <p className="mt-2 text-sm text-stone-600">
          {componente.papel === "gabinete_ref"
            ? "Gabinete de referência, só para o desenho: ele é um projeto à parte."
            : "Item comprado pronto: entra na lista de ferragens, não no corte."}
        </p>
      ) : (
        <p className="mt-2 text-sm text-stone-600">
          Corrija os erros do módulo para ver fita e usinagem.
        </p>
      )}
    </div>
  );
}
