import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  FUNDOS_PADRAO,
  MONTAGENS_PADRAO,
  PARAMETROS_FRENTES,
  PARAMETROS_FURACAO,
  dmm,
  formatarMm,
  type ModeloMesa,
  type TipoPrateleira,
} from "@marcenaria/core";

const TITULO_MESA: Record<ModeloMesa, string> = {
  pes_mdf: "Mesa",
  pes_comprados: "Mesa",
  suspensa: "Bancada",
  sobre_gabinetes: "Tampo sobre gabinetes",
};
const DESCRICAO_MESA: Record<ModeloMesa, string> = {
  pes_mdf: "Tampo, dois pés em painel de MDF, saia e travessa.",
  pes_comprados:
    "Tampo de MDF e quatro pés comprados prontos, presos por chapa.",
  suspensa: "Tampo preso na parede por suportes.",
  sobre_gabinetes: "Tampo apoiado em gabinetes, informados pelas larguras.",
};
import { NOME_TIPO_MATERIAL } from "@marcenaria/catalog";
import { Campo, CampoSelecao, Cartao } from "../components/ui";
import type { Material } from "../lib/catalogo";
import {
  MEDIDAS_MESA,
  MEDIDAS_PADRAO,
  lerGabinetes,
  type Formulario,
  type MesaForm,
  type TipoMovel,
  type VaoForm,
} from "./formulario";

const NOMES_FRENTES = new Set(PARAMETROS_FRENTES.map((p) => p.nome));
const NOMES_FURACAO = new Set(PARAMETROS_FURACAO.map((p) => p.nome));
import { Furacao } from "./Furacao";
import { descricaoMaterial, type Calculo } from "./useCalculo";

