import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  formatarMm,
  lerMm,
  validarLeitura,
  type LeituraMovel,
} from "@marcenaria/core";
import { useEmpresaAtual } from "../empresa/EmpresaProvider";
import {
  Aviso,
  Botao,
  Campo,
  CampoTexto,
  Carregando,
  Cartao,
  Titulo,
} from "../components/ui";
import {
  INICIAL,
  mesmoFormulario,
  normalizarFormulario,
  type Formulario,
} from "../editor/formulario";
import { useCalculo } from "../editor/useCalculo";
import { Vista2D } from "../editor/Vista2D";
import { formularioDaLeitura } from "../editor/visao";
import { mensagemDeErro } from "../lib/erros";
import { lerCampo } from "../lib/formulario";
import {
  ErroVisao,
  analisarImagem,
  buscarCotaVisao,
  chaveCotaVisao,
  podeUsarVisao,
  prepararImagem,
  type ImagemPreparada,
} from "../lib/visao";

const CHAVE_RASCUNHO = "marcenaria:calculadora-modulo";

const NOME_CONFIANCA = {
  alta: "alta",
  media: "média",
  baixa: "baixa",
} as const;
const NOME_ORIGEM = {
  informadas: "Medidas informadas por você.",
  parciais:
    "Parte das medidas foi calculada pela proporção na foto. Confira com a trena.",
  estimadas:
    "Medidas estimadas pela aparência: a foto não tem escala. Confira com a trena antes de produzir.",
} as const;

function descreverVao(v: LeituraMovel["vaos"][number]): string {
  const frente =
    v.frente === "porta"
      ? v.portas === 2
        ? "2 portas"
        : `1 porta (dobradiças à ${v.lado})`
      : v.frente === "gavetas"
        ? `${v.gavetas} ${v.gavetas === 1 ? "gaveta" : "gavetas"}`
        : "aberto";
  const prat =
    v.prateleiras > 0
      ? `, ${v.prateleiras} ${v.prateleiras === 1 ? "prateleira" : "prateleiras"}`
      : "";
  return `${frente}${prat}`;
}

