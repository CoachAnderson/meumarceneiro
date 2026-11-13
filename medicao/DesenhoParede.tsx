import { formatarMm, NOME_PONTO, PONTUAIS, type Dmm, type Interferencia, type ParedeMedida, type PosicaoMovel } from '@marcenaria/core';

const COR: Record<string, string> = {
  tomada: '#2563eb',
  interruptor: '#0891b2',
  agua: '#0284c7',
  esgoto: '#57534e',
  gas: '#ca8a04',
  janela: '#38bdf8',
  porta: '#a16207',
  ar_condicionado: '#64748b',
  viga: '#78716c',
  pilar: '#78716c',
  rodape: '#a8a29e',
  outro: '#9333ea',
};
const SIGLA: Record<string, string> = { tomada: 'T', interruptor: 'I', agua: 'A', esgoto: 'E', gas: 'G' };

/**
 * A parede vista de frente, em escala: larguras medidas em três alturas,
 * alturas em três pontos, os pontos marcados e (na revisão) o móvel por cima.
 */
export function DesenhoParede({
  parede,
  largura,
  altura,
  movel,
  interferencias = [],
  selecionado,
  aoSelecionar,
}: {
  parede: ParedeMedida;
  largura: Dmm | null;
  altura: Dmm | null;
  movel?: PosicaoMovel | null;
  interferencias?: readonly Interferencia[];
  selecionado?: string | null;
  aoSelecionar?: (id: string) => void;
}) {
  const ls = Object.values(parede.larguras).filter((v): v is Dmm => v !== null);
  const as = Object.values(parede.alturas).filter((v): v is Dmm => v !== null);
  const W = largura ?? (ls.length ? Math.max(...ls) : 30000);
  const H = altura ?? (as.length ? Math.max(...as) : 26000);
  const m = Math.max(W, H) * 0.09;
  const fonte = Math.max(W, H) / 38;
  const traco = Math.max(W, H) / 500;
  const y = (v: number) => H - v; // do piso para cima
  const problema = new Set(interferencias.map((i) => i.ponto));
  const cota = (v: Dmm | null) => (v === null ? '?' : formatarMm(v));
  const semMedida = largura === null && altura === null;

  return (
    <svg viewBox={`${-m} ${-m} ${W + 2 * m} ${H + 2 * m}`} className="desenho-tecnico w-full" style={{ maxHeight: '22rem' }} role="img" aria-label={`${parede.nome} vista de frente`}>
      <rect x={0} y={0} width={W} height={H} fill="#fbf7f1" stroke="#3b2416" strokeWidth={traco * 1.5} strokeDasharray={semMedida ? `${traco * 6} ${traco * 4}` : undefined} />
      <line x1={-m * 0.6} y1={H} x2={W + m * 0.6} y2={H} stroke="#3b2416" strokeWidth={traco * 2} />
      {/* Larguras: perto do piso, no meio, perto do teto. */}
      {(
        [
          ['baixo', H * 0.92],
          ['meio', H * 0.55],
          ['alto', H * 0.1],
        ] as const
      ).map(([k, yy]) => (
        <g key={k}>
          <line x1={0} y1={yy} x2={W} y2={yy} stroke="#9a3412" strokeWidth={traco} strokeDasharray={`${traco * 4} ${traco * 3}`} />
          <text x={W / 2} y={yy - fonte * 0.35} textAnchor="middle" fontSize={fonte} fill="#9a3412">
            {cota(parede.larguras[k])}
          </text>
        </g>
      ))}
      {/* Alturas: esquerda, meio, direita. */}
      {(
        [
          ['esquerda', W * 0.06],
          ['meio', W * 0.5],
          ['direita', W * 0.94],
        ] as const
      ).map(([k, xx]) => (
        <g key={k}>
          <line x1={xx} y1={0} x2={xx} y2={H} stroke="#1d4ed8" strokeWidth={traco} strokeDasharray={`${traco * 4} ${traco * 3}`} opacity={0.6} />
          <text x={xx} y={H * 0.3} textAnchor="middle" fontSize={fonte} fill="#1d4ed8" transform={`rotate(-90 ${xx} ${H * 0.3})`} dy={-fonte * 0.3}>
            {cota(parede.alturas[k])}
          </text>
        </g>
      ))}
      {movel && (
        <rect x={movel.x} y={y(movel.y + movel.A)} width={movel.L} height={movel.A} fill="#f59e0b" fillOpacity={0.12} stroke="#b45309" strokeWidth={traco * 1.5} strokeDasharray={`${traco * 8} ${traco * 4}`} />
      )}
      {parede.pontos.map((p) => {
        const cor = problema.has(p.id) ? '#dc2626' : COR[p.tipo];
        const ativo = selecionado === p.id;
        const clicar = aoSelecionar ? { onClick: () => aoSelecionar(p.id), style: { cursor: 'pointer' } } : {};
        if (p.tipo === 'rodape') {
          if (p.altura === null) return null;
          return <rect key={p.id} x={0} y={y(p.altura)} width={W} height={p.altura} fill={cor} opacity={0.5} {...clicar} />;
        }
        if (p.x === null || p.y === null) return null;
        if (PONTUAIS.has(p.tipo)) {
          const r = Math.max(fonte * 0.75, 180);
          return (
            <g key={p.id} {...clicar}>
              <title>{NOME_PONTO[p.tipo]}</title>
              <circle cx={p.x} cy={y(p.y)} r={r} fill={cor} stroke={ativo ? '#000' : '#fff'} strokeWidth={traco * (ativo ? 3 : 1.5)} />
              <text x={p.x} y={y(p.y) + fonte * 0.35} textAnchor="middle" fontSize={fonte} fontWeight={700} fill="#fff">
                {SIGLA[p.tipo]}
              </text>
            </g>
          );
        }
        const w = p.largura ?? fonte * 2;
        const h = p.altura ?? (p.tipo === 'pilar' ? H - p.y : fonte * 2);
        return (
          <g key={p.id} {...clicar}>
            <title>{NOME_PONTO[p.tipo]}</title>
            <rect x={p.x} y={y(p.y + h)} width={w} height={h} fill={cor} fillOpacity={p.tipo === 'janela' ? 0.35 : 0.55} stroke={ativo ? '#000' : cor} strokeWidth={traco * (ativo ? 3 : 1.5)} />
            <text x={p.x + w / 2} y={y(p.y + h / 2) + fonte * 0.35} textAnchor="middle" fontSize={fonte * 0.9} fill="#1c1917">
              {NOME_PONTO[p.tipo]}
            </text>
          </g>
        );
      })}
      <text x={0} y={H + m * 0.7} fontSize={fonte} fill="#57534e">
        piso · medidas da esquerda e do piso
      </text>
    </svg>
  );
}