/** Entradas do módulo: estrutura, materiais, interior e folgas. */
export function PainelEntradas({
  f,
  atualizar,
  substituir,
  calculo,
  carregandoMateriais,
  somenteLeitura,
}: {
  f: Formulario;
  atualizar: (parcial: Partial<Formulario>) => void;
  substituir: (novo: Formulario) => void;
  calculo: Calculo;
  carregandoMateriais: boolean;
  somenteLeitura: boolean;
}) {
  const { ativos, matEstrutura, matFundo, resultado, definicoesParametros } =
    calculo;
  const {
    L: campoL,
    A: campoA,
    P: campoP,
    E: campoE,
    Ef: campoEf,
  } = calculo.campos;
  const montagem = MONTAGENS_PADRAO.find((m) => m.codigo === f.montagem);
  const fundo = FUNDOS_PADRAO.find((x) => x.codigo === f.fundo);
  const materiais = { isPending: carregandoMateriais };
  const ehMesa = calculo.ehMesa;
  const mudarMesa = (parcial: Partial<MesaForm>) =>
    atualizar({ mesa: { ...f.mesa, ...parcial } });
  const mudarTipo = (tipo: TipoMovel) => {
    if (tipo === f.tipo) return;
    // Só troca as medidas se ainda estiverem no padrão do outro tipo.
    const anterior = MEDIDAS_PADRAO[f.tipo];
    const noPadrao =
      f.L === anterior.L && f.A === anterior.A && f.P === anterior.P;
    atualizar({ tipo, ...(noPadrao ? MEDIDAS_PADRAO[tipo] : {}) });
  };
  const espessuraMesa = calculo.campos.E.valor;
  const naParede =
    f.mesa.modelo === "suspensa" || f.mesa.modelo === "sobre_gabinetes";
  const gabinetes =
    f.mesa.modelo === "sobre_gabinetes"
      ? lerGabinetes(f.mesa.gabinetes)
      : { valores: [], erro: null };
  const mudarModelo = (modelo: ModeloMesa) => {
    if (modelo === f.mesa.modelo) return;
    const anterior = MEDIDAS_MESA[f.mesa.modelo];
    const noPadrao =
      f.L === anterior.L && f.A === anterior.A && f.P === anterior.P;
    const vaiParaParede = modelo === "suspensa" || modelo === "sobre_gabinetes";
    atualizar({
      mesa: {
        ...f.mesa,
        modelo,
        borda:
          vaiParaParede && f.mesa.borda === "todos"
            ? "tres_lados"
            : f.mesa.borda,
      },
      ...(noPadrao ? MEDIDAS_MESA[modelo] : {}),
    });
  };

  return (
    <fieldset disabled={somenteLeitura} className="min-w-0 space-y-6">
      <div
        role="radiogroup"
        aria-label="Tipo de móvel"
        className="grid grid-cols-2 gap-1 rounded-xl bg-stone-200/70 p-1"
      >
        {(
          [
            ["caixa", "Armário ou gabinete"],
            ["mesa", "Mesa"],
          ] as const
        ).map(([tipo, rotulo]) => (
          <button
            key={tipo}
            type="button"
            role="radio"
            aria-checked={f.tipo === tipo}
            onClick={() => mudarTipo(tipo)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${f.tipo === tipo ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900"}`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {ehMesa ? (
        <Cartao
          titulo={TITULO_MESA[f.mesa.modelo]}
          descricao={DESCRICAO_MESA[f.mesa.modelo]}
        >
          <div className="grid gap-4">
            <CampoSelecao
              rotulo="Modelo"
              value={f.mesa.modelo}
              onChange={(e) => mudarModelo(e.target.value as ModeloMesa)}
            >
              <option value="pes_mdf">Mesa com pés de MDF</option>
              <option value="pes_comprados">
                Mesa com pés comprados (madeira ou metal)
              </option>
              <option value="suspensa">Bancada suspensa na parede</option>
              <option value="sobre_gabinetes">Tampo sobre gabinetes</option>
            </CampoSelecao>
            {f.mesa.modelo === "sobre_gabinetes" && (
              <Campo
                rotulo="Larguras dos gabinetes (mm)"
                value={f.mesa.gabinetes}
                onChange={(e) => mudarMesa({ gabinetes: e.target.value })}
                erro={gabinetes.erro}
                ajuda={
                  gabinetes.erro
                    ? undefined
                    : `Da esquerda para a direita, separadas por +.${resultado?.valido ? ` Tampo de ${formatarMm(dmm(resultado.medidas["comprimentoTampo"] ?? 0))} mm, com os balanços.` : ""}`
                }
              />
            )}
            <div
              className={`grid gap-3 ${f.mesa.modelo === "sobre_gabinetes" ? "grid-cols-2" : "grid-cols-3"}`}
            >
              {f.mesa.modelo !== "sobre_gabinetes" && (
                <Campo
                  rotulo={
                    f.mesa.modelo === "suspensa"
                      ? "Comprimento (mm)"
                      : "Largura (mm)"
                  }
                  inputMode="decimal"
                  value={f.L}
                  onChange={(e) => atualizar({ L: e.target.value })}
                  erro={campoL.erro}
                />
              )}
              <Campo
                rotulo="Altura (mm)"
                inputMode="decimal"
                value={f.A}
                onChange={(e) => atualizar({ A: e.target.value })}
                erro={campoA.erro}
                ajuda="Do chão ao topo do tampo."
              />
              <Campo
                rotulo="Profund. (mm)"
                inputMode="decimal"
                value={f.P}
                onChange={(e) => atualizar({ P: e.target.value })}
                erro={campoP.erro}
              />
            </div>
            {f.mesa.modelo === "pes_mdf" && (
              <>
                <label className="flex items-center gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    checked={f.mesa.saia}
                    onChange={(e) => mudarMesa({ saia: e.target.checked })}
                    className="accent-amber-600"
                  />
                  Saia (painel de fundo entre os pés, embaixo do tampo)
                </label>
                <label className="flex items-center gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    checked={f.mesa.travessa}
                    onChange={(e) => mudarMesa({ travessa: e.target.checked })}
                    className="accent-amber-600"
                  />
                  Travessa entre os pés, perto do chão
                </label>
                <label className="flex items-center gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    checked={f.mesa.sapatas}
                    onChange={(e) => mudarMesa({ sapatas: e.target.checked })}
                    className="accent-amber-600"
                  />
                  Sapatas niveladoras na base dos pés
                </label>
              </>
            )}
            {f.mesa.modelo === "suspensa" && (
              <CampoSelecao
                rotulo="Suporte"
                value={f.mesa.suporte}
                onChange={(e) =>
                  mudarMesa({ suporte: e.target.value as MesaForm["suporte"] })
                }
                ajuda={
                  f.mesa.suporte === "invisivel"
                    ? "Barra embutida na borda de trás do tampo; pede tampo grosso."
                    : "Parafusado por baixo do tampo. Ajuste a furação em Folgas e parâmetros."
                }
              >
                <option value="mao_francesa">Mão-francesa</option>
                <option value="cantoneira">Cantoneira</option>
                <option value="invisivel">Suporte invisível (barra)</option>
              </CampoSelecao>
            )}
            <CampoSelecao
              rotulo="Borda engrossada"
              value={f.mesa.borda}
              onChange={(e) =>
                mudarMesa({ borda: e.target.value as MesaForm["borda"] })
              }
              ajuda="Faixa de MDF colada e parafusada embaixo do tampo, para a borda parecer mais grossa."
            >
              <option value="nenhuma">Sem borda engrossada</option>
              <option value="frente">Só na frente</option>
              <option value="tres_lados">Na frente e nas pontas</option>
              {!naParede && <option value="todos">Em volta toda</option>}
            </CampoSelecao>
            {f.mesa.borda !== "nenhuma" && (
              <CampoSelecao
                rotulo="Espessura aparente da borda"
                value={f.mesa.camadas}
                onChange={(e) =>
                  mudarMesa({ camadas: e.target.value as MesaForm["camadas"] })
                }
              >
                <option value="1">
                  2 chapas
                  {espessuraMesa
                    ? ` (${formatarMm(dmm(espessuraMesa * 2))} mm)`
                    : ""}
                </option>
                <option value="2">
                  3 chapas
                  {espessuraMesa
                    ? ` (${formatarMm(dmm(espessuraMesa * 3))} mm)`
                    : ""}
                </option>
              </CampoSelecao>
            )}
          </div>
        </Cartao>
      ) : (
        <Cartao titulo="Estrutura">
          <div className="grid gap-4">
            <CampoSelecao
              rotulo="Montagem"
              value={f.montagem}
              onChange={(e) =>
                atualizar({ montagem: e.target.value, parametros: {} })
              }
              ajuda={montagem?.descricao}
            >
              {MONTAGENS_PADRAO.map((m) => (
                <option key={m.codigo} value={m.codigo}>
                  {m.nome}
                </option>
              ))}
            </CampoSelecao>
            <CampoSelecao
              rotulo="Fundo"
              value={f.fundo}
              onChange={(e) =>
                atualizar({ fundo: e.target.value, parametros: {} })
              }
              ajuda={fundo?.descricao}
            >
              {FUNDOS_PADRAO.map((x) => (
                <option key={x.codigo} value={x.codigo}>
                  {x.nome}
                </option>
              ))}
            </CampoSelecao>
            <div className="grid grid-cols-3 gap-3">
              <Campo
                rotulo="Largura (mm)"
                inputMode="decimal"
                value={f.L}
                onChange={(e) => atualizar({ L: e.target.value })}
                erro={campoL.erro}
              />
              <Campo
                rotulo="Altura (mm)"
                inputMode="decimal"
                value={f.A}
                onChange={(e) => atualizar({ A: e.target.value })}
                erro={campoA.erro}
              />
              <Campo
                rotulo="Profund. (mm)"
                inputMode="decimal"
                value={f.P}
                onChange={(e) => atualizar({ P: e.target.value })}
                erro={campoP.erro}
              />
            </div>
          </div>
        </Cartao>
      )}

      <Cartao
        titulo="Materiais"
        descricao={
          ativos.length === 0 && !materiais.isPending ? (
            <>
              Nenhum material cadastrado; informe a espessura.{" "}
              <Link to="/materiais" className="underline">
                Cadastrar materiais
              </Link>
            </>
          ) : undefined
        }
      >
        <div className="grid gap-4">
          <SeletorMaterial
            rotulo={ehMesa ? "MDF da mesa" : "Estrutura"}
            materiais={ativos}
            materialId={f.materialEstrutura}
            espessura={f.espessuraEstrutura}
            erro={matEstrutura ? null : campoE.erro}
            aoMudarMaterial={(id) => atualizar({ materialEstrutura: id })}
            aoMudarEspessura={(t) => atualizar({ espessuraEstrutura: t })}
          />
          {!ehMesa && (
            <SeletorMaterial
              rotulo="Fundo"
              materiais={ativos}
              materialId={f.materialFundo}
              espessura={f.espessuraFundo}
              erro={matFundo ? null : campoEf.erro}
              aoMudarMaterial={(id) => atualizar({ materialFundo: id })}
              aoMudarEspessura={(t) => atualizar({ espessuraFundo: t })}
            />
          )}
          {calculo.temFrente && (
            <SeletorMaterial
              rotulo="Portas e frentes"
              materiais={ativos}
              materialId={f.materialFrente}
              espessura={f.espessuraFrente}
              erro={calculo.matFrente ? null : calculo.campos.Ep.erro}
              aoMudarMaterial={(id) => atualizar({ materialFrente: id })}
              aoMudarEspessura={(t) => atualizar({ espessuraFrente: t })}
            />
          )}
          {calculo.temGaveta && (
            <SeletorMaterial
              rotulo="Caixa das gavetas"
              materiais={ativos}
              materialId={f.materialGaveta}
              espessura={f.espessuraGaveta}
              erro={calculo.matGaveta ? null : calculo.campos.Ec.erro}
              aoMudarMaterial={(id) => atualizar({ materialGaveta: id })}
              aoMudarEspessura={(t) => atualizar({ espessuraGaveta: t })}
            />
          )}
          {calculo.temGaveta && (
            <p className="text-xs text-stone-500">
              O fundo das gavetas usa o material do fundo.
            </p>
          )}
        </div>
      </Cartao>

      {!ehMesa && (
        <>
          <Cartao titulo="Interior">
            <div className="grid gap-4">
              <Campo
                rotulo="Divisórias verticais"
                inputMode="numeric"
                value={f.divisorias}
                onChange={(e) => atualizar({ divisorias: e.target.value })}
                ajuda="Os vãos dividem a largura interna por igual, a menos que você fixe a largura de algum."
              />
              <div className="space-y-2">
                {f.vaos.map((v, i) => (
                  <fieldset
                    key={i}
                    className="grid grid-cols-[3.5rem_1fr_4.5rem_7.5rem] items-end gap-2"
                  >
                    <legend className="sr-only">Vão {i + 1}</legend>
                    <span className="pb-2.5 text-sm font-medium text-stone-700">
                      Vão {i + 1}
                    </span>
                    <MiniCampo
                      rotulo={i === 0 ? "Largura (mm)" : undefined}
                      aria={`Largura do vão ${i + 1}`}
                      placeholder={
                        resultado?.vaos[i]
                          ? `auto: ${formatarMm(resultado.vaos[i].largura)}`
                          : "auto"
                      }
                      value={v.largura}
                      onChange={(t) =>
                        atualizar({
                          vaos: f.vaos.map((x, j) =>
                            j === i ? { ...x, largura: t } : x,
                          ),
                        })
                      }
                    />
                    <MiniCampo
                      rotulo={i === 0 ? "Prateleiras" : undefined}
                      aria={`Prateleiras no vão ${i + 1}`}
                      value={v.frente === "gavetas" ? "–" : v.prateleiras}
                      desabilitado={v.frente === "gavetas"}
                      onChange={(t) =>
                        atualizar({
                          vaos: f.vaos.map((x, j) =>
                            j === i ? { ...x, prateleiras: t } : x,
                          ),
                        })
                      }
                    />
                    <label className="block text-xs text-stone-500">
                      {i === 0 && <span className="mb-1 block">Tipo</span>}
                      <select
                        aria-label={`Tipo das prateleiras do vão ${i + 1}`}
                        value={v.tipo}
                        onChange={(e) =>
                          atualizar({
                            vaos: f.vaos.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    tipo: e.target.value as TipoPrateleira,
                                  }
                                : x,
                            ),
                          })
                        }
                        className="block w-full rounded-lg border-0 bg-white px-2 py-2 text-sm text-stone-900 ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="fixa">Fixa</option>
                        <option value="regulavel">Regulável</option>
                      </select>
                    </label>
                    {(v.alturas ?? []).some((a) => a.trim()) && v.frente !== "gavetas" && (
                      <p className="col-span-full -mt-1 text-xs text-stone-600">
                        Alturas das prateleiras definidas pelo desenho.{" "}
                        <button
                          type="button"
                          className="font-medium text-amber-800 underline underline-offset-2"
                          onClick={() =>
                            atualizar({
                              vaos: f.vaos.map((x, j) => (j === i ? { ...x, alturas: [] } : x)),
                            })
                          }
                        >
                          Voltar ao espaçamento igual
                        </button>
                      </p>
                    )}
                  </fieldset>
                ))}
              </div>
            </div>
          </Cartao>

          <Cartao
            titulo="Portas e gavetas"
            descricao="Para cada vão: aberto, porta ou gavetas."
          >
            <div className="grid gap-4">
              <CampoSelecao
                rotulo="Tipo de frente"
                value={f.modoFrente}
                onChange={(e) =>
                  atualizar({
                    modoFrente: e.target.value as Formulario["modoFrente"],
                  })
                }
                ajuda={
                  f.modoFrente === "sobreposta"
                    ? "A frente cobre a caixa; na divisória, cada vão cobre metade dela."
                    : "A frente fica dentro da boca do vão. Recue as prateleiras pelo menos a espessura da frente."
                }
              >
                <option value="sobreposta">Sobreposta</option>
                <option value="embutida">Embutida</option>
              </CampoSelecao>
              <div className="space-y-2">
                {f.vaos.map((v, i) => {
                  const mudarVao = (parcial: Partial<VaoForm>) =>
                    atualizar({
                      vaos: f.vaos.map((x, j) =>
                        j === i ? { ...x, ...parcial } : x,
                      ),
                    });
                  return (
                    <fieldset
                      key={i}
                      className="grid grid-cols-[3.5rem_7rem_1fr] items-end gap-2"
                    >
                      <legend className="sr-only">Frente do vão {i + 1}</legend>
                      <span className="pb-2.5 text-sm font-medium text-stone-700">
                        Vão {i + 1}
                      </span>
                      <MiniSelecao
                        rotulo={i === 0 ? "Frente" : undefined}
                        aria={`Frente do vão ${i + 1}`}
                        value={v.frente}
                        onChange={(t) =>
                          mudarVao({ frente: t as VaoForm["frente"] })
                        }
                      >
                        <option value="aberto">Aberto</option>
                        <option value="porta">Porta</option>
                        <option value="gavetas">Gavetas</option>
                      </MiniSelecao>
                      {v.frente === "porta" ? (
                        <div className="grid grid-cols-2 gap-2">
                          <MiniSelecao
                            rotulo={i === 0 ? "Portas" : undefined}
                            aria={`Portas no vão ${i + 1}`}
                            value={v.portas}
                            onChange={(t) =>
                              mudarVao({ portas: t as VaoForm["portas"] })
                            }
                          >
                            <option value="1">1</option>
                            <option value="2">2</option>
                          </MiniSelecao>
                          {v.portas === "1" ? (
                            <MiniSelecao
                              rotulo={i === 0 ? "Dobradiças" : undefined}
                              aria={`Lado das dobradiças no vão ${i + 1}`}
                              value={v.lado}
                              onChange={(t) =>
                                mudarVao({ lado: t as VaoForm["lado"] })
                              }
                            >
                              <option value="esquerda">Esq.</option>
                              <option value="direita">Dir.</option>
                            </MiniSelecao>
                          ) : (
                            <span />
                          )}
                        </div>
                      ) : v.frente === "gavetas" ? (
                        <MiniCampo
                          rotulo={i === 0 ? "Quantas" : undefined}
                          aria={`Gavetas no vão ${i + 1}`}
                          value={v.gavetas}
                          onChange={(t) => mudarVao({ gavetas: t })}
                        />
                      ) : (
                        <span />
                      )}
                    </fieldset>
                  );
                })}
              </div>
              {calculo.temFrente && (
                <label className="flex items-center gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    checked={f.puxador}
                    onChange={(e) => atualizar({ puxador: e.target.checked })}
                    className="accent-amber-600"
                  />
                  Puxador em cada porta e gaveta
                </label>
              )}
            </div>
          </Cartao>
        </>
      )}

      <Furacao
        f={f}
        atualizar={atualizar}
        substituir={substituir}
        calculo={calculo}
        somenteLeitura={somenteLeitura}
      />

      <Cartao
        titulo="Folgas e parâmetros"
        descricao="Valores em mm. Em branco, vale o padrão indicado."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {definicoesParametros
            .filter(
              (d) =>
                !NOMES_FURACAO.has(d.nome) &&
                (calculo.temFrente || !NOMES_FRENTES.has(d.nome)),
            )
            .map((d) => (
              <Campo
                key={d.nome}
                rotulo={d.rotulo}
                inputMode="decimal"
                placeholder={formatarMm(dmm(d.padrao))}
                value={f.parametros[d.nome] ?? ""}
                onChange={(e) =>
                  atualizar({
                    parametros: { ...f.parametros, [d.nome]: e.target.value },
                  })
                }
                ajuda={d.ajuda ?? `Padrão ${formatarMm(dmm(d.padrao))} mm`}
              />
            ))}
        </div>
      </Cartao>
    </fieldset>
  );
}

function MiniSelecao({
  rotulo,
  aria,
  value,
  onChange,
  children,
}: {
  rotulo?: string;
  aria: string;
  value: string;
  onChange: (t: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs text-stone-500">
      {rotulo && <span className="mb-1 block">{rotulo}</span>}
      <select
        aria-label={aria}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-lg border-0 bg-white px-2 py-2 text-sm text-stone-900 ring-1 ring-inset ring-stone-300 focus:ring-2 focus:ring-amber-500"
      >
        {children}
      </select>
    </label>
  );
}

function MiniCampo({
  rotulo,
  aria,
  value,
  placeholder,
  onChange,
  desabilitado,
}: {
  rotulo?: string;
  aria: string;
  value: string;
  placeholder?: string;
  onChange: (t: string) => void;
  desabilitado?: boolean;
}) {
  return (
    <label className="block text-xs text-stone-500">
      {rotulo && <span className="mb-1 block">{rotulo}</span>}
      <input
        aria-label={aria}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        disabled={desabilitado}
        title={
          desabilitado ? "Vão com gavetas não leva prateleira." : undefined
        }
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-lg border-0 bg-white px-2 py-2 text-sm text-stone-900 ring-1 ring-inset ring-stone-300 placeholder:text-stone-400 focus:ring-2 focus:ring-amber-500 disabled:bg-stone-100 disabled:text-stone-400"
      />
    </label>
  );
}

function SeletorMaterial({
  rotulo,
  materiais,
  materialId,
  espessura,
  erro,
  aoMudarMaterial,
  aoMudarEspessura,
}: {
  rotulo: string;
  materiais: Material[];
  materialId: string;
  espessura: string;
  erro: string | null;
  aoMudarMaterial: (id: string) => void;
  aoMudarEspessura: (t: string) => void;
}) {
  const existe = materiais.some((m) => m.id === materialId);
  return (
    <div className="grid grid-cols-[1fr_7rem] items-start gap-3">
      <CampoSelecao
        rotulo={rotulo}
        value={existe ? materialId : ""}
        onChange={(e) => aoMudarMaterial(e.target.value)}
      >
        <option value="">Informar espessura</option>
        {materiais.map((m) => (
          <option key={m.id} value={m.id}>
            {NOME_TIPO_MATERIAL[m.tipo]} · {descricaoMaterial(m)}
          </option>
        ))}
      </CampoSelecao>
      {existe ? (
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-stone-800">
            Espessura
          </span>
          <span className="tabular block py-2 text-sm">
            {formatarMm(
              dmm(
                (materiais.find((m) => m.id === materialId) as Material)
                  .espessura_calculo_dmm,
              ),
            )}{" "}
            mm
          </span>
        </div>
      ) : (
        <Campo
          rotulo="Espessura (mm)"
          inputMode="decimal"
          value={espessura}
          onChange={(e) => aoMudarEspessura(e.target.value)}
          erro={erro}
        />
      )}
    </div>
  );
}
