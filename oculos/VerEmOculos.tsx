import { useEffect, useRef, useState } from 'react';
import type { CenaImersiva } from '@marcenaria/core';
import { Aviso, Botao } from '../components/ui';
import { pedirSensores } from './sensores';

type Suporte = { ar: boolean; vr: boolean } | null;

/**
 * Parte da página pública do móvel: abre a cena nos óculos de realidade
 * virtual e mista (WebXR) ou na tela dividida dos óculos de encaixar o celular.
 * O código 3D dos óculos só é baixado quando alguém usa.
 */
export function VerEmOculos({ cena }: { cena: CenaImersiva | null | undefined }) {
  const [suporte, setSuporte] = useState<Suporte>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nosOculos, setNosOculos] = useState(false);
  const [telaDividida, setTelaDividida] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const fecharTela = useRef<(() => void) | null>(null);
  const modulo = useRef<typeof import('./xr') | null>(null);

  useEffect(() => {
    let vivo = true;
    import('./xr')
      .then(async (m) => {
        modulo.current = m;
        const s = await m.suporteXR();
        if (vivo) setSuporte(s);
      })
      .catch(() => vivo && setSuporte({ ar: false, vr: false }));
    return () => {
      vivo = false;
    };
  }, []);

  // Fecha a tela dividida se a pessoa sair da página.
  useEffect(() => () => fecharTela.current?.(), []);

  if (cena === undefined) return null; // ainda carregando
  if (cena === null) {
    return (
      <section className="mt-8" aria-labelledby="titulo-oculos">
        <h2 id="titulo-oculos" className="text-lg font-semibold text-stone-900">Ver com óculos</h2>
        <p className="mt-1 text-sm text-stone-600">Este link foi criado antes do modo para óculos. Peça um link novo à marcenaria para ver com óculos de realidade virtual.</p>
      </section>
    );
  }

  function entrar(modo: 'ar' | 'vr') {
    setErro(null);
    const m = modulo.current;
    if (!m || !cena) return;
    setNosOculos(true);
    // Chamado direto no clique: o navegador só abre os óculos a partir de um gesto.
    m.entrarNosOculos(modo, cena, (e) => {
      setNosOculos(false);
      if (e) setErro(e);
    });
  }

  async function abrirTela() {
    setErro(null);
    if (!cena) return;
    // iPhone: a licença dos sensores precisa ser pedida já no toque, antes de qualquer espera.
    const licenca = pedirSensores();
    const { abrirTelaDividida } = await import('./telaDividida');
    if (!(await licenca)) setErro('Sem acesso ao giro do celular: arraste com o dedo para olhar em volta. Para usar no óculos, libere "Movimento e orientação" para este site nos ajustes do navegador.');
    setTelaDividida(true);
    // Espera o React mostrar a área de tela cheia.
    requestAnimationFrame(() => {
      const alvo = area.current;
      if (!alvo) return;
      alvo.requestFullscreen?.().catch(() => undefined);
      const orientacao = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      orientacao?.lock?.('landscape').catch(() => undefined);
      fecharTela.current = abrirTelaDividida(alvo, cena, () => {
        fecharTela.current = null;
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        setTelaDividida(false);
      });
    });
  }

  const temComodo = !!cena.comodo;
  return (
    <section className="mt-8" aria-labelledby="titulo-oculos">
      <h2 id="titulo-oculos" className="text-lg font-semibold text-stone-900">Ver com óculos</h2>
      <p className="mt-1 text-sm text-stone-600">
        {temComodo ? 'O móvel no cômodo medido pela marcenaria, em tamanho real.' : 'O móvel em tamanho real.'} Aponte para uma porta ou gaveta para abrir; no menu ao lado do móvel dá para trocar as cores.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {suporte?.ar && (
          <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
            <h3 className="text-sm font-semibold text-stone-900">Na minha sala</h3>
            <p className="mt-1 text-sm text-stone-600">Você vê a sua sala de verdade e coloca o móvel no chão ou encostado na parede.</p>
            <Botao className="mt-3 w-full" onClick={() => entrar('ar')} disabled={nosOculos}>
              Ver na minha sala
            </Botao>
          </div>
        )}
        {suporte?.vr && (
          <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
            <h3 className="text-sm font-semibold text-stone-900">{temComodo ? 'Entrar no cômodo' : 'Realidade virtual'}</h3>
            <p className="mt-1 text-sm text-stone-600">{temComodo ? 'Paredes, janelas e tomadas como foram medidas, com o móvel no lugar.' : 'O móvel num ambiente neutro, para andar em volta.'}</p>
            <Botao className="mt-3 w-full" variante={suporte.ar ? 'secundario' : 'primario'} onClick={() => entrar('vr')} disabled={nosOculos}>
              {temComodo ? 'Entrar no cômodo' : 'Entrar'}
            </Botao>
          </div>
        )}
        <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
          <h3 className="text-sm font-semibold text-stone-900">Óculos de encaixar o celular</h3>
          <p className="mt-1 text-sm text-stone-600">Para VR Box e similares. Deite o celular, encaixe no óculos e olhe fixo para o que quer abrir.</p>
          <Botao className="mt-3 w-full" variante="secundario" onClick={abrirTela}>
            Abrir tela dividida
          </Botao>
        </div>
      </div>
      {suporte && !suporte.ar && !suporte.vr && (
        <p className="mt-3 text-sm text-stone-600">Tem óculos Meta Quest, Galaxy XR ou Apple Vision Pro? Abra este mesmo link no navegador dos óculos.</p>
      )}
      {nosOculos && <p className="mt-3 text-sm text-stone-600" role="status">Abrindo nos óculos…</p>}
      {erro && (
        <div className="mt-3">
          <Aviso>{erro}</Aviso>
        </div>
      )}

      {telaDividida && (
        <div ref={area} className="fixed inset-0 z-50 bg-black" role="dialog" aria-label="Tela dividida para óculos de celular">
          <button
            type="button"
            onClick={() => fecharTela.current?.()}
            className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/40"
          >
            Sair
          </button>
        </div>
      )}
    </section>
  );
}
