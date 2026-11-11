import { useMemo, useState } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Edges, OrbitControls } from '@react-three/drei';
import { envelope, facesDasBordas, type Caixa, type Componente, type Peca } from '@marcenaria/core';
import { COR_FITA, COR_SELECAO, ESTILO, PAPEIS_FRENTE } from './estilo';

/** Décimos de mm → metros (unidade da cena). */
const M = 1 / 10000;
/** Espessura com que a fita aparece no desenho (só visual): 1,5 mm. */
const FITA_VISUAL = 15;

type Vec3 = [number, number, number];

/** Centro da caixa na cena: y para cima, z da cena aponta para quem olha. */
function centro(k: Caixa, origem: Vec3): Vec3 {
  return [(k.x + k.dx / 2) * M - origem[0], (k.y + k.dy / 2) * M - origem[1], -(k.z + k.dz / 2) * M - origem[2]];
}

const tamanho = (k: { dx: number; dy: number; dz: number }): Vec3 => [k.dx * M, k.dy * M, k.dz * M];

/** Faixas de fita de uma peça, como caixas finas coladas na face. */
function faixasDeFita(c: Componente, peca: Peca | undefined): Caixa[] {
  if (!peca) return [];
  const faces = facesDasBordas(c);
  if (!faces) return [];
  const r: Caixa[] = [];
  for (const borda of ['frente', 'tras', 'ext1', 'ext2'] as const) {
    if (!peca.bordas[borda]) continue;
    const { eixo, lado } = faces[borda];
    const k = { ...c.caixa };
    const d = `d${eixo}` as 'dx' | 'dy' | 'dz';
    const pos = k[eixo];
    k[eixo] = (lado === 'min' ? pos - FITA_VISUAL : pos + k[d]) as Caixa['x'];
    k[d] = FITA_VISUAL as Caixa['dx'];
    r.push(k);
  }
  return r;
}

export default function Visualizador3D({
  componentes,
  pecas,
  selecionado,
  aoSelecionar,
}: {
  componentes: Componente[];
  pecas: Peca[];
  selecionado: string | null;
  aoSelecionar: (id: string | null) => void;
}) {
  const [explodir, setExplodir] = useState(0);
  const [transparente, setTransparente] = useState(false);
  const [frentes, setFrentes] = useState(true);
  const temFrentes = componentes.some((c) => PAPEIS_FRENTE.has(c.papel));
  const visiveis = frentes ? componentes : componentes.filter((c) => !PAPEIS_FRENTE.has(c.papel));
  const [sobre, setSobre] = useState<string | null>(null);

  const env = useMemo(() => envelope(componentes), [componentes]);
  const origem: Vec3 = [(env.x + env.dx / 2) * M, (env.y + env.dy / 2) * M, -(env.z + env.dz / 2) * M];
  const raio = Math.max(env.dx, env.dy, env.dz) * M;
  const pecaPorId = useMemo(() => new Map(pecas.map((p) => [p.id, p])), [pecas]);

  function clicar(e: ThreeEvent<MouseEvent>, id: string) {
    e.stopPropagation();
    aoSelecionar(selecionado === id ? null : id);
  }

  return (
    <div>
      <div className="relative h-[24rem] overflow-hidden rounded-lg bg-gradient-to-b from-stone-100 to-stone-200 sm:h-[28rem]">
        <Canvas
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ position: [raio * 0.8, raio * 0.55, raio * 1.75], fov: 40, near: 0.01, far: 100 }}
          onPointerMissed={() => aoSelecionar(null)}
          aria-label="Modelo 3D do módulo. Arraste para girar, role para aproximar, clique numa peça para selecionar."
        >
          <ambientLight intensity={0.8} />
          <directionalLight position={[3, 5, 4]} intensity={1.6} />
          <directionalLight position={[-4, 2, -3]} intensity={0.4} />
          {visiveis.map((c) => {
            const ativo = c.id === selecionado;
            const p = centro(c.caixa, origem);
            const desloc: Vec3 = [p[0] * explodir * 0.8, p[1] * explodir * 0.8, p[2] * explodir * 0.8];
            const estilo = ativo ? COR_SELECAO : ESTILO[c.papel];
            return (
              <group key={c.id} position={desloc}>
                <mesh
                  position={p}
                  onClick={(e) => clicar(e, c.id)}
                  onPointerOver={(e) => {
                    e.stopPropagation();
                    setSobre(c.id);
                  }}
                  onPointerOut={() => setSobre((s) => (s === c.id ? null : s))}
                >
                  <boxGeometry args={tamanho(c.caixa)} />
                  <meshStandardMaterial
                    color={sobre === c.id && !ativo ? '#fcd34d' : estilo.fill}
                    transparent={transparente}
                    opacity={transparente && !ativo ? 0.35 : 1}
                    depthWrite={!transparente || ativo}
                    roughness={0.85}
                  />
                  <Edges color={estilo.stroke} />
                </mesh>
                {faixasDeFita(c, pecaPorId.get(c.id)).map((k, i) => (
                  <mesh key={i} position={centro(k, origem)} raycast={() => null}>
                    <boxGeometry args={tamanho(k)} />
                    <meshStandardMaterial color={COR_FITA} roughness={0.6} />
                  </mesh>
                ))}
              </group>
            );
          })}
          <OrbitControls makeDefault enableDamping={false} minDistance={raio * 0.4} maxDistance={raio * 6} />
        </Canvas>
        {sobre && (
          <div className="pointer-events-none absolute top-2 left-2 rounded bg-white/90 px-2 py-1 text-xs text-stone-700 shadow-sm">
            {componentes.find((c) => c.id === sobre)?.nome}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-stone-600">Explodir</span>
          <input type="range" min={0} max={1} step={0.05} value={explodir} onChange={(e) => setExplodir(Number(e.target.value))} className="w-32 accent-amber-600" />
        </label>
        {temFrentes && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={frentes} onChange={(e) => setFrentes(e.target.checked)} className="accent-amber-600" />
            <span className="text-stone-600">Portas e frentes</span>
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={transparente} onChange={(e) => setTransparente(e.target.checked)} className="accent-amber-600" />
          <span className="text-stone-600">Transparente</span>
        </label>
        <span className="flex items-center gap-2 text-stone-500">
          <span className="inline-block h-2 w-4 rounded-sm" style={{ background: COR_FITA }} /> fita de borda
        </span>
        <span className="text-stone-500">Arraste para girar · role para aproximar</span>
      </div>
    </div>
  );
}
