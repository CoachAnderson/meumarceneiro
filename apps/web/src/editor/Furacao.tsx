import { useState } from "react";
import {
  PARAMETROS_FURACAO,
  dmm,
  formatarMm,
  type DefinicaoParametro,
  type TipoJuncao,
  type TipoJuncaoGaveta,
} from "@marcenaria/core";
import { useEmpresaAtual } from "../empresa/EmpresaProvider";
import { Botao, Campo, CampoSelecao, Cartao } from "../components/ui";
import { mensagemDeErro } from "../lib/erros";
import { supabase } from "../lib/supabase";
import {
  aplicarPadraoFuracao,
  lerPadraoFuracao,
  padraoDoFormulario,
  type Formulario,
} from "./formulario";
import type { Calculo } from "./useCalculo";

const NOME_JUNCAO: Record<TipoJuncao, string> = {
  minifix: "Minifix (tambor e pino)",
  cavilha: "Cavilha",
  parafuso: "Parafuso",
  nenhuma: "Não furar as junções",
};

const NOME_JUNCAO_GAVETA: Record<TipoJuncaoGaveta, string> = {
  parafuso: "Parafuso (fundo parafusado também)",
  cavilha: "Cavilha",
  nenhuma: "Não furar a caixa da gaveta",
};

/** Grupos das medidas do gabarito, na ordem em que aparecem. */
const GRUPOS: Array<{ titulo: string; chave: string; prefixos: string[] }> = [
  { titulo: "Posição dos pontos de junção", chave: "Junção", prefixos: ["j"] },
  { titulo: "Minifix", chave: "Minifix", prefixos: ["mf"] },
  { titulo: "Cavilha", chave: "Cavilha", prefixos: ["cv"] },
  { titulo: "Parafuso de montagem", chave: "Parafuso", prefixos: ["pf"] },
  {
    titulo: "Calço da dobradiça",
    chave: "Calço da dobradiça",
    prefixos: ["cz"],
  },
  { titulo: "Puxador", chave: "Puxador", prefixos: ["px"] },
  { titulo: "Corrediça", chave: "Corrediça", prefixos: ["cr", "cg"] },
  { titulo: "Frente da gaveta", chave: "Frente da gaveta", prefixos: ["gf"] },
  { titulo: "Borda engrossada", chave: "Borda engrossada", prefixos: ["eg"] },
];
/** Tira do rótulo o nome do grupo, que já aparece no título: "Corrediça no móvel: x" → "No móvel: x". */
function rotuloCurto(rotulo: string, chave: string): string {
  const resto = rotulo.startsWith(`${chave}: `)
    ? rotulo.slice(chave.length + 2)
    : rotulo.startsWith(`${chave} `)
      ? rotulo.slice(chave.length + 1)
      : rotulo;
  return resto.charAt(0).toUpperCase() + resto.slice(1);
}
const doGrupo = (nome: string, prefixos: string[]) =>
  prefixos.some((p) => nome.startsWith(p) && nome.length === p.length + 1);

const PUXADORES = ["", "0", "96", "128", "160", "192", "256", "320"];

/** Quais medidas do gabarito aparecem, conforme o que está ligado. */
function parametrosVisiveis(
  f: Formulario,
  temPorta: boolean,
  temFrente: boolean,
  temGaveta: boolean,
): DefinicaoParametro[] {
  const prefixos: string[] = [];
  const gaveta = temGaveta ? f.furacao.juncaoGaveta : "nenhuma";
  if (f.furacao.juncao !== "nenhuma" || gaveta !== "nenhuma")
    prefixos.push("j");
  if (f.furacao.juncao === "minifix") prefixos.push("mf");
  if (
    f.furacao.juncao === "cavilha" ||
    (f.furacao.juncao === "minifix" && f.furacao.cavilhaComMinifix) ||
    gaveta === "cavilha"
  )
    prefixos.push("cv");
  if (f.furacao.juncao === "parafuso" || gaveta === "parafuso")
    prefixos.push("pf");
  if (temGaveta && f.furacao.corredica) prefixos.push("cr", "cg");
  if (temGaveta && f.furacao.frenteGaveta) prefixos.push("gf");
  if (f.tipo === "mesa" && f.mesa.borda !== "nenhuma" && f.furacao.engrosso)
    prefixos.push("eg");
  if (f.furacao.calco && temPorta) prefixos.push("cz");
  if (f.furacao.puxador !== "" && temFrente && f.puxador) prefixos.push("px");
  return PARAMETROS_FURACAO.filter((d) =>
    prefixos.some(
      (p) => d.nome.startsWith(p) && d.nome.length === p.length + 1,
    ),
  );
}

