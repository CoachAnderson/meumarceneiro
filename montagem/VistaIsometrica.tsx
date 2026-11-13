import { useMemo } from 'react';
import type { Componente, MarcaMontagem, TipoMarca } from '@marcenaria/core';
import { ESTILO } from '../editor/estilo';
import { enquadrar, facesVisiveis, ordemDePintura, projetar, type P2 } from './isometrica';

/** Cores das marcas no desenho e no 3D (e na legenda). */
export const COR_MARCA: Record<TipoMarca, string> = {
  minifix: '#2563eb',
  cavilha: '#16a34a',
  parafuso: '#dc2626',
  dobradica: '#9333ea',
  corredica: '#0891b2',
  suporte_prateleira: '#ca8a04',
  puxador: '#db2777',
  fixacao: '#ea580c',
};

export const NOME_MARCA: Record<TipoMarca, string> = {
  minifix: 'Minifix',
  cavilha: 'Cavilha',
  parafuso: 'Parafuso',
  dobradica: 'Dobradiça',
  corredica: 'Corrediça',
  suporte_prateleira: 'Suporte de prateleira',
  puxador: 'Puxador',
  fixacao: 'Parafuso de fixação',
};

const NOVA = { fill: '#fbbf24', stroke: '#92400e' };
const caminho = (l: P2[]) => `M${l.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}Z`;

/**
 * Desenho do passo: as peças já montadas, as novas em destaque e as marcas
 * de ferragem. `contexto`: peças que ainda não entraram, bem claras (para a
 * oficina mostrar "onde vai").
 */
export function VistaIsometrica({
  componentes,
  montadas,
  novas,
  marcas = [],
  contexto = false,
  rotulo,
  className = 'w-full',
}: {
  componentes: readonly Componente[];
  montadas: ReadonlySet<string>;
  novas: ReadonlySet<string>;
  marcas?: readonly MarcaMontagem[];
  contexto?: boolean;
  rotulo: string;
  className?: string;
}) {
  const desenho = useMemo(() => {
    const lista = componentes.filter((c) => contexto || montadas.has(c.id) || novas.has(c.id));
    const quadro = enquadrar(componentes.map((c) => c.caixa));
    const ordem = ordemDePintura(lista.map((c) => c.caixa));
    return { lista, quadro, ordem };
  }, [componentes, montadas, novas, contexto]);
  const { lista, quadro, ordem } = desenho;
  const margem = Math.max(quadro.largura, quadro.altura) * 0.05;
  const traco = Math.max(quadro.largura, quadro.altura) / 500;
  const raio = Math.max(traco * 3.2, 25);

  return (
    <svg
      viewBox={`${quadro.x - margem} ${quadro.y - margem} ${quadro.largura + 2 * margem} ${quadro.altura + 2 * margem}`}
      className={`desenho-tecnico ${className}`}
      role="img"
      aria-label={rotulo}
    >
      {ordem.map((i) => {
        const c = lista[i]!;
        const nova = novas.has(c.id);
        const fantasma = !nova && !montadas.has(c.id);
        const cor = nova ? NOVA : ESTILO[c.papel];
        const f = facesVisiveis(c.caixa);
        return (
          <g key={c.id} opacity={fantasma ? 0.18 : 1} strokeLinejoin="round">
            <path d={caminho(f.frente)} fill={cor.fill} stroke={cor.stroke} strokeWidth={traco} />
            <path d={caminho(f.direita)} fill={cor.fill} stroke={cor.stroke} strokeWidth={traco} />
            {/* Sombra na face da direita e luz no topo, para dar volume (também na impressão). */}
            <path d={caminho(f.direita)} fill="#000" opacity={0.12} />
            <path d={caminho(f.topo)} fill={cor.fill} stroke={cor.stroke} strokeWidth={traco} />
            <path d={caminho(f.topo)} fill="#fff" opacity={0.18} />
          </g>
        );
      })}
      {marcas.map((m, i) => {
        const [x, y] = projetar(m.ponto);
        return <circle key={i} cx={x} cy={y} r={raio} fill={COR_MARCA[m.tipo]} stroke="#fff" strokeWidth={traco * 0.8} />;
      })}
    </svg>
  );
}

/** Legenda das marcas que aparecem no passo. */
export function LegendaMarcas({ marcas }: { marcas: readonly MarcaMontagem[] }) {
  const contagem = new Map<TipoMarca, number>();
  for (const m of marcas) contagem.set(m.tipo, (contagem.get(m.tipo) ?? 0) + 1);
  if (contagem.size === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
      {[...contagem].map(([tipo, n]) => (
        <li key={tipo} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR_MARCA[tipo] }} />
          {NOME_MARCA[tipo]} ({n})
        </li>
      ))}
    </ul>
  );
}