export function VisaoIA() {
  const { empresa, papel } = useEmpresaAtual();
  const pode = podeUsarVisao(papel);
  const queryClient = useQueryClient();
  const cota = useQuery({
    queryKey: chaveCotaVisao(empresa.id),
    queryFn: () => buscarCotaVisao(empresa.id),
    enabled: pode,
  });

  const [imagem, setImagem] = useState<ImagemPreparada | null>(null);
  const [medidas, setMedidas] = useState({ L: "", A: "", P: "" });
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<{
    texto: string;
    explicacao?: string | null;
    ajuda?: string[];
  } | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [leitura, setLeitura] = useState<LeituraMovel | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  // Veio da medição no local: foto da parede, medidas e o que foi marcado nela.
  const local = useLocation();
  const navegarVisao = useNavigate();
  useEffect(() => {
    const m = (local.state as { daMedicao?: { foto: Blob; L: string; A: string; P: string; nota: string } } | null)?.daMedicao;
    if (!m) return;
    setMedidas({ L: m.L, A: m.A, P: m.P });
    setNota(m.nota);
    void receber(new File([m.foto], "medicao.jpg", { type: "image/jpeg" }));
    // Não reaplica ao voltar para a página.
    navegarVisao(local.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function receber(f: File | undefined) {
    if (!f) return;
    setErro(null);
    setLeitura(null);
    try {
      setImagem(await prepararImagem(f));
    } catch (e) {
      setImagem(null);
      setErro({
        texto:
          e instanceof Error ? e.message : "Não foi possível abrir a imagem.",
      });
    }
  }
  const aoEscolher = (e: ChangeEvent<HTMLInputElement>) => {
    void receber(e.target.files?.[0]);
    e.target.value = "";
  };
  const aoSoltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    void receber(e.dataTransfer.files?.[0]);
  };

  const campos = {
    L: lerCampo(medidas.L, lerMm),
    A: lerCampo(medidas.A, lerMm),
    P: lerCampo(medidas.P, lerMm),
  };
  const erroMedidas = campos.L.erro ?? campos.A.erro ?? campos.P.erro;
  const semCota = cota.data ? cota.data.usadas >= cota.data.limite : false;

  async function analisar() {
    if (!imagem || erroMedidas) return;
    setErro(null);
    setAnalisando(true);
    try {
      // A função recebe milímetros inteiros.
      const emMm = (v: number | undefined) =>
        v === undefined ? undefined : Math.round(v / 10);
      const r = await analisarImagem({
        empresaId: empresa.id,
        imagem,
        medidas: {
          largura: emMm(campos.L.valor),
          altura: emMm(campos.A.valor),
          profundidade: emMm(campos.P.valor),
        },
        nota,
      });
      const v = validarLeitura(r.leitura);
      if (!v.ok) {
        setErro({ texto: v.motivo });
      } else {
        setLeitura(v.leitura);
      }
    } catch (e) {
      if (e instanceof ErroVisao)
        setErro({ texto: e.message, explicacao: e.explicacao, ajuda: e.ajuda });
      else setErro({ texto: mensagemDeErro(e) });
    } finally {
      setAnalisando(false);
      void queryClient.invalidateQueries({
        queryKey: chaveCotaVisao(empresa.id),
      });
    }
  }

  function recomecar() {
    setImagem(null);
    setLeitura(null);
    setErro(null);
  }

  if (!pode)
    return <Aviso tipo="info">Sua função não tem acesso à Visão IA.</Aviso>;

  return (
    <>
      <Titulo subtitulo="Fotografe um móvel ou envie uma imagem de referência. A IA lê a estrutura; o sistema calcula as peças.">
        Visão Inteligente IA
      </Titulo>

      {leitura && imagem ? (
        <Revisao imagem={imagem} leitura={leitura} aoRecomecar={recomecar} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <Cartao
            titulo="1. A imagem"
            descricao="De frente, com o móvel inteiro no quadro e boa luz. Portas fechadas mostram a frente; abertas mostram o interior."
          >
            <input
              ref={camera}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={aoEscolher}
            />
            <input
              ref={arquivo}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              className="hidden"
              onChange={aoEscolher}
            />
            {imagem ? (
              <div>
                <img
                  src={imagem.url}
                  alt="Imagem escolhida"
                  className="mx-auto max-h-[28rem] rounded-lg ring-1 ring-stone-200"
                />
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <Botao
                    variante="secundario"
                    onClick={() => arquivo.current?.click()}
                    disabled={analisando}
                  >
                    Trocar imagem
                  </Botao>
                  <Botao
                    variante="discreto"
                    onClick={recomecar}
                    disabled={analisando}
                  >
                    Remover
                  </Botao>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastando(true);
                }}
                onDragLeave={() => setArrastando(false)}
                onDrop={aoSoltar}
                className={`flex flex-col items-center gap-4 rounded-xl border-2 border-dashed px-6 py-12 text-center ${arrastando ? "border-amber-500 bg-amber-50" : "border-stone-300"}`}
              >
                <p className="text-sm text-stone-600">
                  Arraste uma imagem para cá, ou:
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Botao onClick={() => camera.current?.click()}>
                    Tirar foto
                  </Botao>
                  <Botao
                    variante="secundario"
                    onClick={() => arquivo.current?.click()}
                  >
                    Enviar imagem
                  </Botao>
                </div>
                <p className="text-xs text-stone-500">
                  JPEG, PNG ou WebP. A foto é reduzida no seu aparelho antes de
                  ser enviada.
                </p>
              </div>
            )}
          </Cartao>

          <div className="space-y-6">
            <Cartao
              titulo="2. Medidas que você sabe"
              descricao="Opcional, mas ajuda muito: uma foto não tem escala. Com a largura, a IA calcula o resto pela proporção."
            >
              <div className="grid grid-cols-3 gap-3">
                <Campo
                  rotulo="Largura (mm)"
                  inputMode="decimal"
                  value={medidas.L}
                  onChange={(e) =>
                    setMedidas({ ...medidas, L: e.target.value })
                  }
                />
                <Campo
                  rotulo="Altura (mm)"
                  inputMode="decimal"
                  value={medidas.A}
                  onChange={(e) =>
                    setMedidas({ ...medidas, A: e.target.value })
                  }
                />
                <Campo
                  rotulo="Profund. (mm)"
                  inputMode="decimal"
                  value={medidas.P}
                  onChange={(e) =>
                    setMedidas({ ...medidas, P: e.target.value })
                  }
                />
              </div>
              {erroMedidas && (
                <p className="mt-2 text-sm text-red-700">{erroMedidas}</p>
              )}
              <div className="mt-3">
                <CampoTexto
                  rotulo="Observação para a IA"
                  rows={2}
                  maxLength={300}
                  placeholder="Ex.: é o gabinete da esquerda; as portas são de correr"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                />
              </div>
            </Cartao>

            <Cartao titulo="3. Analisar">
              {erro && (
                <div className="mb-4">
                  <Aviso>
                    {erro.texto}
                    {erro.explicacao && (
                      <span className="mt-1 block text-stone-700">
                        O que a IA viu: “{erro.explicacao}”
                      </span>
                    )}
                    {erro.ajuda && erro.ajuda.length > 0 && (
                      <span className="mt-2 block text-stone-700">
                        <span className="block font-medium">
                          Como resolver:
                        </span>
                        <ol className="mt-1 list-decimal space-y-1 pl-5">
                          {erro.ajuda.map((a) => (
                            <li key={a} className="break-words">
                              {a}
                            </li>
                          ))}
                        </ol>
                      </span>
                    )}
                  </Aviso>
                </div>
              )}
              {analisando ? (
                <Carregando texto="A IA está lendo a imagem… costuma levar de 5 a 20 segundos." />
              ) : (
                <Botao
                  onClick={analisar}
                  disabled={!imagem || !!erroMedidas || semCota}
                  className="w-full"
                >
                  Analisar imagem
                </Botao>
              )}
              <p className="mt-3 text-sm text-stone-600">
                {cota.data ? (
                  <>
                    <span className="tabular font-medium">
                      {cota.data.usadas} de {cota.data.limite}
                    </span>{" "}
                    análises usadas este mês.
                    {semCota && " A cota acabou; ela renova no dia 1º."}
                  </>
                ) : cota.error ? (
                  mensagemDeErro(cota.error)
                ) : (
                  "Conferindo a cota…"
                )}
              </p>
              <p className="mt-2 text-xs text-stone-500">
                A imagem é enviada ao serviço de IA (Anthropic) só para esta
                leitura e não fica guardada no Meu Marceneiro. Evite fotos com
                pessoas ou documentos à vista.
              </p>
            </Cartao>
          </div>
        </div>
      )}
    </>
  );
}