/** Opções e medidas da furação de montagem, com o padrão da marcenaria. */
export function Furacao({
  f,
  atualizar,
  substituir,
  calculo,
  somenteLeitura,
}: {
  f: Formulario;
  atualizar: (parcial: Partial<Formulario>) => void;
  substituir: (novo: Formulario) => void;
  calculo: Calculo;
  somenteLeitura: boolean;
}) {
  const { empresa, papel } = useEmpresaAtual();
  const [ocupado, setOcupado] = useState<null | "salvar" | "usar">(null);
  const [mensagem, setMensagem] = useState<{
    erro: boolean;
    texto: string;
  } | null>(null);
  const ehMesa = f.tipo === "mesa";
  const temPorta = !ehMesa && f.vaos.some((v) => v.frente === "porta");
  const temGaveta = !ehMesa && f.vaos.some((v) => v.frente === "gavetas");
  const mudar = (parcial: Partial<Formulario["furacao"]>) =>
    atualizar({ furacao: { ...f.furacao, ...parcial } });
  const visiveis = parametrosVisiveis(
    f,
    temPorta,
    calculo.temFrente,
    temGaveta,
  );

  async function lerConfiguracoes(): Promise<Record<string, unknown>> {
    const { data, error } = await supabase
      .from("empresas")
      .select("configuracoes")
      .eq("id", empresa.id)
      .single();
    if (error) throw error;
    const c = (data as { configuracoes: unknown }).configuracoes;
    return typeof c === "object" && c !== null && !Array.isArray(c)
      ? (c as Record<string, unknown>)
      : {};
  }

  async function salvarPadrao() {
    setOcupado("salvar");
    setMensagem(null);
    try {
      const atual = await lerConfiguracoes();
      const { error } = await supabase
        .from("empresas")
        .update({ configuracoes: { ...atual, furacao: padraoDoFormulario(f) } })
        .eq("id", empresa.id);
      if (error) throw error;
      setMensagem({
        erro: false,
        texto:
          'Padrão de furação da marcenaria gravado. Vale para quem clicar em "Usar o padrão".',
      });
    } catch (e) {
      setMensagem({ erro: true, texto: mensagemDeErro(e) });
    } finally {
      setOcupado(null);
    }
  }

  async function usarPadrao() {
    setOcupado("usar");
    setMensagem(null);
    try {
      const padrao = lerPadraoFuracao((await lerConfiguracoes()).furacao);
      if (!padrao)
        setMensagem({
          erro: false,
          texto: "A marcenaria ainda não gravou um padrão de furação.",
        });
      else {
        substituir(aplicarPadraoFuracao(f, padrao));
        setMensagem({
          erro: false,
          texto: "Padrão da marcenaria aplicado neste módulo.",
        });
      }
    } catch (e) {
      setMensagem({ erro: true, texto: mensagemDeErro(e) });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Cartao
      titulo="Furação"
      descricao={
        ehMesa
          ? "Junções dos pés, da saia e do tampo, e a borda engrossada. As medidas são as do gabarito da sua ferragem."
          : "Junções da caixa, calço da dobradiça e puxador. As medidas são as do gabarito da sua ferragem."
      }
    >
      <div className="space-y-4">
        <CampoSelecao
          rotulo={
            ehMesa
              ? "Junção dos pés, da saia e do tampo"
              : "Junção das peças da caixa"
          }
          value={f.furacao.juncao}
          onChange={(e) => mudar({ juncao: e.target.value as TipoJuncao })}
        >
          {(Object.keys(NOME_JUNCAO) as TipoJuncao[]).map((j) => (
            <option key={j} value={j}>
              {NOME_JUNCAO[j]}
            </option>
          ))}
        </CampoSelecao>
        {f.furacao.juncao === "minifix" && (
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={f.furacao.cavilhaComMinifix}
              onChange={(e) => mudar({ cavilhaComMinifix: e.target.checked })}
              className="accent-amber-600"
            />
            Cavilha ao lado do primeiro e do último minifix
          </label>
        )}
        {ehMesa && f.mesa.borda !== "nenhuma" && (
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={f.furacao.engrosso}
              onChange={(e) => mudar({ engrosso: e.target.checked })}
              className="accent-amber-600"
            />
            Furar os parafusos da borda engrossada (por baixo)
          </label>
        )}
        {temPorta && (
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={f.furacao.calco}
              onChange={(e) => mudar({ calco: e.target.checked })}
              className="accent-amber-600"
            />
            Furar o calço da dobradiça na lateral
          </label>
        )}
        {temGaveta && (
          <fieldset className="space-y-3 rounded-lg p-3 ring-1 ring-inset ring-stone-200">
            <legend className="px-1 text-sm font-medium text-stone-800">
              Gavetas
            </legend>
            <CampoSelecao
              rotulo="Montagem da caixa da gaveta"
              value={f.furacao.juncaoGaveta}
              onChange={(e) =>
                mudar({ juncaoGaveta: e.target.value as TipoJuncaoGaveta })
              }
            >
              {(Object.keys(NOME_JUNCAO_GAVETA) as TipoJuncaoGaveta[]).map(
                (j) => (
                  <option key={j} value={j}>
                    {NOME_JUNCAO_GAVETA[j]}
                  </option>
                ),
              )}
            </CampoSelecao>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={f.furacao.corredica}
                onChange={(e) => mudar({ corredica: e.target.checked })}
                className="accent-amber-600"
              />
              Furar a corrediça (lateral do móvel e lateral da gaveta)
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={f.furacao.frenteGaveta}
                onChange={(e) => mudar({ frenteGaveta: e.target.checked })}
                className="accent-amber-600"
              />
              Furar a fixação da frente pela contrafrente
            </label>
          </fieldset>
        )}
        {calculo.temFrente && f.puxador && (
          <CampoSelecao
            rotulo="Furos do puxador"
            value={
              PUXADORES.includes(f.furacao.puxador) ? f.furacao.puxador : ""
            }
            onChange={(e) => mudar({ puxador: e.target.value })}
            ajuda="Porta: em pé, do lado de abrir. Gaveta: deitado, no centro."
          >
            {PUXADORES.map((p) => (
              <option key={p} value={p}>
                {p === ""
                  ? "Não furar"
                  : p === "0"
                    ? "Um furo (botão)"
                    : `Dois furos a ${p} mm`}
              </option>
            ))}
          </CampoSelecao>
        )}

        {visiveis.length > 0 && (
          <details
            className="rounded-lg bg-stone-50 p-3 ring-1 ring-inset ring-stone-200"
            open={visiveis.some(
              (d) => (f.parametros[d.nome] ?? "").trim() !== "",
            )}
          >
            <summary className="cursor-pointer text-sm font-medium text-stone-800">
              Medidas do gabarito ({visiveis.length})
            </summary>
            <div className="mt-3 space-y-4">
              {GRUPOS.map((g) => {
                const doCampo = visiveis.filter((d) =>
                  doGrupo(d.nome, g.prefixos),
                );
                if (doCampo.length === 0) return null;
                return (
                  <fieldset key={g.titulo}>
                    <legend className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">
                      {g.titulo}
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      {doCampo.map((d) => (
                        <Campo
                          key={d.nome}
                          rotulo={rotuloCurto(d.rotulo, g.chave)}
                          inputMode="decimal"
                          placeholder={formatarMm(dmm(d.padrao))}
                          value={f.parametros[d.nome] ?? ""}
                          onChange={(e) =>
                            atualizar({
                              parametros: {
                                ...f.parametros,
                                [d.nome]: e.target.value,
                              },
                            })
                          }
                          ajuda={
                            d.ajuda ?? `Padrão ${formatarMm(dmm(d.padrao))} mm`
                          }
                        />
                      ))}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </details>
        )}

        {!somenteLeitura && (
          <div className="flex flex-wrap gap-2">
            <Botao
              variante="secundario"
              carregando={ocupado === "usar"}
              disabled={!!ocupado}
              onClick={usarPadrao}
            >
              Usar o padrão da marcenaria
            </Botao>
            {papel === "dono" && (
              <Botao
                variante="discreto"
                carregando={ocupado === "salvar"}
                disabled={!!ocupado}
                onClick={salvarPadrao}
              >
                Gravar como padrão
              </Botao>
            )}
          </div>
        )}
        {mensagem && (
          <p
            className={`text-sm ${mensagem.erro ? "text-red-700" : "text-stone-600"}`}
            role="status"
          >
            {mensagem.texto}
          </p>
        )}
      </div>
    </Cartao>
  );
}
