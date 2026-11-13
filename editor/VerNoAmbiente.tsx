import { useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { cenaImersiva, dmm, lerFicha, modeloParaAmbiente, saudacaoMarceneiro, NOME_ASSISTENTE_MAX, type AjusteMedidas, type Componente, type FichaMovel } from '@marcenaria/core';
import { lerPrecoCentavos } from '@marcenaria/catalog';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Campo, CampoTexto } from '../components/ui';
import { publicarModelo } from '../lib/ar';
import { baixarBytes } from '../lib/exportar';
import { NOME_PADRAO_MARCENEIRO, perguntarPeloEditor, podeUsarMarceneiro, publicarApresentacao } from '../lib/marceneiro';
import { ConversaMarceneiro } from '../marceneiro/Conversa';
import { ComodoParaOculos, type EscolhaComodo } from '../oculos/ComodoParaOculos';

/** Código QR como caminho SVG (sem imagem externa). */
export function CodigoQR({ texto, tamanho = 176 }: { texto: string; tamanho?: number | string }) {
  const caminho = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let l = 0; l < n; l++) for (let c = 0; c < n; c++) if (qr.isDark(l, c)) d += `M${c + 4} ${l + 4}h1v1h-1z`;
    return { d, lado: n + 8 };
  }, [texto]);
  return (
    <svg viewBox={`0 0 ${caminho.lado} ${caminho.lado}`} width={tamanho} height={tamanho} role="img" aria-label="Código QR do link" shapeRendering="crispEdges">
      <rect width={caminho.lado} height={caminho.lado} fill="#fff" />
      <path d={caminho.d} fill="#000" />
    </svg>
  );
}

/** Campos que a marcenaria digita para o marceneiro virtual, já conferidos. */
function lerExtras(preco: string, prazo: string): { precoCentavos: number | null; prazoDias: number | null; erroPreco: string | null; erroPrazo: string | null } {
  let precoCentavos: number | null = null;
  let erroPreco: string | null = null;
  if (preco.trim()) {
    try {
      precoCentavos = lerPrecoCentavos(preco, 'Preço');
      if (precoCentavos > 1_000_000_000) {
        precoCentavos = null;
        erroPreco = 'Preço: valor alto demais.';
      }
    } catch (e) {
      erroPreco = e instanceof Error ? e.message : 'Preço inválido.';
    }
  }
  let prazoDias: number | null = null;
  let erroPrazo: string | null = null;
  if (prazo.trim()) {
    const n = Number(prazo.trim());
    if (Number.isInteger(n) && n >= 1 && n <= 730) prazoDias = n;
    else erroPrazo = 'Prazo: número inteiro de dias, de 1 a 730.';
  }
  return { precoCentavos, prazoDias, erroPreco, erroPrazo };
}

