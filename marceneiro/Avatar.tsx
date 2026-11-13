import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import type { EstadoDaBoca } from './voz';

/**
 * Personagem 3D do marceneiro virtual. Desenho próprio do sistema, feito só
 * com formas simples (sem arquivo externo): cabelo grisalho, barba curta,
 * óculos de proteção na testa, camisa verde, avental de lona com trena e
 * lápis atrás da orelha. A boca abre no ritmo da fala; pisca e respira.
 */

const COR = {
  pele: '#e2b48c',
  peleSombra: '#cf9a72',
  cabelo: '#6b6560',
  barba: '#7a726b',
  oculos: '#a8d4e6',
  armacao: '#3a3a3a',
  camisa: '#3d6b52',
  avental: '#c49a6c',
  aventalBolso: '#a87f55',
  costura: '#8a6440',
  olho: '#ffffff',
  pupila: '#2b2118',
  boca: '#6b1f1f',
  lapis: '#f2c230',
  ponta: '#3b3b3b',
  trena: '#f2c230',
  trenaCentro: '#2f2f2f',
};

function Mat({ cor, rugosidade = 0.75 }: { cor: string; rugosidade?: number }) {
  return <meshStandardMaterial color={cor} roughness={rugosidade} metalness={0} />;
}

function Personagem({ boca, ouvindo, calmo }: { boca: EstadoDaBoca; ouvindo: boolean; calmo: boolean }) {
  const corpo = useRef<Group>(null);
  const cabeca = useRef<Group>(null);
  const olhos = useRef<Group>(null);
  const labio = useRef<Mesh>(null);
  const braco = useRef<Group>(null);
  const abertura = useRef(0);
  const piscar = useRef({ proximo: 2.5, fim: 0 });
  const fase = useMemo(() => Math.random() * 10, []);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime + fase;
    const agora = performance.now();
    // Boca: abre e fecha enquanto fala, com variação para não parecer mecânica.
    const recente = agora - boca.palavra < 700;
    const alvo = boca.falando && recente ? 0.25 + 0.75 * Math.abs(Math.sin(t * 13.5)) * (0.55 + 0.45 * Math.abs(Math.sin(t * 3.7))) : 0;
    abertura.current += (alvo - abertura.current) * Math.min(1, dt * 18);
    if (labio.current) labio.current.scale.set(1, 0.18 + abertura.current * 0.95, 1);

    const mov = calmo ? 0.3 : 1;
    if (corpo.current) corpo.current.scale.y = 1 + Math.sin(t * 1.9) * 0.008 * mov;
    if (cabeca.current) {
      cabeca.current.rotation.y = Math.sin(t * 0.55) * 0.09 * mov;
      cabeca.current.rotation.x = (boca.falando ? Math.sin(t * 4.2) * 0.035 : Math.sin(t * 0.8) * 0.015) * mov + (ouvindo ? 0.06 : 0);
      cabeca.current.rotation.z = ouvindo ? 0.1 : Math.sin(t * 0.4) * 0.02 * mov;
    }
    if (braco.current) {
      const gesto = boca.falando ? 0.35 + Math.sin(t * 2.6) * 0.12 * mov : 0.08;
      braco.current.rotation.z += (gesto - braco.current.rotation.z) * Math.min(1, dt * 4);
    }
    // Piscar a cada 2,5 a 5,5 s.
    const p = piscar.current;
    if (clock.elapsedTime > p.proximo) {
      p.fim = clock.elapsedTime + 0.13;
      p.proximo = clock.elapsedTime + 2.5 + Math.random() * 3;
    }
    if (olhos.current) olhos.current.scale.y = clock.elapsedTime < p.fim ? 0.12 : 1;
  });

  return (
    <group position={[0, -0.05, 0]}>
      {/* Tronco, camisa e avental */}
      <group ref={corpo}>
        <mesh position={[0, 0.45, 0]}>
          <capsuleGeometry args={[0.52, 0.7, 8, 24]} />
          <Mat cor={COR.camisa} />
        </mesh>
        <mesh position={[0, 0.42, 0.47]} rotation={[-0.08, 0, 0]}>
          <boxGeometry args={[0.78, 1.0, 0.06]} />
          <Mat cor={COR.avental} rugosidade={0.9} />
        </mesh>
        {/* Alças do avental */}
        {[-0.27, 0.27].map((x) => (
          <mesh key={x} position={[x, 1.02, 0.38]} rotation={[-0.5, 0, x > 0 ? -0.25 : 0.25]}>
            <boxGeometry args={[0.07, 0.42, 0.04]} />
            <Mat cor={COR.avental} rugosidade={0.9} />
          </mesh>
        ))}
        {/* Bolso com lápis e trena */}
        <mesh position={[0.13, 0.3, 0.515]} rotation={[-0.08, 0, 0]}>
          <boxGeometry args={[0.36, 0.26, 0.03]} />
          <Mat cor={COR.aventalBolso} rugosidade={0.9} />
        </mesh>
        <mesh position={[0.13, 0.44, 0.515]} rotation={[-0.08, 0, 0]}>
          <boxGeometry args={[0.36, 0.015, 0.035]} />
          <Mat cor={COR.costura} />
        </mesh>
        <mesh position={[0.03, 0.5, 0.5]} rotation={[-0.08, 0, 0.12]}>
          <cylinderGeometry args={[0.018, 0.018, 0.26, 10]} />
          <Mat cor={COR.lapis} rugosidade={0.5} />
        </mesh>
        <group position={[0.22, 0.4, 0.53]} rotation={[Math.PI / 2 - 0.08, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[0.085, 0.085, 0.06, 24]} />
            <Mat cor={COR.trena} rugosidade={0.4} />
          </mesh>
          <mesh position={[0, 0.032, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.01, 16]} />
            <Mat cor={COR.trenaCentro} />
          </mesh>
        </group>
        {/* Braços */}
        <group position={[-0.58, 0.82, 0]} rotation={[0, 0, -0.1]}>
          <mesh position={[0, -0.38, 0]}>
            <capsuleGeometry args={[0.15, 0.55, 6, 16]} />
            <Mat cor={COR.camisa} />
          </mesh>
        </group>
        <group ref={braco} position={[0.58, 0.82, 0]} rotation={[0, 0, 0.08]}>
          <mesh position={[0, -0.38, 0]}>
            <capsuleGeometry args={[0.15, 0.55, 6, 16]} />
            <Mat cor={COR.camisa} />
          </mesh>
        </group>
      </group>

      {/* Pescoço */}
      <mesh position={[0, 1.12, 0]}>
        <cylinderGeometry args={[0.16, 0.18, 0.22, 16]} />
        <Mat cor={COR.peleSombra} />
      </mesh>

      {/* Cabeça */}
      <group ref={cabeca} position={[0, 1.55, 0]}>
        <mesh>
          <sphereGeometry args={[0.46, 32, 24]} />
          <Mat cor={COR.pele} rugosidade={0.65} />
        </mesh>
        {/* Orelhas */}
        {[-0.45, 0.45].map((x) => (
          <mesh key={x} position={[x, -0.02, 0]} scale={[0.5, 1, 0.8]}>
            <sphereGeometry args={[0.11, 16, 12]} />
            <Mat cor={COR.peleSombra} />
          </mesh>
        ))}
        {/* Lápis atrás da orelha direita */}
        <group position={[0.43, 0.14, -0.04]} rotation={[0.25, 0, -0.95]}>
          <mesh>
            <cylinderGeometry args={[0.022, 0.022, 0.34, 10]} />
            <Mat cor={COR.lapis} rugosidade={0.5} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <coneGeometry args={[0.022, 0.06, 10]} />
            <Mat cor={COR.ponta} />
          </mesh>
        </group>
        {/* Cabelo grisalho */}
        <mesh position={[0, 0.05, -0.02]} scale={[1.03, 0.92, 1.03]}>
          <sphereGeometry args={[0.47, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42]} />
          <Mat cor={COR.cabelo} rugosidade={0.95} />
        </mesh>
        {/* Óculos de proteção levantados na testa, com elástico */}
        <mesh position={[0, 0.22, 0]} rotation={[Math.PI / 2 + 0.2, 0, 0]}>
          <torusGeometry args={[0.425, 0.018, 8, 48]} />
          <Mat cor={COR.armacao} />
        </mesh>
        <group position={[0, 0.27, 0.4]} rotation={[-0.75, 0, 0]}>
          {[-0.12, 0.12].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <boxGeometry args={[0.2, 0.12, 0.05]} />
              <meshStandardMaterial color={COR.oculos} roughness={0.15} metalness={0.1} transparent opacity={0.75} />
            </mesh>
          ))}
          <mesh>
            <boxGeometry args={[0.46, 0.035, 0.06]} />
            <Mat cor={COR.armacao} />
          </mesh>
        </group>
        {/* Costeletas e cabelo aparecendo sob o boné */}
        {[-0.41, 0.41].map((x) => (
          <mesh key={x} position={[x, 0.06, 0.1]} rotation={[0, 0, x > 0 ? 0.12 : -0.12]}>
            <boxGeometry args={[0.08, 0.22, 0.2]} />
            <Mat cor={COR.cabelo} rugosidade={0.95} />
          </mesh>
        ))}
        {/* Sobrancelhas */}
        {[-0.16, 0.16].map((x) => (
          <mesh key={x} position={[x, 0.07, 0.42]} rotation={[0, 0, x > 0 ? -0.08 : 0.08]}>
            <boxGeometry args={[0.13, 0.025, 0.03]} />
            <Mat cor={COR.cabelo} />
          </mesh>
        ))}
        {/* Olhos */}
        <group ref={olhos} position={[0, 0, 0]}>
          {[-0.16, 0.16].map((x) => (
            <group key={x} position={[x, -0.02, 0.39]}>
              <mesh scale={[1, 1.1, 0.6]}>
                <sphereGeometry args={[0.075, 16, 12]} />
                <Mat cor={COR.olho} rugosidade={0.3} />
              </mesh>
              <mesh position={[0, -0.005, 0.04]}>
                <sphereGeometry args={[0.04, 12, 10]} />
                <Mat cor={COR.pupila} rugosidade={0.2} />
              </mesh>
            </group>
          ))}
        </group>
        {/* Nariz */}
        <mesh position={[0, -0.1, 0.45]} scale={[1, 1.1, 1]}>
          <sphereGeometry args={[0.07, 16, 12]} />
          <Mat cor={COR.peleSombra} />
        </mesh>
        {/* Barba curta */}
        <mesh position={[0, -0.02, 0.01]} scale={[1.03, 1.0, 1.03]}>
          <sphereGeometry args={[0.47, 32, 16, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4]} />
          <Mat cor={COR.barba} rugosidade={0.95} />
        </mesh>
        {/* Boca */}
        <mesh ref={labio} position={[0, -0.24, 0.43]} scale={[1, 0.18, 1]}>
          <sphereGeometry args={[0.075, 16, 12]} />
          <Mat cor={COR.boca} rugosidade={0.5} />
        </mesh>
      </group>
    </group>
  );
}

/** Quadro com o personagem. `rotulo` descreve para leitores de tela. */
export function AvatarMarceneiro({ boca, ouvindo = false, rotulo, className = '' }: { boca: EstadoDaBoca; ouvindo?: boolean; rotulo: string; className?: string }) {
  const calmo = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true, []);
  return (
    <div className={`overflow-hidden rounded-xl bg-gradient-to-b from-amber-50 to-stone-200 ${className}`} role="img" aria-label={rotulo}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 1.5, 3.7], fov: 30, near: 0.1, far: 20 }} onCreated={({ camera }) => camera.lookAt(0, 1.22, 0)}>
        <ambientLight intensity={0.85} />
        <directionalLight position={[2, 4, 3]} intensity={1.5} />
        <directionalLight position={[-3, 2, 2]} intensity={0.45} />
        <Personagem boca={boca} ouvindo={ouvindo} calmo={calmo} />
      </Canvas>
    </div>
  );
}