/** Foto ao lado do que o sistema montou, com as medidas para confirmar. */
function Revisao({
  imagem,
  leitura,
  aoRecomecar,
}: {
  imagem: ImagemPreparada;
  leitura: LeituraMovel;
  aoRecomecar: () => void;
}) {
  const navegar = useNavigate();
  const [medidas, setMedidas] = useState({
    L: formatarMm(leitura.largura),
    A: formatarMm(leitura.altura),
    P: formatarMm(leitura.profundidade),
  });
  const [conferi, setConferi] = useState(
    leitura.origemMedidas === "informadas",
  );

  // O formulário nasce da leitura + medidas; o hook do editor calcula o módulo de verdade.
  const base = useMemo(
    () => formularioDaLeitura(leitura, medidas),
    [leitura, medidas],
  );
  const [ajuste, setAjuste] = useState<Formulario | null>(null);
  const f =
    ajuste && ajuste.L === base.L && ajuste.A === base.A && ajuste.P === base.P
      ? ajuste
      : base;
  const setF = useCallback(
    (atualizar: (atual: Formulario) => Formulario) =>
      setAjuste((a) => atualizar(a ?? base)),
    [base],
  );
  const calculo = useCalculo(f, setF, []);
  const { resultado, errosCampos } = calculo;
  const problemas = [
    ...errosCampos,
    ...(resultado?.erros.map((e) => e.mensagem) ?? []),
  ];

  function abrirNoEditor() {
    try {
      const atual = localStorage.getItem(CHAVE_RASCUNHO);
      if (
        atual &&
        !mesmoFormulario(normalizarFormulario(JSON.parse(atual)), INICIAL) &&
        !window.confirm(
          "Isto substitui o rascunho que está no editor. Continuar?",
        )
      )
        return;
      localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(f));
    } catch {
      // Sem armazenamento local não há como passar o projeto ao editor.
      window.alert(
        "Este navegador não permite guardar o rascunho. Libere o armazenamento do site e tente de novo.",
      );
      return;
    }
    navegar("/modulo");
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao titulo="Sua imagem">
          <img
            src={imagem.url}
            alt="Imagem enviada"
            className="mx-auto max-h-[26rem] rounded-lg ring-1 ring-stone-200"
          />
        </Cartao>
        <Cartao
          titulo="O que o sistema montou"
          descricao="Vista de frente calculada pelo motor a partir da leitura. Compare com a foto."
        >
          {resultado && resultado.componentes.length > 0 ? (
            <Vista2D
              resultado={resultado}
              vista="frente"
              selecionado={null}
              aoSelecionar={() => undefined}
            />
          ) : (
            <p className="py-10 text-center text-sm text-stone-500">
              Corrija as medidas para ver o desenho.
            </p>
          )}
        </Cartao>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Cartao
          titulo={leitura.tipo}
          descricao={`Leitura da IA · confiança ${NOME_CONFIANCA[leitura.confianca]} na estrutura`}
        >
          <ul className="text-sm">
            {leitura.vaos.map((v, i) => (
              <li
                key={i}
                className="flex gap-3 border-b border-stone-100 py-1.5"
              >
                <span className="w-14 shrink-0 font-medium text-stone-700">
                  Vão {i + 1}
                </span>
                <span>{descreverVao(v)}</span>
              </li>
            ))}
            <li className="flex gap-3 py-1.5">
              <span className="w-14 shrink-0 font-medium text-stone-700">
                Frente
              </span>
              <span>{leitura.modoFrente}</span>
            </li>
          </ul>

          {leitura.naoRepresentado.length > 0 && (
            <div className="mt-4">
              <Aviso tipo="info">
                <p className="mb-1 font-medium">
                  Ficou de fora do projeto (o sistema ainda não representa):
                </p>
                <ul className="list-inside list-disc">
                  {leitura.naoRepresentado.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </Aviso>
            </div>
          )}
          {(leitura.observacoes.length > 0 || leitura.ajustes.length > 0) && (
            <div className="mt-4 text-sm text-stone-600">
              <p className="mb-1 font-medium text-stone-800">
                Suposições e ajustes
              </p>
              <ul className="list-inside list-disc space-y-0.5">
                {[...leitura.observacoes, ...leitura.ajustes].map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
        </Cartao>

        <Cartao titulo="Confirme as medidas">
          <div className="grid grid-cols-3 gap-3">
            <Campo
              rotulo="Largura (mm)"
              inputMode="decimal"
              value={medidas.L}
              onChange={(e) => setMedidas({ ...medidas, L: e.target.value })}
            />
            <Campo
              rotulo="Altura (mm)"
              inputMode="decimal"
              value={medidas.A}
              onChange={(e) => setMedidas({ ...medidas, A: e.target.value })}
            />
            <Campo
              rotulo="Profund. (mm)"
              inputMode="decimal"
              value={medidas.P}
              onChange={(e) => setMedidas({ ...medidas, P: e.target.value })}
            />
          </div>
          <p
            className={`mt-3 text-sm ${leitura.origemMedidas === "informadas" ? "text-stone-600" : "text-amber-800"}`}
          >
            {NOME_ORIGEM[leitura.origemMedidas]}
          </p>
          {problemas.length > 0 && (
            <div className="mt-3">
              <Aviso>
                <ul className="list-inside list-disc">
                  {problemas.slice(0, 5).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Aviso>
            </div>
          )}
          <label className="mt-4 flex items-start gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={conferi}
              onChange={(e) => setConferi(e.target.checked)}
              className="mt-0.5 accent-amber-600"
            />
            Conferi as medidas (ou vou conferir no editor antes de produzir).
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <Botao onClick={abrirNoEditor} disabled={!conferi}>
              Abrir no editor
            </Botao>
            <Botao variante="secundario" onClick={aoRecomecar}>
              Outra imagem
            </Botao>
          </div>
          <p className="mt-3 text-xs text-stone-500">
            No editor você ajusta vãos, portas, gavetas e materiais, vê as peças
            e o plano de corte, e salva como projeto.
          </p>
        </Cartao>
      </div>
    </div>
  );
}
