import { dmm, envelope, formatarMm, projetar, type ResultadoModulo, type Vista } from '@marcenaria/core';
import { COR_SELECAO, ESTILO } from './estilo';

const NOME_VISTA: Record<Vista, string> = { frente: 'Vista de frente', lateral: 'Vista lateral (do lado direito)', planta: 'Vista de cima' };

/**
 * Vista ortográfica desenhada a partir das posições que o motor calcula.
 * As peças mais distantes são desenhadas primeiro. O SVG inverte o eixo vertical.
 */
export function Vista2D({
  resultado,
  vista,
  selecionado,
  aoSelecionar,
}: {
  resultado: ResultadoModulo;
  vista: Vista;
  selecionado: string | null;
  aoSelecionar: (id: string | null) => void;
}) {
  const comps = resultado.componentes;
  if (comps.length === 0) return null;
  const rets = projetar(comps, vista);
  const porId = new Map(comps.map((c) => [c.id, c]));

  const u0 = Math.min(...rets.map((r) => r.u));
  const v0 = Math.min(...rets.map((r) => r.v));
  const u1 = Math.max(...rets.map((r) => r.u + r.du));
  const v1 = Math.max(...rets.map((r) => r.v + r.dv));
  const largura = u1 - u0;
  const altura = v1 - v0;
  const tamanho = Math.max(largura, altura);
  const fonte = tamanho * 0.032;
  const margem = fonte * 3.2;
  const vb = `${u0 - margem} ${-margem * 0.6} ${largura + margem * 1.6} ${altura + margem * 1.8}`;
  // Coordenada vertical do SVG (para baixo) a partir da do desenho (para cima).
  const y = (v: number, dv: number) => v1 - v - dv;
  const traco = tamanho * 0.0025;

  // Largura de cada vão no alto, só de frente.
  const { xi = 0, yi = 0, Hi = 0 } = resultado.medidas;
  const env = envelope(comps);

  return (
    <svg
      viewBox={vb}
      className="mx-auto block max-h-[26rem] w-full select-none"
      role="img"
      aria-label={`${NOME_VISTA[vista]}, ${formatarMm(dmm(largura))} por ${formatarMm(dmm(altura))} mm`}
      onClick={() => aoSelecionar(null)}
    >
      {rets.map((r) => {
        const c = porId.get(r.id)!;
        const ativo = selecionado === r.id;
        const estilo = ativo ? COR_SELECAO : ESTILO[c.papel];
        return (
          <rect
            key={r.id}
            x={r.u}
            y={y(r.v, r.dv)}
            width={r.du}
            height={r.dv}
            fill={estilo.fill}
            stroke={estilo.stroke}
            strokeWidth={traco}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              aoSelecionar(ativo ? null : r.id);
            }}
          >
            <title>
              {c.nome}: {formatarMm(c.comprimento)} × {formatarMm(c.largura)} × {formatarMm(c.espessura)} mm
            </title>
          </rect>
        );
      })}

      {/* Peça selecionada por cima, tracejada: aparece mesmo quando outra a cobre. */}
      {rets
        .filter((r) => r.id === selecionado)
        .map((r) => (
          <rect
            key={`sel-${r.id}`}
            x={r.u}
            y={y(r.v, r.dv)}
            width={r.du}
            height={r.dv}
            fill="none"
            stroke={COR_SELECAO.stroke}
            strokeWidth={traco * 2.5}
            strokeDasharray={`${traco * 8} ${traco * 5}`}
            className="pointer-events-none"
          />
        ))}

      {vista === 'frente' &&
        resultado.vaos.length > 1 &&
        resultado.vaos.map((v) => (
          <text
            key={v.indice}
            x={xi + v.x + v.largura / 2}
            y={y(yi + Hi, 0) + fonte * 1.4}
            fontSize={fonte * 0.85}
            textAnchor="middle"
            fill="#57534e"
            className="tabular pointer-events-none"
          >
            {formatarMm(v.largura)}
          </text>
        ))}

      {/* Cota horizontal */}
      <g stroke="#78716c" strokeWidth={traco}>
        <line x1={u0} y1={altura + margem * 0.45} x2={u1} y2={altura + margem * 0.45} />
        <line x1={u0} y1={altura + margem * 0.3} x2={u0} y2={altura + margem * 0.6} />
        <line x1={u1} y1={altura + margem * 0.3} x2={u1} y2={altura + margem * 0.6} />
      </g>
      <text x={(u0 + u1) / 2} y={altura + margem * 0.45 + fonte * 1.2} fontSize={fonte} textAnchor="middle" fill="#292524">
        {formatarMm(dmm(largura))}
      </text>

      {/* Cota vertical */}
      <g stroke="#78716c" strokeWidth={traco}>
        <line x1={u0 - margem * 0.45} y1={0} x2={u0 - margem * 0.45} y2={altura} />
        <line x1={u0 - margem * 0.6} y1={0} x2={u0 - margem * 0.3} y2={0} />
        <line x1={u0 - margem * 0.6} y1={altura} x2={u0 - margem * 0.3} y2={altura} />
      </g>
      <text
        x={u0 - margem * 0.45 - fonte * 0.5}
        y={altura / 2}
        fontSize={fonte}
        textAnchor="middle"
        fill="#292524"
        transform={`rotate(-90 ${u0 - margem * 0.45 - fonte * 0.5} ${altura / 2})`}
      >
        {formatarMm(dmm(altura))}
      </text>

      {vista !== 'frente' && (
        <text x={vista === 'lateral' ? u1 : (u0 + u1) / 2} y={vista === 'lateral' ? -margem * 0.15 : altura + margem * 1.05} fontSize={fonte * 0.8} textAnchor={vista === 'lateral' ? 'end' : 'middle'} fill="#a8a29e">
          {vista === 'lateral' ? 'frente →' : `frente ↓ · profundidade ${formatarMm(env.dz)}`}
        </text>
      )}
    </svg>
  );
}
