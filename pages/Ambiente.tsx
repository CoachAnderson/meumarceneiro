import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Marca } from '../components/Marca';
import { Aviso } from '../components/ui';
import { CodigoQR } from '../editor/VerNoAmbiente';
import { aparelho, buscarCenaOculos, enderecosDoModelo, idValido, linkAndroid, linkIos } from '../lib/ar';
import type { CenaImersiva } from '@marcenaria/core';
import { VerEmOculos } from '../oculos/VerEmOculos';
import { abrirMarceneiro, perguntarPeloLink, type AberturaMarceneiro } from '../lib/marceneiro';
import { ConversaMarceneiro } from '../marceneiro/Conversa';

const mmTexto = (metros: number) => Math.round(metros * 1000).toLocaleString('pt-BR');

/** Afasta a câmera o bastante para o móvel inteiro caber, qualquer que seja o tamanho. */
function Enquadrar({ tamanho }: { tamanho: Vector3 }) {
  const { camera, invalidate, size } = useThree();
  useEffect(() => {
    const maior = Math.max(tamanho.x, tamanho.y, tamanho.z);
    // Tela em pé (celular) mostra menos largura: afasta mais.
    const d = maior * (size.width < size.height ? 2.9 : 2.1);
    camera.position.set(d * 0.42, d * 0.24, d * 0.88);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, size.width, size.height, tamanho.x, tamanho.y, tamanho.z]);
  return null;
}

function Modelo({ url, aoMedir }: { url: string; aoMedir: (t: Vector3) => void }) {
  const gltf = useLoader(GLTFLoader, url);
  // Mede uma vez, com o móvel na posição do arquivo (no chão, costas na origem).
  const { tamanho, meio } = useMemo(() => {
    gltf.scene.position.set(0, 0, 0);
    gltf.scene.updateMatrixWorld(true);
    const caixa = new Box3().setFromObject(gltf.scene);
    return { tamanho: caixa.getSize(new Vector3()), meio: caixa.getCenter(new Vector3()) };
  }, [gltf.scene]);
  useEffect(() => aoMedir(tamanho), [tamanho]); // eslint-disable-line react-hooks/exhaustive-deps
  // Na tela, centraliza na origem para girar em torno do meio.
  return <primitive object={gltf.scene} position={[-meio.x, -meio.y, -meio.z]} />;
}

