import { lazy, Suspense, useCallback, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { dmm, formatarMm, type Bordas, type Vista } from "@marcenaria/core";
import { useEmpresaAtual } from "../empresa/EmpresaProvider";
import { Aviso, Carregando, Cartao } from "../components/ui";
import { buscarMateriais, chaves } from "../lib/catalogo";
import type { Formulario } from "./formulario";
import { ListaPecas } from "./ListaPecas";
import { PainelEntradas } from "./PainelEntradas";
import { PecaSelecionada } from "./PecaSelecionada";
import { PlanoCorte, type ResumoPlano } from "./PlanoCorte";
import { Orcamento, type ProjetoDoOrcamento } from "./Orcamento";
import { podeVerOrcamentos } from "../lib/orcamentos";
import { podeCriarOrdem } from "../lib/producao";
import { EnviarProducao } from "./EnviarProducao";
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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <PainelEntradas
          f={f}
          atualizar={atualizar}
          substituir={(novo) => setF(() => novo)}
          calculo={calculo}
          carregandoMateriais={materiais.isPending}
          somenteLeitura={somenteLeitura}
        />

        <div className="min-w-0 space-y-6">
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
                    <Vista2D
                      resultado={resultado}
                      vista={aba}
                      selecionado={selecionado}
                      aoSelecionar={setSelecionado}
                    />
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

                {resultado.valido && resultado.componentes.length > 0 && (
                  <VerNoAmbiente
                    componentes={resultado.componentes}
                    nome={nomeArquivo}
                    titulo={projeto?.nome ?? ""}
                  />
                )}

                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  {(calculo.ehMesa
                    ? ([
                        ["Altura dos pés", "alturaPe"],
                        ["Profund. dos pés", "profPe"],
                        ["Vão entre os pés", "vaoEntrePes"],
                        ["Recuo dos pés (frente)", "rf"],
                      ] as const)
                    : ([
                        ["Largura interna", "Li"],
                        ["Altura interna", "Hi"],
                        ["Profund. da caixa", "Pc"],
                        ["Profund. livre", "Pint"],
                      ] as const)
                  ).map(([rotulo, chave]) => (
                    <div key={chave}>
                      <dt className="text-stone-500">{rotulo}</dt>
                      <dd className="tabular font-medium">
                        {resultado.medidas[chave] !== undefined
                          ? `${formatarMm(dmm(resultado.medidas[chave]))} mm`
                          : "–"}
                      </dd>
                    </div>
                  ))}
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
