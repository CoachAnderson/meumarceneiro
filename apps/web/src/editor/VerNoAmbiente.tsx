import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import type { Componente } from '@marcenaria/core';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao } from '../components/ui';
import { publicarModelo } from '../lib/ar';
import { baixarBytes } from '../lib/exportar';

/** Código QR como caminho SVG (sem imagem externa). */
export function CodigoQR({ texto, tamanho = 176 }: { texto: string; tamanho?: number }) {
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

/** Publica o móvel em 3D e mostra o link para abrir na câmera do celular. */
export function VerNoAmbiente({ componentes, nome, titulo }: { componentes: Componente[]; nome: string; titulo: string }) {
  const { empresa } = useEmpresaAtual();
  const [estado, setEstado] = useState<'parado' | 'gerando'>('parado');
  const [link, setLink] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function gerar() {
    setEstado('gerando');
    setErro(null);
    setLink(null);
    setCopiado(false);
    try {
      // O exportador 3D só é baixado quando alguém usa.
      const { gerarGlb, gerarUsdz } = await import('./ambiente3d');
      const [glb, usdz] = await Promise.all([gerarGlb(componentes, nome), gerarUsdz(componentes, nome)]);
      setLink(await publicarModelo(empresa.id, titulo, { glb, usdz }));
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
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-stone-900">Ver no ambiente</h3>
          <p className="text-sm text-stone-600">O móvel aparece em tamanho real pela câmera do celular, no lugar onde vai ficar. Serve para mostrar ao cliente, não para tirar medidas.</p>
        </div>
        <Botao onClick={gerar} carregando={estado === 'gerando'}>
          {link ? 'Gerar de novo' : 'Gerar link'}
        </Botao>
        <Botao variante="discreto" onClick={baixar} disabled={estado === 'gerando'}>
          Baixar 3D (GLB)
        </Botao>
      </div>
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
            <p className="text-stone-700">Aponte a câmera do celular para o código, ou envie o link. Quem recebe abre sem precisar de conta. Este link mostra o móvel como está agora; se mudar o projeto, gere outro.</p>
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