/** Página pública: mostra o móvel e abre a câmera do celular para vê-lo no ambiente. */
export function Ambiente() {
  const { empresa, id } = useParams();
  const [params] = useSearchParams();
  const titulo = (params.get('n') ?? '').slice(0, 60);
  const semVisualizador = params.get('sem-ar') === '1';
  const valido = idValido(empresa) && idValido(id);
  const [existe, setExiste] = useState<boolean | null>(null);
  const [tamanho, setTamanho] = useState<Vector3 | null>(null);
  const [marceneiro, setMarceneiro] = useState<AberturaMarceneiro | null>(null);
  const [cenaOculos, setCenaOculos] = useState<CenaImersiva | null | undefined>(undefined);
  const enderecos = valido ? enderecosDoModelo(empresa, id) : null;
  const tipo = aparelho();

  useEffect(() => {
    if (!enderecos) return;
    let vivo = true;
    fetch(enderecos.glb, { method: 'HEAD' })
      .then((r) => vivo && setExiste(r.ok))
      .catch(() => vivo && setExiste(false));
    return () => {
      vivo = false;
    };
  }, [enderecos?.glb]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enderecos || !existe) return;
    let vivo = true;
    buscarCenaOculos(enderecos.cena).then((c) => vivo && setCenaOculos(c));
    return () => {
      vivo = false;
    };
  }, [enderecos?.cena, existe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Marceneiro virtual: só aparece se a marcenaria incluiu no link (e ele ainda vale).
  useEffect(() => {
    if (!valido || !empresa || !id) return;
    let vivo = true;
    abrirMarceneiro(empresa, id).then((m) => vivo && setMarceneiro(m));
    return () => {
      vivo = false;
    };
  }, [valido, empresa, id]);

  const paraAndroid = (glb: string, voltar: string): string | null => {
    try {
      return linkAndroid(glb, titulo, voltar);
    } catch {
      return null; // arquivo fora de https (só acontece em ambiente de desenvolvimento)
    }
  };
  const pagina = `${window.location.origin}${window.location.pathname}${titulo ? `?n=${encodeURIComponent(titulo)}` : ''}`;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
          <Marca />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{titulo || 'Móvel em 3D'}</h1>
        {tamanho && (
          <p className="tabular mt-1 text-sm text-stone-600">
            Largura {mmTexto(tamanho.x)} mm · altura {mmTexto(tamanho.y)} mm · profundidade {mmTexto(tamanho.z)} mm
          </p>
        )}

        {!valido || existe === false ? (
          <div className="mt-6">
            <Aviso>Este link não está mais disponível. Peça um novo à marcenaria.</Aviso>
          </div>
        ) : (
          <>
            <div className="mt-5 h-[22rem] overflow-hidden rounded-xl bg-gradient-to-b from-stone-100 to-stone-200 ring-1 ring-stone-200 sm:h-[26rem]">
              {existe && enderecos && (
                <Canvas frameloop="demand" dpr={[1, 2]} camera={{ position: [0.9, 0.5, 1.9], fov: 40, near: 0.01, far: 100 }} aria-label="Modelo 3D do móvel. Arraste para girar.">
                  <ambientLight intensity={0.9} />
                  <directionalLight position={[3, 5, 4]} intensity={1.6} />
                  <directionalLight position={[-4, 2, -3]} intensity={0.4} />
                  <Suspense fallback={null}>
                    <Modelo url={enderecos.glb} aoMedir={setTamanho} />
                  </Suspense>
                  {tamanho && <Enquadrar tamanho={tamanho} />}
                  <OrbitControls makeDefault enablePan={false} />
                </Canvas>
              )}
            </div>

            <div className="mt-6">
              {semVisualizador && (
                <div className="mb-4">
                  <Aviso>Este aparelho não abriu o visualizador de realidade aumentada. Atualize o aplicativo Google e o "Google Play Services para RA", ou tente em outro celular.</Aviso>
                </div>
              )}
              {existe && enderecos && tipo === 'ios' && (
                // O iPhone só abre direto na câmera quando o link tem rel="ar" e uma imagem como único conteúdo.
                <a rel="ar" href={linkIos(enderecos.usdz)} className="block max-w-sm">
                  <img src="/ar-botao.svg" alt="Ver no meu ambiente" className="w-full" />
                </a>
              )}
              {existe && enderecos && tipo === 'android' && (() => {
                const destino = paraAndroid(enderecos.glb, `${pagina}${pagina.includes('?') ? '&' : '?'}sem-ar=1`);
                return destino ? (
                  <a href={destino} className="block max-w-sm">
                    <img src="/ar-botao.svg" alt="Ver no meu ambiente" className="w-full" />
                  </a>
                ) : (
                  <Aviso>Não foi possível preparar o link da câmera neste endereço.</Aviso>
                );
              })()}
              {existe && tipo === 'outro' && (
                <div className="flex flex-wrap items-center gap-5">
                  <div className="rounded-lg bg-white p-2 ring-1 ring-stone-200">
                    <CodigoQR texto={pagina} />
                  </div>
                  <p className="min-w-0 flex-1 text-sm text-stone-700">Para ver o móvel no seu ambiente, aponte a câmera do celular para este código. Aqui no computador você pode girar o modelo com o mouse.</p>
                </div>
              )}
              {tipo !== 'outro' && (
                <p className="mt-4 text-sm text-stone-600">
                  Toque no botão, aponte a câmera para o chão e mova o celular devagar até o móvel aparecer. Ele vem em tamanho real; arraste para encostar na parede. A posição é aproximada: serve para ter ideia do espaço, não para medir.
                </p>
              )}
            </div>

            {existe && <VerEmOculos cena={cenaOculos} />}

            {existe && marceneiro && empresa && id && (
              <section className="mt-8" aria-labelledby="titulo-marceneiro">
                <h2 id="titulo-marceneiro" className="mb-3 text-lg font-semibold text-stone-900">
                  Tire suas dúvidas sobre o móvel
                </h2>
                <ConversaMarceneiro
                  modo="link"
                  nome={marceneiro.nome}
                  saudacao={marceneiro.saudacao}
                  tituloMovel={titulo}
                  restantesIniciais={marceneiro.restantes}
                  sugestoes={['Quais são as medidas?', 'Qual o material?', ...(marceneiro.temPreco ? ['Quanto custa?'] : []), 'Cabe uma maior?']}
                  perguntar={(pergunta, historico) => perguntarPeloLink({ empresaId: empresa, apresentacaoId: id, pergunta, historico })}
                />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
