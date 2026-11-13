import { lazy, Suspense, useCallback, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { dmm, formatarMm, montarFicha, MONTAGENS_PADRAO, nomeModeloMesa, type AjusteMedidas, type Bordas, type FichaMovel, type Vista } from "@marcenaria/core";
import type { ModeloMesa } from "@marcenaria/core";
import { useEmpresaAtual } from "../empresa/EmpresaProvider";
import { Aviso, Carregando, Cartao } from "../components/ui";
import { buscarMateriais, chaves } from "../lib/catalogo";
import type { Formulario } from "./formulario";
import { ListaPecas } from "./ListaPecas";
import { PainelEntradas } from "./PainelEntradas";
import { PecaSelecionada } from "./PecaSelecionada";
import { AjusteInterior } from "./AjusteInterior";
import { alvoDe, moverDivisoriaNoFormulario, moverPrateleiraNoFormulario } from "./ajustes";
import { PlanoCorte, type ResumoPlano } from "./PlanoCorte";
import { Orcamento, type ProjetoDoOrcamento } from "./Orcamento";
import { podeVerOrcamentos } from "../lib/orcamentos";
import { podeCriarOrdem } from "../lib/producao";
import { EnviarProducao } from "./EnviarProducao";
import { ManualMontagemCartao } from "./ManualMontagemCartao";
import { FolhaFuracao } from "./FolhaFuracao";
import { ListaFerragens } from "./ListaFerragens";
import { useCalculo, type Calculo } from "./useCalculo";
import { VerNoAmbiente } from "./VerNoAmbiente";
import { Vista2D } from "./Vista2D";

// O 3D (Three.js) só é baixado quando alguém abre a aba.
const Visualizador3D = lazy(() => import("./Visualizador3D"));

type Aba = "3d" | Vista;
const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: "3d", rotulo: "3D" },
  { id: "frente", rotulo: "Frente" },
  { id: "lateral", rotulo: "Lateral" },
  { id: "planta", rotulo: "Planta" },
];

const CHAVE_ABA = "marcenaria:editor-aba";

function abaInicial(): Aba {
  try {
    const a = localStorage.getItem(CHAVE_ABA);
    if (a && ABAS.some((x) => x.id === a)) return a as Aba;
  } catch {
    // Sem armazenamento: começa no 3D.
  }
  return "3d";
}

/**
 * Editor do módulo: entradas à esquerda; desenho, peça selecionada e lista à
 * direita. O mesmo editor serve ao rascunho e aos projetos salvos.
 */