/** Publica o móvel em 3D, mostra o link para abrir na câmera do celular e cuida do marceneiro virtual. */
export function VerNoAmbiente({
  componentes,
  nome,
  titulo,
  ficha,
  aoAjustar,
}: {
  componentes: Componente[];
  nome: string;
  titulo: string;
  /** Ficha calculada do móvel (sem preço, prazo e observações). null: sem marceneiro virtual. */
  ficha?: FichaMovel | null;
  /** Editor: aplica a medida pedida pelo cliente. Devolve um aviso quando aplica só em parte. */
  aoAjustar?: (a: AjusteMedidas) => string | null;
}) {
  const { empresa, papel } = useEmpresaAtual();
  const [estado, setEstado] = useState<'parado' | 'gerando'>('parado');
  const [link, setLink] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const marceneiroPermitido = !!ficha && podeUsarMarceneiro(papel);
  const [incluir, setIncluir] = useState(true);
  const [nomeAssistente, setNomeAssistente] = useState(NOME_PADRAO_MARCENEIRO);
  const [preco, setPreco] = useState('');
  const [prazo, setPrazo] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [conversando, setConversando] = useState(false);
  const [noLink, setNoLink] = useState<boolean | null>(null);
  const [avisoMarceneiro, setAvisoMarceneiro] = useState<string | null>(null);
  const [comodo, setComodo] = useState<EscolhaComodo>(null);
  const larguraMovel = useMemo(() => dmm(Math.round(modeloParaAmbiente(componentes).dimensoes[0] * 10_000)), [componentes]);

  const extras = lerExtras(preco, prazo);
  const nomeLimpo = nomeAssistente.trim();
  const erroNome = !nomeLimpo ? 'Dê um nome ao assistente.' : nomeLimpo.length > NOME_ASSISTENTE_MAX ? `Até ${NOME_ASSISTENTE_MAX} letras.` : null;
  const fichaCompleta: FichaMovel | null =
    ficha && !extras.erroPreco && !extras.erroPrazo
      ? lerFicha({ ...ficha, precoCentavos: extras.precoCentavos, prazoDias: extras.prazoDias, observacoes: observacoes.trim().slice(0, 600) })
      : null;
  const prontoParaConversar = marceneiroPermitido && !!fichaCompleta && !erroNome;
  // A conversa no editor usa sempre a ficha mais recente (ela muda quando o desenho muda).
  const atual = useRef({ ficha: fichaCompleta, nome: nomeLimpo });
  atual.current = { ficha: fichaCompleta, nome: nomeLimpo };

  async function gerar() {
    setEstado('gerando');
    setErro(null);
    setLink(null);
    setCopiado(false);
    setNoLink(null);
    setAvisoMarceneiro(null);
    try {
      // O exportador 3D só é baixado quando alguém usa.
      const { gerarGlb, gerarUsdz } = await import('./ambiente3d');
      const [glb, usdz] = await Promise.all([gerarGlb(componentes, nome), gerarUsdz(componentes, nome)]);
      // Cena dos óculos: o móvel, o que abre e (se escolhido) o cômodo da medição.
      const cena = cenaImersiva(componentes, comodo?.comodo ?? null);
      const publicado = await publicarModelo(empresa.id, titulo, { glb, usdz, cena });
      if (marceneiroPermitido && incluir) {
        if (!prontoParaConversar || !fichaCompleta) {
          setAvisoMarceneiro('O link foi criado sem o marceneiro virtual: confira os campos dele.');
          setNoLink(false);
        } else {
          try {
            await publicarApresentacao({ id: publicado.id, empresaId: empresa.id, nome: nomeLimpo, ficha: fichaCompleta });
            setNoLink(true);
          } catch (e) {
            setAvisoMarceneiro(e instanceof Error ? e.message : 'Não foi possível incluir o marceneiro virtual no link.');
            setNoLink(false);
          }
        }
      }
      setLink(publicado.link);
    } catch {
      setErro('Não foi possível publicar o móvel em 3D. Confira a internet e tente de novo. Se continuar, o armazenamento de arquivos pode não estar configurado.');
    } finally {
      setEstado('parado');
    }
  }

  async function baixar() {
    setErro(null);
    try {
      const { gerarGlb } = await import('./ambiente3d');
      const glb = await gerarGlb(componentes, nome);
      baixarBytes(`${nome || 'movel'}.glb`, new Uint8Array(await glb.arrayBuffer()), 'model/gltf-binary');
    } catch {
      setErro('Não foi possível gerar o arquivo 3D.');
    }
  }

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[min(100%,15rem)] flex-1">
          <h3 className="text-sm font-semibold text-stone-900">Ver no ambiente</h3>
          <p className="text-sm text-stone-600">O móvel aparece em tamanho real pela câmera do celular, no lugar onde vai ficar, e também em óculos de realidade virtual (Meta Quest, Galaxy XR, Vision Pro) e óculos de encaixar o celular. Serve para mostrar ao cliente, não para tirar medidas.</p>
        </div>
        <Botao onClick={gerar} carregando={estado === 'gerando'}>
          {link ? 'Gerar de novo' : 'Gerar link'}
        </Botao>
        <Botao variante="discreto" onClick={baixar} disabled={estado === 'gerando'}>
          Baixar 3D (GLB)
        </Botao>
      </div>

      <ComodoParaOculos empresaId={empresa.id} larguraMovel={larguraMovel} aoMudar={setComodo} />
      {comodo && (comodo.erros.length > 0 || comodo.avisos.length > 0) && (
        <div className="mt-3">
          <Aviso tipo={comodo.erros.length ? 'erro' : 'info'}>{[...comodo.erros, ...comodo.avisos].map((p) => p.mensagem).join(' ')}{comodo.erros.length ? ' O link sai sem o cômodo.' : ''}</Aviso>
        </div>
      )}

      {marceneiroPermitido && (
        <div className="mt-4 rounded-lg bg-white p-4 ring-1 ring-stone-200">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-[min(100%,15rem)] flex-1">
              <h4 className="text-sm font-semibold text-stone-900">Marceneiro virtual</h4>
              <p className="text-sm text-stone-600">Um assistente com IA, em 3D e com voz, que explica o móvel ao cliente. Ele só fala do que está no projeto e nos campos abaixo; o que não souber, manda falar com a marcenaria.</p>
            </div>
            <Botao variante="secundario" onClick={() => setConversando((v) => !v)} disabled={!prontoParaConversar}>
              {conversando ? 'Fechar conversa' : 'Conversar aqui com o cliente'}
            </Botao>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm text-stone-800">
            <input type="checkbox" className="size-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500" checked={incluir} onChange={(e) => setIncluir(e.target.checked)} />
            Incluir o marceneiro virtual no link do cliente
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Nome do assistente" value={nomeAssistente} maxLength={NOME_ASSISTENTE_MAX} onChange={(e) => setNomeAssistente(e.target.value)} erro={erroNome} />
            <Campo
              rotulo="Preço para o cliente (R$)"
              inputMode="decimal"
              placeholder="Não informar"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              erro={extras.erroPreco}
              ajuda="Opcional. Sem preço, ele diz que a marcenaria informa."
            />
            <Campo rotulo="Prazo de entrega (dias)" inputMode="numeric" placeholder="Não informar" value={prazo} onChange={(e) => setPrazo(e.target.value)} erro={extras.erroPrazo} ajuda="Opcional." />
          </div>
          <div className="mt-3">
            <CampoTexto
              rotulo="Observações para o assistente"
              value={observacoes}
              maxLength={600}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Ex.: entrada de 50% e o restante na entrega; garantia de 1 ano; montagem inclusa."
              ajuda="Opcional. Ele pode repetir este texto ao cliente; não escreva o que não quer que o cliente leia."
            />
          </div>
          <p className="mt-2 text-xs text-stone-500">No link, cada cliente pode fazer até 40 perguntas e o link vale 30 dias. As perguntas contam na cota mensal da empresa.</p>

          {conversando && fichaCompleta && prontoParaConversar && (
            <div className="mt-4">
              <ConversaMarceneiro
                modo="editor"
                nome={nomeLimpo}
                saudacao={saudacaoMarceneiro(fichaCompleta, nomeLimpo)}
                sugestoes={['Quais são as medidas?', 'Qual o material?', ...(fichaCompleta.precoCentavos !== null ? ['Quanto custa?'] : []), 'Cabe uma maior?']}
                perguntar={(pergunta, historico) => {
                  const { ficha: f, nome: n } = atual.current;
                  if (!f) return Promise.reject(new Error('Confira os campos do marceneiro virtual.'));
                  return perguntarPeloEditor({ empresaId: empresa.id, ficha: f, nome: n, pergunta, historico });
                }}
                aoAplicarAjuste={
                  aoAjustar
                    ? (a) => {
                        // Medida nova, preço velho: o preço digitado deixa de valer.
                        setPreco('');
                        setAvisoMarceneiro(aoAjustar(a) ?? 'Medida aplicada no desenho. Confira o projeto e informe o preço de novo, se quiser.');
                      }
                    : undefined
                }
              />
            </div>
          )}
          {avisoMarceneiro && (
            <div className="mt-3">
              <Aviso tipo="info">{avisoMarceneiro}</Aviso>
            </div>
          )}
        </div>
      )}

      {erro && (
        <div className="mt-3">
          <Aviso>{erro}</Aviso>
        </div>
      )}
      {link && (
        <div className="mt-4 flex flex-wrap items-start gap-5">
          <div className="rounded-lg bg-white p-2 ring-1 ring-stone-200">
            <CodigoQR texto={link} />
          </div>
          <div className="min-w-0 flex-1 space-y-3 text-sm">
            <p className="text-stone-700">
              Aponte a câmera do celular para o código, ou envie o link. Quem recebe abre sem precisar de conta. Este link mostra o móvel como está agora; se mudar o projeto, gere outro.
              {noLink === true && ' O cliente também pode conversar com o marceneiro virtual na página.'}
            </p>
            <p className="tabular break-all rounded-md bg-white px-3 py-2 text-xs text-stone-600 ring-1 ring-stone-200">{link}</p>
            <div className="flex flex-wrap gap-2">
              <Botao variante="secundario" onClick={copiar}>
                {copiado ? 'Link copiado' : 'Copiar link'}
              </Botao>
              <a href={`https://wa.me/?text=${encodeURIComponent(`Veja o móvel no seu ambiente: ${link}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-stone-900 ring-1 ring-inset ring-stone-300 hover:bg-stone-50">
                Enviar pelo WhatsApp
              </a>
              <a href={link} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center rounded-lg px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200">
                Abrir neste aparelho
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
