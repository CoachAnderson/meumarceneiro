import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  analisarParede,
  anguloDoCanto,
  diagonalEsquadro,
  dmm,
  formatarMm,
  interferencias,
  NOME_PONTO,
  notaParaVisao,
  novaParede,
  PADRAO_ANALISE,
  PONTUAIS,
  textoMedida,
  type CantoMedido,
  type DadosMedicao,
  type Dmm,
  type FotoMedicao,
  type ParedeMedida,
  type PontoParede,
  type PosicaoMovel,
  type TipoPonto,
} from '@marcenaria/core';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { useImpressao } from '../components/Imprimir';
import { Aviso, Botao, Campo, CampoTexto, Carregando, Cartao } from '../components/ui';
import { INICIAL, mesmoFormulario, normalizarFormulario } from '../editor/formulario';
import { mensagemDeErro } from '../lib/erros';
import { apagarFotoLocal, apagarFotosDoServidor, apagarMedicao, fotoReduzida, guardarFotoLocal, lerFotoLocal, linkDaFoto, marcarFotoParaApagar, NOME_STATUS_MEDICAO } from '../lib/medicoes';
import { CampoMm } from '../medicao/CampoMm';
import { DesenhoParede } from '../medicao/DesenhoParede';
import { MiniaturaFoto } from '../medicao/FotoMedicao';
import { useMedicao, type Situacao } from '../medicao/useMedicao';

type Etapa = 'ambiente' | 'paredes' | 'esquadro' | 'pontos' | 'fotos' | 'revisao';
const ETAPAS: Array<{ id: Etapa; rotulo: string }> = [
  { id: 'ambiente', rotulo: 'Ambiente' },
  { id: 'paredes', rotulo: 'Paredes' },
  { id: 'esquadro', rotulo: 'Esquadro' },
  { id: 'pontos', rotulo: 'Pontos' },
  { id: 'fotos', rotulo: 'Fotos' },
  { id: 'revisao', rotulo: 'Revisão' },
];
const CHAVE_RASCUNHO = 'marcenaria:calculadora-modulo';
const TIPOS: TipoPonto[] = ['tomada', 'interruptor', 'agua', 'esgoto', 'gas', 'janela', 'porta', 'ar_condicionado', 'viga', 'pilar', 'rodape', 'outro'];
const COM_SALIENCIA: ReadonlySet<TipoPonto> = new Set(['agua', 'esgoto', 'gas', 'ar_condicionado', 'viga', 'pilar', 'rodape', 'outro']);
const LETRA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function SeloSituacao({ s, aoTentar }: { s: Situacao; aoTentar: () => void }) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium';
  switch (s.tipo) {
    case 'salvo':
      return <span className={`${base} bg-emerald-50 text-emerald-800`}>Salvo</span>;
    case 'salvando':
      return <span className={`${base} bg-stone-100 text-stone-700`}>Enviando…</span>;
    case 'sem_sinal':
      return <span className={`${base} bg-amber-100 text-amber-900`}>Sem sinal: guardado neste aparelho</span>;
    case 'erro':
      return (
        <button type="button" onClick={aoTentar} className={`${base} bg-red-50 text-red-800 underline`}>
          Não enviou · tentar de novo
        </button>
      );
    default:
      return null;
  }
}

/** Botões de foto: câmera (abre direto no celular) e galeria. */
function BotoesFoto({ aoEscolher, rotulo = 'Tirar foto' }: { aoEscolher: (f: File) => void; rotulo?: string }) {
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const receber = (e: React.ChangeEvent<HTMLInputElement>) => {
    for (const f of Array.from(e.target.files ?? [])) aoEscolher(f);
    e.target.value = '';
  };
  return (
    <span className="inline-flex flex-wrap gap-2">
      <Botao variante="secundario" onClick={() => camera.current?.click()}>
        {rotulo}
      </Botao>
      <Botao variante="discreto" onClick={() => galeria.current?.click()}>
        Da galeria
      </Botao>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={receber} />
      <input ref={galeria} type="file" accept="image/*" multiple className="hidden" onChange={receber} />
    </span>
  );
}