export function AreaEditor({
  f,
  setF,
  somenteLeitura,
  nomeArquivo,
  aoCalcular,
  projeto,
}: {
  f: Formulario;
  setF: (atualizar: (atual: Formulario) => Formulario) => void;
  somenteLeitura: boolean;
  nomeArquivo: string;
  /** Recebe o cálculo a cada renderização (para quem salva saber regras e validade). */
  aoCalcular?: (calculo: Calculo) => ReactNode;
  /** Projeto salvo de onde o orçamento pode ser emitido. */
  projeto?: ProjetoDoOrcamento;
}) {
  const { empresa, papel } = useEmpresaAtual();
  const [plano, setPlano] = useState<ResumoPlano | null>(null);
  const materiais = useQuery({
    queryKey: chaves.materiais(empresa.id),
    queryFn: () => buscarMateriais(empresa.id),
  });
  const calculo = useCalculo(f, setF, materiais.data ?? []);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>(abaInicial);
  // Celular e tablet em pé: qual coluna aparece (no computador, as duas).
  const [abaMovel, setAbaMovel] = useState<"medidas" | "resultado">("medidas");
  // Vista de frente sem portas e frentes, para alcançar divisórias e prateleiras.
  const [semFrentes, setSemFrentes] = useState(false);

  const atualizar = useCallback(
    (parcial: Partial<Formulario>) =>
      setF((atual) => ({ ...atual, ...parcial })),
    [setF],
  );

  function escolherAba(a: Aba) {
    setAba(a);
    try {
      localStorage.setItem(CHAVE_ABA, a);
    } catch {
      // Preferência só desta visita.
    }
  }

  const { resultado, problemasChapa, avisosChapa, errosCampos, pecas } =
    calculo;

  // Ficha do marceneiro virtual: só fatos do cálculo (preço e prazo a marcenaria digita depois).
  let ficha: FichaMovel | null = null;
  if (resultado?.valido && resultado.componentes.length > 0) {
    const nomeMaterial = (m: { nome: string; espessura_nominal_dmm: number } | null) =>
      m ? (/\d\s*mm/i.test(m.nome) ? m.nome : `${m.nome} ${formatarMm(dmm(m.espessura_nominal_dmm))} mm`) : undefined;
    ficha = montarFicha({
      marcenaria: empresa.nome,
      titulo: projeto?.nome ?? "",
      tipo: calculo.ehMesa
        ? nomeModeloMesa(f.mesa.modelo)
        : `Armário ou gabinete (${(MONTAGENS_PADRAO.find((m) => m.codigo === f.montagem)?.nome ?? "caixa").toLowerCase()})`,
      componentes: resultado.componentes,
      ferragens: resultado.ferragens,
      materiais: {
        estrutura: nomeMaterial(calculo.matEstrutura),
        fundo: nomeMaterial(calculo.matFundo),
        frente: nomeMaterial(calculo.matFrente),
        gaveta: nomeMaterial(calculo.matGaveta),
      },
      totalPecas: calculo.lista?.totalPecas,
      quantidadeModulos: calculo.qtdModulos,
    });
  }

  // Ajuste do interior pelo desenho (opcional): divisória, prateleira, vão.
  const alvo = alvoDe(selecionado);
  const podeAjustarInterior = !somenteLeitura && !calculo.ehMesa;
  const temFrentes = !!resultado?.componentes.some((c) => c.papel === "porta" || c.papel === "frente_gaveta");
  function arrastar(id: string, valor: number) {
    const a = alvoDe(id);
    if (!a || !resultado) return;
    const m =
      a.tipo === "divisoria"
        ? moverDivisoriaNoFormulario(f.vaos, resultado, a.k, valor)
        : a.tipo === "prateleira"
          ? moverPrateleiraNoFormulario(f.vaos, resultado, a.vao, a.j, valor)
          : null;
    if (m && m.erro === null) atualizar({ vaos: m.vaos });
    setSelecionado(id);
  }

  /** Medida pedida pelo cliente na conversa: vai para os campos do formulário. */
  function aplicarAjuste(a: AjusteMedidas): string | null {
    const larguraFixa = calculo.ehMesa && f.mesa.modelo === "sobre_gabinetes";
    atualizar({
      ...(a.largura !== undefined && !larguraFixa ? { L: String(a.largura) } : {}),
      ...(a.altura !== undefined ? { A: String(a.altura) } : {}),
      ...(a.profundidade !== undefined ? { P: String(a.profundidade) } : {}),
    });
    return larguraFixa && a.largura !== undefined
      ? "No tampo sobre gabinetes o comprimento vem das larguras dos gabinetes: ajuste esse campo. O resto foi aplicado; informe o preço de novo, se quiser."
      : null;
  }
  const componente =
    resultado?.componentes.find((c) => c.id === selecionado) ?? null;
  const peca = pecas.find((p) => p.id === selecionado);

  function mudarBorda(id: string, borda: keyof Bordas, valor: boolean) {
    const atual = pecas.find((p) => p.id === id);
    if (!atual) return;
    // Guarda só a diferença em relação ao padrão desta peça.
    const semTroca = { ...f.bordas };
    delete semTroca[id];
    const padrao = calculo.pecasPadrao.find((p) => p.id === id)?.bordas;
    const novas = { ...atual.bordas, [borda]: valor };
    const diff: Partial<Bordas> = {};
    for (const k of ["frente", "tras", "ext1", "ext2"] as const)
      if (!padrao || novas[k] !== padrao[k]) diff[k] = novas[k];
    atualizar({
      bordas: Object.keys(diff).length ? { ...semTroca, [id]: diff } : semTroca,
    });
  }

  function restaurar(id: string) {
    const semTroca = { ...f.bordas };
    delete semTroca[id];
    atualizar({ bordas: semTroca });
  }

  return (
    <div className="space-y-6">
      {aoCalcular?.(calculo)}
      {/* Celular e tablet em pé: uma coluna por vez, com abas fixas no topo. */}
      <div
        role="tablist"
        aria-label="Parte do editor"
        className="sticky top-14 z-20 -mx-4 flex gap-1 border-b border-stone-200 bg-creme/95 px-4 py-2 backdrop-blur lg:hidden"
      >
        {(
          [
            ["medidas", "Medidas"],
            ["resultado", "Desenho e resultado"],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={abaMovel === valor}
            onClick={() => {
              setAbaMovel(valor);
              window.scrollTo({ top: 0 });
            }}
            className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-medium ${
              abaMovel === valor
                ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-200"
                : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            {rotulo}
            {valor === "resultado" && errosCampos.length > 0 && (
              <span className="ml-1.5 inline-block size-2 rounded-full bg-red-600 align-middle" aria-label="há erros" />
            )}
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className={`${abaMovel === "medidas" ? "" : "hidden"} min-w-0 lg:block`}>
          <PainelEntradas
            f={f}
            atualizar={atualizar}
            substituir={(novo) => setF(() => novo)}
            calculo={calculo}
            carregandoMateriais={materiais.isPending}
            somenteLeitura={somenteLeitura}
          />
          <button
            type="button"
            onClick={() => {
              setAbaMovel("resultado");
              window.scrollTo({ top: 0 });
            }}
            className="mt-4 min-h-11 w-full rounded-lg bg-nogueira px-4 text-sm font-medium text-white lg:hidden"
          >
            Ver desenho e resultado
          </button>
        </div>

        <div className={`${abaMovel === "resultado" ? "" : "hidden"} min-w-0 space-y-6 lg:block`}>
          {errosCampos.length > 0 && (
            <Aviso>
              <ul className="list-inside list-disc space-y-1">
                {errosCampos.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Aviso>
          )}

          {resultado && (
            <>
              {(resultado.erros.length > 0 || problemasChapa.length > 0) && (
                <Aviso>
                  <p className="mb-1 font-medium">
                    Este módulo não pode seguir para produção:
                  </p>
                  <ul className="list-inside list-disc space-y-1">
                    {[
                      ...resultado.erros.map((e) => e.mensagem),
                      ...problemasChapa,
                    ].map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </Aviso>
              )}
              {resultado.avisos.filter((a) => a.codigo !== "gavetas_info")
                .length > 0 && (
                <Aviso tipo="info">
                  <ul className="list-inside list-disc space-y-1">
                    {resultado.avisos
                      .filter((a) => a.codigo !== "gavetas_info")
                      .map((a) => (
                        <li key={a.mensagem}>{a.mensagem}</li>
                      ))}
                  </ul>
                </Aviso>
              )}
              {avisosChapa.map((a) => (
                <Aviso key={a} tipo="info">
                  {a}
                </Aviso>
              ))}

              <Cartao
                titulo="Desenho"
                descricao="Clique numa peça para ver medidas, fita e usinagem. Prateleiras desenhadas com espaçamento igual."
              >
                <div
                  role="tablist"
                  aria-label="Tipo de desenho"
                  className="mb-4 inline-flex rounded-lg bg-stone-100 p-1"
                >
                  {ABAS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      role="tab"
                      aria-selected={aba === a.id}
                      onClick={() => escolherAba(a.id)}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${aba === a.id ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900"}`}
                    >
                      {a.rotulo}
                    </button>
                  ))}
                </div>

                {resultado.componentes.length > 0 &&
                  (aba === "3d" ? (
                    <Suspense
                      fallback={
                        <div className="flex h-[24rem] items-center justify-center">
                          <Carregando texto="Carregando 3D…" />
                        </div>
                      }
                    >
                      <Visualizador3D
                        componentes={resultado.componentes}
                        pecas={pecas}
                        selecionado={selecionado}
                        aoSelecionar={setSelecionado}
                      />
                    </Suspense>
                  ) : (
                    <>
                      {aba === "frente" && temFrentes && (
                        <label className="mb-2 flex items-center gap-2 text-sm text-stone-700">
                          <input
                            type="checkbox"
                            checked={semFrentes}
                            onChange={(e) => setSemFrentes(e.target.checked)}
                            className="accent-amber-600"
                          />
                          Ver sem as portas e frentes
                        </label>
                      )}
                      <Vista2D
                        resultado={resultado}
                        vista={aba}
                        selecionado={selecionado}
                        aoSelecionar={setSelecionado}
                        semFrentes={semFrentes}
                        aoArrastar={podeAjustarInterior ? arrastar : undefined}
                      />
                      {aba === "frente" && podeAjustarInterior && resultado.componentes.some((c) => c.papel === "divisoria" || c.papel.startsWith("prateleira")) && (
                        <p className="mt-2 text-center text-xs text-stone-500">
                          Arraste uma divisória ou prateleira para mudar a posição, ou clique nela para digitar a medida.
                        </p>
                      )}
                    </>
                  ))}

                {componente && (
                  <div className="mt-4">
                    <PecaSelecionada
                      componente={componente}
                      peca={peca}
                      trocada={!!f.bordas[componente.id]}
                      podeEditar={!somenteLeitura}
                      aoMudarBorda={(b, v) => mudarBorda(componente.id, b, v)}
                      aoRestaurar={() => restaurar(componente.id)}
                      aoFechar={() => setSelecionado(null)}
                    />
                  </div>
                )}
                {alvo && !calculo.ehMesa && (
                  <AjusteInterior
                    alvo={alvo}
                    resultado={resultado}
                    f={f}
                    atualizar={atualizar}
                    somenteLeitura={somenteLeitura}
                  />
                )}

                {resultado.valido && resultado.componentes.length > 0 && (
                  <VerNoAmbiente
                    componentes={resultado.componentes}
                    nome={nomeArquivo}
                    titulo={projeto?.nome ?? ""}
                    ficha={ficha}
                    aoAjustar={somenteLeitura ? undefined : aplicarAjuste}
                  />
                )}

                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  {resumoDasMedidas(calculo.ehMesa ? f.mesa.modelo : null).map(
                    ([rotulo, chave, contagem]) => (
                      <div key={chave}>
                        <dt className="text-stone-500">{rotulo}</dt>
                        <dd className="tabular font-medium">
                          {resultado.medidas[chave] === undefined
                            ? "–"
                            : contagem
                              ? String(resultado.medidas[chave])
                              : `${formatarMm(dmm(resultado.medidas[chave]))} mm`}
                        </dd>
                      </div>
                    ),
                  )}
                </dl>
              </Cartao>

              <ListaPecas
                f={f}
                atualizar={atualizar}
                calculo={calculo}
                selecionado={selecionado}
                aoSelecionar={setSelecionado}
                nomeArquivo={nomeArquivo}
                somenteLeitura={somenteLeitura}
              />

              <FolhaFuracao calculo={calculo} nomeArquivo={nomeArquivo} />

              <ManualMontagemCartao calculo={calculo} titulo={projeto?.nome ?? ""} />

              <ListaFerragens
                f={f}
                atualizar={atualizar}
                calculo={calculo}
                somenteLeitura={somenteLeitura}
                nomeArquivo={nomeArquivo}
              />

              <PlanoCorte
                f={f}
                atualizar={atualizar}
                calculo={calculo}
                somenteLeitura={somenteLeitura}
                nomeArquivo={nomeArquivo}
                aoPlanejar={setPlano}
              />

              {podeVerOrcamentos(papel) && (
                <Orcamento
                  f={f}
                  atualizar={atualizar}
                  calculo={calculo}
                  plano={plano}
                  somenteLeitura={somenteLeitura}
                  nomeArquivo={nomeArquivo}
                  projeto={projeto}
                />
              )}

              {podeCriarOrdem(papel) && !somenteLeitura && (
                <EnviarProducao
                  f={f}
                  calculo={calculo}
                  plano={plano}
                  projeto={projeto}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** O que mostrar embaixo do desenho, conforme o tipo de móvel. Terceiro item: é contagem, não medida. */
function resumoDasMedidas(
  modelo: ModeloMesa | null,
): ReadonlyArray<readonly [string, string, boolean]> {
  switch (modelo) {
    case "pes_mdf":
      return [
        ["Altura dos pés", "alturaPe", false],
        ["Profund. dos pés", "profPe", false],
        ["Vão entre os pés", "vaoEntrePes", false],
        ["Recuo dos pés (frente)", "rf", false],
      ];
    case "pes_comprados":
      return [
        ["Altura dos pés", "alturaPe", false],
        ["Recuo dos pés (frente)", "rf", false],
        ["Recuo dos pés (pontas)", "rl", false],
        ["Largura", "L", false],
      ];
    case "suspensa":
      return [
        ["Suportes", "suportes", true],
        ["Entre suportes", "passoSuportes", false],
        ["Comprimento", "L", false],
        ["Altura do tampo", "A", false],
      ];
    case "sobre_gabinetes":
      return [
        ["Comprimento do tampo", "comprimentoTampo", false],
        ["Gabinetes", "gabinetes", true],
        ["Profund. dos gabinetes", "profGabinete", false],
        ["Altura dos gabinetes", "alturaGabinete", false],
      ];
    default:
      return [
        ["Largura interna", "Li", false],
        ["Altura interna", "Hi", false],
        ["Profund. da caixa", "Pc", false],
        ["Profund. livre", "Pint", false],
      ];
  }
}
