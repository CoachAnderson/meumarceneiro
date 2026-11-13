import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Edges, OrbitControls } from '@react-three/drei';
import type { Group } from 'three';
import { envelope, type Caixa, type Componente, type MarcaMontagem } from '@marcenaria/core';
import { ESTILO } from '../editor/estilo';
import { COR_MARCA } from './VistaIsometrica';

/** Décimos de mm → metros. */
const M = 1 / 10000;
type Vec3 = [number, number, number];

const centro = (k: Caixa, o: Vec3): Vec3 => [(k.x + k.dx / 2) * M - o[0], (k.y + k.dy / 2) * M - o[1], -(k.z + k.dz / 2) * M - o[2]];
const tamanho = (k: Caixa): Vec3 => [k.dx * M, k.dy * M, k.dz * M];
const NOVA = { fill: '#fbbf24', stroke: '#92400e' };
const DURACAO = 0.9;

/** Peça nova: entra de fora para o lugar dela. */
function Entrando({ de, chave, children }: { de: Vec3; chave: string; children: React.ReactNode }) {
  const g = useRef<Group>(null);
  const t = useRef(0);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    t.current = 0;
    invalidate();
  }, [chave, invalidate]);
  useFrame((_, dt) => {
    if (!g.current || t.current >= 1) return;
    t.current = Math.min(1, t.current + dt / DURACAO);
    const k = 1 - Math.pow(1 - t.current, 3);
    g.current.position.set(de[0] * (1 - k), de[1] * (1 - k), de[2] * (1 - k));
    invalidate();
  });
  return (
    <group ref={g} position={de}>
      {children}
    </group>
  );
}

/** Tela estreita (celular em pé) mostra menos largura: afasta a câmera. */
function Enquadrar({ raio }: { raio: number }) {
  const { camera, invalidate, size } = useThree();
  useEffect(() => {
    const f = size.width < size.height * 1.15 ? 1.3 : 1;
    camera.position.set(raio * 0.85 * f, raio * 0.6 * f, raio * 1.8 * f);
    camera.lookAt(0, 0, 0);
    invalidate();
  }, [camera, invalidate, raio, size.width, size.height]);
  return null;
}

/**
 * 3D do manual e da oficina: peças montadas, as novas em destaque (entrando
 * no lugar) e as marcas das ferragens, sempre visíveis.
 */
export default function Cena3D({
  componentes,
  montadas,
  novas,
  marcas = [],
  contexto = false,
  chave,
  rotulo,
  altura = 'h-[22rem] sm:h-[26rem]',
}: {
  componentes: readonly Componente[];
  montadas: ReadonlySet<string>;
  novas: ReadonlySet<string>;
  marcas?: readonly MarcaMontagem[];
  /** Mostra as outras peças, bem claras. */
  contexto?: boolean;
  /** Muda a cada passo: reinicia a animação. */
  chave: string;
  rotulo: string;
  altura?: string;
}) {
  const env = useMemo(() => envelope([...componentes]), [componentes]);
  const origem: Vec3 = [(env.x + env.dx / 2) * M, (env.y + env.dy / 2) * M, -(env.z + env.dz / 2) * M];
  const raio = Math.max(env.dx, env.dy, env.dz) * M;
  const bolinha = Math.max(raio / 90, 0.004);

  return (
    <div className={`relative overflow-hidden rounded-lg bg-gradient-to-b from-stone-100 to-stone-200 ${altura}`}>
      <Canvas frameloop="demand" dpr={[1, 2]} camera={{ position: [raio * 0.85, raio * 0.6, raio * 1.8], fov: 40, near: 0.01, far: 100 }} aria-label={rotulo}>
        <Enquadrar raio={raio} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[3, 5, 4]} intensity={1.5} />
        <directionalLight position={[-4, 2, -3]} intensity={0.4} />
        {componentes.map((c) => {
          const nova = novas.has(c.id);
          const no = montadas.has(c.id) || nova;
          if (!no && !contexto) return null;
          const p = centro(c.caixa, origem);
          const cor = nova ? NOVA : ESTILO[c.papel];
          const malha = (
            <mesh position={p} renderOrder={no ? 1 : 0}>
              <boxGeometry args={tamanho(c.caixa)} />
              <meshStandardMaterial color={cor.fill} transparent={!no} opacity={no ? 1 : 0.14} depthWrite={no} roughness={0.85} />
              <Edges color={cor.stroke} transparent={!no} opacity={no ? 1 : 0.25} />
            </mesh>
          );
          if (!nova) return <group key={c.id}>{malha}</group>;
          // De onde vem: para fora do centro do móvel, na direção da peça.
          const n = Math.hypot(p[0], p[1], p[2]) || 1;
          const de: Vec3 = [(p[0] / n) * raio * 0.45, (p[1] / n) * raio * 0.45, (p[2] / n) * raio * 0.45];
          return (
            <Entrando key={c.id} de={de} chave={chave}>
              {malha}
            </Entrando>
          );
        })}
        {marcas.map((m, i) => (
          <mesh key={i} position={[m.ponto.x * M - origem[0], m.ponto.y * M - origem[1], -m.ponto.z * M - origem[2]]} renderOrder={5}>
            <sphereGeometry args={[bolinha, 12, 8]} />
            <meshBasicMaterial color={COR_MARCA[m.tipo]} depthTest={false} transparent />
          </mesh>
        ))}
        <OrbitControls makeDefault enableDamping={false} minDistance={raio * 0.4} maxDistance={raio * 6} />
      </Canvas>
      <p className="pointer-events-none absolute right-2 bottom-2 rounded bg-white/85 px-2 py-0.5 text-[11px] text-stone-600">Arraste para girar · pince ou role para aproximar</p>
    </div>
  );
}