function Dica({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-950 ring-1 ring-sky-200">{children}</div>;
}

/** O triângulo do esquadro, para quem mede entender o que medir. */
function DesenhoEsquadro({ lado }: { lado: 'esquerdo' | 'direito' }) {
  const e = lado === 'esquerdo';
  return (
    <svg viewBox="0 0 120 90" className="h-24 w-32 shrink-0" aria-hidden>
      <rect x="0" y="0" width="120" height="90" fill="#fbf7f1" />
      <line x1={e ? 20 : 100} y1="15" x2={e ? 20 : 100} y2="85" stroke="#3b2416" strokeWidth="5" />
      <line x1={e ? 20 : 100} y1="15" x2={e ? 115 : 5} y2="15" stroke="#3b2416" strokeWidth="5" />
      <line x1={e ? 80 : 40} y1="15" x2={e ? 20 : 100} y2="70" stroke="#c2410c" strokeWidth="2" strokeDasharray="4 3" />
      <text x={e ? 50 : 70} y="11" fontSize="9" textAnchor="middle" fill="#57534e">
        na parede
      </text>
      <text x={e ? 26 : 94} y="82" fontSize="9" textAnchor={e ? 'start' : 'end'} fill="#57534e">
        vizinha
      </text>
      <text x={e ? 56 : 64} y="44" fontSize="9" textAnchor={e ? 'start' : 'end'} fill="#c2410c">
        diagonal
      </text>
    </svg>
  );
}

export function MedicaoDetalhe() {
  const { id = '' } = useParams();
  const { empresa } = useEmpresaAtual();
  const navegar = useNavigate();
  const { registro, situacao, mudar, mudarDados, sincronizar, resolver } = useMedicao(id);
  const [etapa, setEtapa] = useState<Etapa>('ambiente');
  const [paredeSel, setParedeSel] = useState<string | null>(null);
  const [pontoSel, setPontoSel] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const { imprimir, Area } = useImpressao();

  if (situacao.tipo === 'carregando' && !registro) return <Carregando texto="Abrindo a medição…" />;
  if (!registro) {
    return (
      <Aviso>
        {situacao.tipo === 'erro' ? situacao.mensagem : 'Medição não encontrada (ou ainda não chegou a este aparelho).'}{' '}
        <Link to="/medicoes" className="underline">
          Voltar
        </Link>
      </Aviso>
    );
  }

  const d = registro.dados;
  const parede = d.paredes.find((p) => p.id === paredeSel) ?? d.paredes[0]!;
  const mudarParede = (f: (p: ParedeMedida) => ParedeMedida) => mudarDados((x) => ({ ...x, paredes: x.paredes.map((p) => (p.id === parede.id ? f(p) : p)) }));
  const mudarPonto = (pid: string, f: (p: PontoParede) => PontoParede) => mudarParede((p) => ({ ...p, pontos: p.pontos.map((q) => (q.id === pid ? f(q) : q)) }));

  async function adicionarFoto(arquivo: File, ligacao: { parede: string | null; ponto: string | null; legenda: string }) {
    setErro(null);
    try {
      const blob = await fotoReduzida(arquivo);
      const fotoId = crypto.randomUUID();
      await guardarFotoLocal(fotoId, blob);
      mudarDados((x) => ({ ...x, fotos: [...x.fotos, { id: fotoId, caminho: null, ...ligacao }] }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível guardar a foto.');
    }
  }

  function removerFoto(f: FotoMedicao) {
    if (!window.confirm('Apagar esta foto?')) return;
    mudarDados((x) => ({ ...x, fotos: x.fotos.filter((y) => y.id !== f.id) }));
    void apagarFotoLocal(f.id);
    if (f.caminho) {
      const c = f.caminho;
      apagarFotosDoServidor([c]).catch(() => marcarFotoParaApagar(c));
    }
  }

  function adicionarParede() {
    const n = d.paredes.length;
    const nova = novaParede(crypto.randomUUID(), `Parede ${LETRA[n] ?? n + 1}`);
    mudarDados((x) => ({ ...x, paredes: [...x.paredes, nova] }));
    setParedeSel(nova.id);
  }

  function removerParede() {
    if (d.paredes.length <= 1) return;
    if (!window.confirm(`Apagar ${parede.nome} com as medidas e os pontos dela? As fotos ficam na medição.`)) return;
    mudarDados((x) => ({ ...x, paredes: x.paredes.filter((p) => p.id !== parede.id), fotos: x.fotos.map((f) => (f.parede === parede.id ? { ...f, parede: null, ponto: null } : f)) }));
    setParedeSel(null);
  }

  function adicionarPonto(tipo: TipoPonto) {
    const p: PontoParede = { id: crypto.randomUUID(), tipo, x: null, y: tipo === 'rodape' ? dmm(0) : null, largura: null, altura: null, saliencia: null, observacao: '' };
    mudarParede((w) => ({ ...w, pontos: [...w.pontos, p] }));
    setPontoSel(p.id);
  }

  async function apagarTudo() {
    if (!window.confirm('Apagar esta medição com todas as medidas e fotos? Não dá para desfazer.')) return;
    setOcupado(true);
    try {
      await apagarMedicao({ id: registro!.id, empresaId: registro!.empresaId, dados: d });
      navegar('/medicoes');
    } catch (e) {
      setErro(mensagemDeErro(e));
      setOcupado(false);
    }
  }

  const seletorParede = (
    <div className="mb-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Paredes">
      {d.paredes.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          aria-selected={p.id === parede.id}
          onClick={() => setParedeSel(p.id)}
          className={`min-h-10 rounded-full px-4 text-sm font-medium ring-1 ${p.id === parede.id ? 'bg-stone-900 text-white ring-stone-900' : 'bg-white text-stone-700 ring-stone-300'}`}
        >
          {p.nome}
        </button>
      ))}
      <Botao variante="discreto" onClick={adicionarParede}>
        + Outra parede
      </Botao>
    </div>
  );

  const analise = analisarParede(parede, d.profundidadeLivre);
  const indice = ETAPAS.findIndex((e) => e.id === etapa);

  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/medicoes" className="inline-flex min-h-11 items-center text-stone-500 hover:text-stone-900 lg:min-h-0">
          ← Medições
        </Link>
      </div>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{registro.titulo}</h1>
          <p className="text-sm text-stone-500">
            {NOME_STATUS_MEDICAO[registro.status]}
            {registro.endereco ? ` · ${registro.endereco}` : ''}
          </p>
        </div>
        <SeloSituacao s={situacao} aoTentar={() => void sincronizar()} />
      </header>

      {situacao.tipo === 'conflito' && (
        <div className="mb-4">
          <Aviso tipo="info">
            <p className="mb-2">Esta medição foi alterada em outro aparelho depois da versão que está aqui. Qual fica?</p>
            <div className="flex flex-wrap gap-2">
              <Botao variante="secundario" onClick={() => void resolver('minha')}>
                A deste aparelho
              </Botao>
              <Botao variante="secundario" onClick={() => void resolver('servidor')}>
                A do outro aparelho
              </Botao>
            </div>
          </Aviso>
        </div>
      )}
      {situacao.tipo === 'erro' && (
        <div className="mb-4">
          <Aviso>{situacao.mensagem}</Aviso>
        </div>
      )}
      {erro && (
        <div className="mb-4">
          <Aviso>{erro}</Aviso>
        </div>
      )}

      <nav aria-label="Etapas da medição" className="sticky top-14 z-20 -mx-4 mb-5 overflow-x-auto bg-[var(--fundo,#faf7f2)] px-4 py-2 lg:top-0">
        <ol className="flex min-w-max gap-1">
          {ETAPAS.map((e, k) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setEtapa(e.id)}
                aria-current={etapa === e.id ? 'step' : undefined}
                className={`min-h-10 rounded-full px-3.5 text-sm font-medium ring-1 ${etapa === e.id ? 'bg-amber-600 text-white ring-amber-700' : k < indice ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-white text-stone-600 ring-stone-300'}`}
              >
                {k + 1}. {e.rotulo}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {etapa === 'ambiente' && (
        <Cartao titulo="Ambiente" descricao="O que o cliente quer e quanto espaço há na frente da parede.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome da medição" value={registro.titulo} maxLength={160} onChange={(e) => mudar((r) => ({ ...r, titulo: e.target.value }))} />
            <Campo rotulo="Endereço" value={registro.endereco ?? ''} maxLength={300} onChange={(e) => mudar((r) => ({ ...r, endereco: e.target.value || null }))} />
            <Campo rotulo="Móvel que o cliente quer" value={d.movel} maxLength={200} placeholder="Roupeiro de 3 portas até o teto" onChange={(e) => mudarDados((x) => ({ ...x, movel: e.target.value }))} />
            <CampoMm
              rotulo="Profundidade livre"
              valor={d.profundidadeLivre}
              aoMudar={(v) => mudarDados((x) => ({ ...x, profundidadeLivre: v }))}
              ajuda="Da parede até onde o móvel pode chegar: a cama, a porta, a janela ou a passagem."
            />
            <div className="sm:col-span-2">
              <CampoTexto rotulo="Observações" value={d.observacoes} maxLength={2000} onChange={(e) => mudarDados((x) => ({ ...x, observacoes: e.target.value }))} placeholder="Acesso pela escada, piso de madeira, horário para instalar…" />
            </div>
          </div>
        </Cartao>
      )}

      {etapa === 'paredes' && (
        <Cartao titulo="Paredes" descricao="Uma parede por vez. Parede nunca é reta: por isso a largura vai em três alturas e a altura em três pontos.">
          {seletorParede}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <Dica>
                Largura de canto a canto, com a trena esticada e nivelada: perto do piso (acima do rodapé), no meio (uns 1,2 m) e perto do teto. Altura do piso ao teto (ou até a sanca, a viga ou o rebaixo), na esquerda, no meio e na direita.
              </Dica>
              <Campo rotulo="Nome da parede" value={parede.nome} maxLength={60} onChange={(e) => mudarParede((p) => ({ ...p, nome: e.target.value }))} />
              <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <legend className="mb-2 text-sm font-semibold text-stone-900">Largura</legend>
                <CampoMm rotulo="Perto do piso" valor={parede.larguras.baixo} aoMudar={(v) => mudarParede((p) => ({ ...p, larguras: { ...p.larguras, baixo: v } }))} />
                <CampoMm rotulo="No meio" valor={parede.larguras.meio} aoMudar={(v) => mudarParede((p) => ({ ...p, larguras: { ...p.larguras, meio: v } }))} />
                <CampoMm rotulo="Perto do teto" valor={parede.larguras.alto} aoMudar={(v) => mudarParede((p) => ({ ...p, larguras: { ...p.larguras, alto: v } }))} />
              </fieldset>
              <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <legend className="mb-2 text-sm font-semibold text-stone-900">Altura</legend>
                <CampoMm rotulo="Na esquerda" valor={parede.alturas.esquerda} aoMudar={(v) => mudarParede((p) => ({ ...p, alturas: { ...p.alturas, esquerda: v } }))} />
                <CampoMm rotulo="No meio" valor={parede.alturas.meio} aoMudar={(v) => mudarParede((p) => ({ ...p, alturas: { ...p.alturas, meio: v } }))} />
                <CampoMm rotulo="Na direita" valor={parede.alturas.direita} aoMudar={(v) => mudarParede((p) => ({ ...p, alturas: { ...p.alturas, direita: v } }))} />
              </fieldset>
              <CampoTexto rotulo="Observação desta parede" value={parede.observacao} maxLength={1000} onChange={(e) => mudarParede((p) => ({ ...p, observacao: e.target.value }))} />
              {d.paredes.length > 1 && (
                <Botao variante="perigo" onClick={removerParede}>
                  Apagar {parede.nome}
                </Botao>
              )}
            </div>
            <div className="space-y-3">
              <DesenhoParede parede={parede} largura={analise.larguraUtil} altura={analise.alturaUtil} />
              <ResumoParede analise={analise} />
            </div>
          </div>
        </Cartao>
      )}

      {etapa === 'esquadro' && (
        <Cartao titulo="Esquadro dos cantos" descricao="Canto fora de 90° muda a largura na frente do móvel. Meça os cantos onde o móvel encosta.">
          {seletorParede}
          <Dica>
            A partir do canto, marque uma medida na parede e outra na parede do lado (por exemplo 600 e 800 mm; quanto maiores, mais preciso). Meça a diagonal entre as duas marcas. Com o canto em 90°, a diagonal de 600 e 800 dá 1.000 mm.
          </Dica>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            {(['esquerdo', 'direito'] as const).map((lado) => {
              const chave = lado === 'esquerdo' ? 'cantoEsquerdo' : 'cantoDireito';
              const c = parede[chave];
              const set = (k: keyof CantoMedido, v: Dmm | null) => mudarParede((p) => ({ ...p, [chave]: { ...p[chave], [k]: v } }));
              const ang = anguloDoCanto(c);
              const r = analise.cantos.find((x) => x.lado === lado);
              return (
                <section key={lado} className="rounded-lg p-4 ring-1 ring-stone-200">
                  <div className="mb-3 flex items-center gap-3">
                    <DesenhoEsquadro lado={lado} />
                    <h3 className="text-base font-semibold">Canto {lado}</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <CampoMm rotulo="Na parede" valor={c.naParede} placeholder="600" aoMudar={(v) => set('naParede', v)} />
                    <CampoMm rotulo="Na vizinha" valor={c.naVizinha} placeholder="800" aoMudar={(v) => set('naVizinha', v)} />
                    <CampoMm rotulo="Diagonal" valor={c.diagonal} aoMudar={(v) => set('diagonal', v)} />
                  </div>
                  {c.naParede !== null && c.naVizinha !== null && (
                    <p className="mt-2 text-sm text-stone-600">Em esquadro, a diagonal daria {formatarMm(diagonalEsquadro(c.naParede, c.naVizinha))} mm.</p>
                  )}
                  {ang !== null && (
                    <p className="mt-1 text-sm font-medium">
                      Canto com {ang.toFixed(1).replace('.', ',')}°
                      {r?.diferencaNaFrente !== null && r?.diferencaNaFrente !== undefined && d.profundidadeLivre !== null && (
                        <span className="font-normal text-stone-600">
                          {' '}
                          · a {formatarMm(d.profundidadeLivre)} mm da parede:{' '}
                          {r.diferencaNaFrente > 0 ? `${formatarMm(r.diferencaNaFrente)} mm a menos` : r.diferencaNaFrente < 0 ? `${formatarMm(dmm(-r.diferencaNaFrente))} mm a mais` : 'sem diferença'}
                        </span>
                      )}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
          {d.profundidadeLivre === null && <p className="mt-3 text-sm text-stone-500">Informe a profundidade livre (etapa Ambiente) para ver quanto o canto muda na frente do móvel.</p>}
          <ListaProblemas analise={analise} codigos={['fora_de_esquadro', 'canto_invalido', 'canto_incompleto']} />
        </Cartao>
      )}

      {etapa === 'pontos' && (
        <Cartao titulo="Pontos na parede" descricao="Tudo o que pode ficar atrás do móvel ou no caminho dele. Medidas a partir da esquerda da parede e do piso.">
          {seletorParede}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0 lg:order-2">
              <DesenhoParede parede={parede} largura={analise.larguraUtil} altura={analise.alturaUtil} selecionado={pontoSel} aoSelecionar={setPontoSel} />
            </div>
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap gap-2">
                {TIPOS.map((t) => (
                  <button key={t} type="button" onClick={() => adicionarPonto(t)} className="min-h-10 rounded-full bg-white px-3 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">
                    + {NOME_PONTO[t]}
                  </button>
                ))}
              </div>
              {parede.pontos.length === 0 && <p className="text-sm text-stone-500">Nenhum ponto nesta parede. Toque num tipo acima para marcar.</p>}
              {parede.pontos.map((p, k) => {
                const pontual = PONTUAIS.has(p.tipo);
                const fotos = d.fotos.filter((f) => f.ponto === p.id);
                return (
                  <section key={p.id} className={`rounded-lg p-4 ring-1 ${pontoSel === p.id ? 'ring-2 ring-amber-500' : 'ring-stone-200'}`} onFocus={() => setPontoSel(p.id)}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="font-semibold">
                        {k + 1}. {NOME_PONTO[p.tipo]}
                      </h3>
                      <Botao variante="discreto" onClick={() => mudarParede((w) => ({ ...w, pontos: w.pontos.filter((q) => q.id !== p.id) }))}>
                        Remover
                      </Botao>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {p.tipo !== 'rodape' && (
                        <>
                          <CampoMm aceitaZero rotulo={pontual ? 'Da esquerda até o centro' : 'Da esquerda até a borda'} valor={p.x} aoMudar={(v) => mudarPonto(p.id, (q) => ({ ...q, x: v }))} />
                          <CampoMm aceitaZero rotulo={pontual ? 'Do piso até o centro' : 'Do piso até a borda de baixo'} valor={p.y} aoMudar={(v) => mudarPonto(p.id, (q) => ({ ...q, y: v }))} />
                        </>
                      )}
                      {!pontual && p.tipo !== 'rodape' && <CampoMm rotulo="Largura" valor={p.largura} aoMudar={(v) => mudarPonto(p.id, (q) => ({ ...q, largura: v }))} />}
                      {!pontual && <CampoMm rotulo="Altura" valor={p.altura} aoMudar={(v) => mudarPonto(p.id, (q) => ({ ...q, altura: v }))} ajuda={p.tipo === 'pilar' ? 'Vazio: até o teto.' : undefined} />}
                      {COM_SALIENCIA.has(p.tipo) && <CampoMm rotulo="Quanto sai da parede" valor={p.saliencia} aoMudar={(v) => mudarPonto(p.id, (q) => ({ ...q, saliencia: v }))} />}
                      <div className="sm:col-span-2">
                        <Campo rotulo="Observação" value={p.observacao} maxLength={300} onChange={(e) => mudarPonto(p.id, (q) => ({ ...q, observacao: e.target.value }))} />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {fotos.map((f) => (
                        <MiniaturaFoto key={f.id} foto={f} className="size-16" />
                      ))}
                      <BotoesFoto rotulo="Foto deste ponto" aoEscolher={(f) => void adicionarFoto(f, { parede: parede.id, ponto: p.id, legenda: `${parede.nome}: ${NOME_PONTO[p.tipo]}` })} />
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </Cartao>
      )}

      {etapa === 'fotos' && (
        <Cartao
          titulo="Fotos"
          descricao="Foto de cada parede inteira, de cada canto e dos pontos. Com a trena aberta aparecendo, a foto também confirma a medida."
          acoes={<BotoesFoto aoEscolher={(f) => void adicionarFoto(f, { parede: parede.id, ponto: null, legenda: parede.nome })} />}
        >
          {seletorParede}
          <p className="mb-3 text-xs text-stone-500">As fotos ficam guardadas no aparelho até subirem. Só a equipe da marcenaria vê; ninguém mais tem o link.</p>
          {d.fotos.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhuma foto ainda.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {d.fotos.map((f) => (
                <li key={f.id} className="space-y-1.5">
                  <MiniaturaFoto foto={f} className="h-32 w-full" />
                  <input
                    aria-label="Legenda da foto"
                    value={f.legenda}
                    maxLength={120}
                    onChange={(e) => mudarDados((x) => ({ ...x, fotos: x.fotos.map((y) => (y.id === f.id ? { ...y, legenda: e.target.value } : y)) }))}
                    className="block w-full rounded-md border-0 bg-white px-2 py-1.5 text-base ring-1 ring-stone-300 ring-inset sm:text-sm"
                  />
                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <span>{f.caminho ? 'Enviada' : 'No aparelho'}</span>
                    <button type="button" onClick={() => removerFoto(f)} className="min-h-10 px-1 text-red-700 underline lg:min-h-0">
                      Apagar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      )}

      {etapa === 'revisao' && (
        <Revisao
          d={d}
          seletorParede={seletorParede}
          parede={parede}
          concluida={registro.status === 'concluida'}
          aoStatus={(s) => mudar((r) => ({ ...r, status: s }))}
          aoImprimir={imprimir}
          aoApagar={apagarTudo}
          ocupado={ocupado}
          aoErro={setErro}
        />
      )}

      <div className="mt-6 flex justify-between gap-2">
        <Botao variante="secundario" onClick={() => setEtapa(ETAPAS[Math.max(0, indice - 1)]!.id)} disabled={indice === 0}>
          Voltar
        </Botao>
        {indice < ETAPAS.length - 1 && <Botao onClick={() => setEtapa(ETAPAS[indice + 1]!.id)}>Próxima: {ETAPAS[indice + 1]!.rotulo}</Botao>}
      </div>

      <Area>
        <FolhaMedicao titulo={registro.titulo} endereco={registro.endereco} d={d} />
      </Area>
    </>
  );
}

function ResumoParede({ analise }: { analise: ReturnType<typeof analisarParede> }) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-stone-500">Largura que vale (a menor)</dt>
          <dd className="tabular font-semibold">{textoMedida(analise.larguraUtil)} mm</dd>
        </div>
        <div>
          <dt className="text-stone-500">Varia</dt>
          <dd className="tabular">{textoMedida(analise.variacaoLargura)} mm</dd>
        </div>
        <div>
          <dt className="text-stone-500">Altura que vale (a menor)</dt>
          <dd className="tabular font-semibold">{textoMedida(analise.alturaUtil)} mm</dd>
        </div>
        <div>
          <dt className="text-stone-500">Varia</dt>
          <dd className="tabular">{textoMedida(analise.variacaoAltura)} mm</dd>
        </div>
      </dl>
      <ListaProblemas analise={analise} codigos={['fora_de_prumo', 'desnivel', 'largura_incompleta', 'sem_largura', 'sem_altura', 'ponto_fora']} />
    </>
  );
}

function ListaProblemas({ analise, codigos }: { analise: ReturnType<typeof analisarParede>; codigos?: string[] }) {
  const erros = analise.erros.filter((e) => !codigos || codigos.includes(e.codigo));
  const avisos = analise.avisos.filter((e) => !codigos || codigos.includes(e.codigo));
  if (!erros.length && !avisos.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {erros.length > 0 && (
        <Aviso>
          <ul className="list-inside list-disc space-y-1">
            {erros.map((e) => (
              <li key={e.mensagem}>{e.mensagem}</li>
            ))}
          </ul>
        </Aviso>
      )}
      {avisos.length > 0 && (
        <Aviso tipo="info">
          <ul className="list-inside list-disc space-y-1">
            {avisos.map((e) => (
              <li key={e.mensagem}>{e.mensagem}</li>
            ))}
          </ul>
        </Aviso>
      )}
    </div>
  );
}

/** Revisão: o que cabe, o que atrapalha, e para onde levar a medição. */
function Revisao({
  d,
  parede,
  seletorParede,
  concluida,
  aoStatus,
  aoImprimir,
  aoApagar,
  ocupado,
  aoErro,
}: {
  d: DadosMedicao;
  parede: ParedeMedida;
  seletorParede: ReactNode;
  concluida: boolean;
  aoStatus: (s: 'em_andamento' | 'concluida') => void;
  aoImprimir: () => void;
  aoApagar: () => void;
  ocupado: boolean;
  aoErro: (e: string | null) => void;
}) {
  const navegar = useNavigate();
  const [folgaLado, setFolgaLado] = useState<Dmm | null>(PADRAO_ANALISE.folgaLado);
  const [folgaTeto, setFolgaTeto] = useState<Dmm | null>(PADRAO_ANALISE.folgaTeto);
  const analise = analisarParede(parede, d.profundidadeLivre, { folgaLado: folgaLado ?? dmm(0), folgaTeto: folgaTeto ?? dmm(0) });
  const [movel, setMovel] = useState<Partial<Record<keyof PosicaoMovel, Dmm | null>>>({});
  const valor = (k: keyof PosicaoMovel): Dmm | null =>
    movel[k] !== undefined ? movel[k]! : k === 'x' ? (folgaLado ?? dmm(0)) : k === 'y' ? dmm(0) : (analise.maximo[k as 'L' | 'A' | 'P'] ?? null);
  const pos: PosicaoMovel | null = ['x', 'y', 'L', 'A', 'P'].every((k) => valor(k as keyof PosicaoMovel) !== null)
    ? { x: valor('x')!, y: valor('y')!, L: valor('L')!, A: valor('A')!, P: valor('P')! }
    : null;
  const lista = useMemo(() => (pos ? interferencias(parede, pos, analise.alturaUtil) : []), [parede, pos?.x, pos?.y, pos?.L, pos?.A, pos?.P, analise.alturaUtil]); // eslint-disable-line react-hooks/exhaustive-deps
  const fotosDaParede = d.fotos.filter((f) => f.parede === parede.id);
  const [fotoVisao, setFotoVisao] = useState<string>('');
  const [preparando, setPreparando] = useState(false);
  const largura = valor('L');
  const passou = largura !== null && analise.larguraNaFrente !== null && valor('x') !== null && valor('x')! + largura > analise.larguraNaFrente;

  function abrirNoEditor() {
    if (valor('L') === null || valor('A') === null || valor('P') === null) {
      aoErro('Faltam largura, altura ou profundidade do móvel.');
      return;
    }
    try {
      const atual = localStorage.getItem(CHAVE_RASCUNHO);
      if (atual && !mesmoFormulario(normalizarFormulario(JSON.parse(atual)), INICIAL) && !window.confirm('Isto substitui o rascunho que está no editor. Continuar?')) return;
      localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ ...INICIAL, L: formatarMm(valor('L')!), A: formatarMm(valor('A')!), P: formatarMm(valor('P')!) }));
    } catch {
      aoErro('Este navegador não deixa guardar o rascunho. Libere o armazenamento do site e tente de novo.');
      return;
    }
    navegar('/modulo');
  }

  async function abrirNaVisao() {
    const f = d.fotos.find((x) => x.id === (fotoVisao || fotosDaParede[0]?.id));
    if (!f) {
      aoErro('Tire uma foto da parede inteira (etapa Fotos) para a Visão IA ler.');
      return;
    }
    setPreparando(true);
    aoErro(null);
    try {
      const foto = (await lerFotoLocal(f.id)) ?? (f.caminho ? await (await fetch(await linkDaFoto(f.caminho))).blob() : null);
      if (!foto) throw new Error('A foto ainda não chegou a este aparelho.');
      navegar('/visao', {
        state: {
          daMedicao: {
            foto,
            L: valor('L') === null ? '' : formatarMm(valor('L')!),
            A: valor('A') === null ? '' : formatarMm(valor('A')!),
            P: valor('P') === null ? '' : formatarMm(valor('P')!),
            nota: notaParaVisao(d, parede, analise),
          },
        },
      });
    } catch (e) {
      aoErro(mensagemDeErro(e));
      setPreparando(false);
    }
  }

  return (
    <div className="space-y-6">
      <Cartao titulo="Revisão" descricao="O maior móvel que cabe, já com as folgas, e o que fica atrás dele ou no caminho.">
        {seletorParede}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <ResumoParede analise={analise} />
            <ListaProblemas analise={analise} codigos={['fora_de_esquadro', 'canto_invalido']} />
            <div className="grid grid-cols-2 items-end gap-3">
              <CampoMm aceitaZero rotulo="Folga de cada lado" valor={folgaLado} aoMudar={setFolgaLado} />
              <CampoMm aceitaZero rotulo="Folga até o teto" valor={folgaTeto} aoMudar={setFolgaTeto} />
            </div>
            <div className="rounded-lg bg-amber-50 p-3 text-sm ring-1 ring-amber-200">
              <p className="font-medium text-amber-950">Maior móvel que cabe nesta parede</p>
              <p className="tabular mt-1 text-amber-950">
                {textoMedida(analise.maximo.L)} × {textoMedida(analise.maximo.A)} × {textoMedida(analise.maximo.P)} mm <span className="text-amber-800">(largura × altura × profundidade)</span>
              </p>
              {analise.larguraNaFrente !== null && analise.larguraUtil !== null && analise.larguraNaFrente !== analise.larguraUtil && (
                <p className="mt-1 text-xs text-amber-900">Pela frente, por causa do canto, cabem {formatarMm(analise.larguraNaFrente)} mm, e não {formatarMm(analise.larguraUtil)}.</p>
              )}
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-stone-900">O móvel nesta parede</legend>
              <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3">
                <CampoMm rotulo="Largura" valor={valor('L')} aoMudar={(v) => setMovel((m) => ({ ...m, L: v }))} />
                <CampoMm rotulo="Altura" valor={valor('A')} aoMudar={(v) => setMovel((m) => ({ ...m, A: v }))} />
                <CampoMm rotulo="Profundidade" valor={valor('P')} aoMudar={(v) => setMovel((m) => ({ ...m, P: v }))} />
                <CampoMm aceitaZero rotulo="Da esquerda" valor={valor('x')} aoMudar={(v) => setMovel((m) => ({ ...m, x: v }))} />
                <CampoMm aceitaZero rotulo="Do piso" valor={valor('y')} aoMudar={(v) => setMovel((m) => ({ ...m, y: v }))} ajuda="Aéreo: altura da base." />
              </div>
            </fieldset>
            {passou && <Aviso>O móvel passa da largura que cabe na frente ({formatarMm(analise.larguraNaFrente!)} mm).</Aviso>}
          </div>
          <div className="min-w-0 space-y-3">
            <DesenhoParede parede={parede} largura={analise.larguraUtil} altura={analise.alturaUtil} movel={pos} interferencias={lista} />
            {lista.length === 0 ? (
              pos && <p className="text-sm text-emerald-800">Nada marcado atrás do móvel ou no caminho dele.</p>
            ) : (
              <Aviso tipo="info">
                <ul className="list-inside list-disc space-y-1">
                  {lista.map((i) => (
                    <li key={i.ponto}>{i.mensagem}</li>
                  ))}
                </ul>
              </Aviso>
            )}
          </div>
        </div>
      </Cartao>

      <Cartao titulo="Levar adiante">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm text-stone-600">Abre o editor com a largura, a altura e a profundidade acima. Depois é só escolher divisões, portas e gavetas.</p>
            <Botao onClick={abrirNoEditor}>Abrir no editor</Botao>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-stone-600">A Visão IA lê a foto da parede com estas medidas e o que foi marcado nela, e monta uma proposta de móvel.</p>
            {fotosDaParede.length > 1 && (
              <select aria-label="Foto para a Visão IA" value={fotoVisao} onChange={(e) => setFotoVisao(e.target.value)} className="block w-full rounded-lg border-0 bg-white px-3 py-2 text-base ring-1 ring-stone-300 ring-inset sm:text-sm">
                {fotosDaParede.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.legenda || 'Foto'}
                  </option>
                ))}
              </select>
            )}
            <Botao variante="secundario" onClick={() => void abrirNaVisao()} carregando={preparando}>
              Analisar com a Visão IA
            </Botao>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2 border-t border-stone-200 pt-4">
          <Botao variante="secundario" onClick={() => aoStatus(concluida ? 'em_andamento' : 'concluida')}>
            {concluida ? 'Reabrir a medição' : 'Marcar como concluída'}
          </Botao>
          <Botao variante="secundario" onClick={aoImprimir}>
            Imprimir / PDF
          </Botao>
          <Botao variante="perigo" onClick={aoApagar} carregando={ocupado}>
            Apagar medição
          </Botao>
        </div>
      </Cartao>
    </div>
  );
}

/** Folha impressa: medidas e desenho de cada parede, avisos e fotos. */
function FolhaMedicao({ titulo, endereco, d }: { titulo: string; endereco: string | null; d: DadosMedicao }) {
  return (
    <div className="text-sm">
      <h1 className="text-lg font-semibold">Medição · {titulo}</h1>
      <p className="mb-3 text-xs">
        {endereco ?? ''}
        {d.movel ? ` · ${d.movel}` : ''}
        {d.profundidadeLivre !== null ? ` · profundidade livre ${formatarMm(d.profundidadeLivre)} mm` : ''}
      </p>
      {d.observacoes && <p className="mb-3 whitespace-pre-line">{d.observacoes}</p>}
      {d.paredes.map((p) => {
        const a = analisarParede(p, d.profundidadeLivre);
        return (
          <figure key={p.id} className="mb-6">
            <h2 className="mb-1 font-semibold">{p.nome}</h2>
            <div className="grid grid-cols-2 gap-4">
              <DesenhoParede parede={p} largura={a.larguraUtil} altura={a.alturaUtil} />
              <div>
                <p>
                  Larguras (piso, meio, teto): {textoMedida(p.larguras.baixo)} / {textoMedida(p.larguras.meio)} / {textoMedida(p.larguras.alto)} mm
                </p>
                <p>
                  Alturas (esquerda, meio, direita): {textoMedida(p.alturas.esquerda)} / {textoMedida(p.alturas.meio)} / {textoMedida(p.alturas.direita)} mm
                </p>
                {a.cantos.map((c) => (
                  <p key={c.lado}>
                    Canto {c.lado}: {c.angulo.toFixed(1).replace('.', ',')}°
                  </p>
                ))}
                <p className="font-medium">
                  Maior móvel: {textoMedida(a.maximo.L)} × {textoMedida(a.maximo.A)} × {textoMedida(a.maximo.P)} mm
                </p>
                <ul className="mt-1 list-inside list-disc">
                  {p.pontos.map((q) => (
                    <li key={q.id}>
                      {NOME_PONTO[q.tipo]}
                      {q.x !== null && q.tipo !== 'rodape' ? `: ${formatarMm(q.x)} da esquerda` : ''}
                      {q.y !== null && q.tipo !== 'rodape' ? `, ${formatarMm(q.y)} do piso` : ''}
                      {q.largura !== null ? `, ${formatarMm(q.largura)} de largura` : ''}
                      {q.altura !== null ? `, ${formatarMm(q.altura)} de altura` : ''}
                      {q.saliencia !== null ? `, sai ${formatarMm(q.saliencia)}` : ''}
                      {q.observacao ? ` · ${q.observacao}` : ''}
                    </li>
                  ))}
                </ul>
                {[...a.erros, ...a.avisos].map((x) => (
                  <p key={x.mensagem} className="mt-1 text-xs">
                    {x.mensagem}
                  </p>
                ))}
              </div>
            </div>
          </figure>
        );
      })}
      {d.fotos.length > 0 && (
        <figure>
          <h2 className="mb-2 font-semibold">Fotos</h2>
          <div className="grid grid-cols-3 gap-3">
            {d.fotos.map((f) => (
              <div key={f.id}>
                <MiniaturaFoto foto={f} className="h-40 w-full" />
                <p className="text-xs">{f.legenda}</p>
              </div>
            ))}
          </div>
        </figure>
      )}
    </div>
  );
}
