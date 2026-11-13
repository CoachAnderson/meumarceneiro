import { useRef, useState, type PointerEvent as EventoPonteiro } from 'react';
import { dmm, envelope, formatarMm, projetar, type Dmm, type ResultadoModulo, type Vista } from '@marcenaria/core';
import { ajustarValor, alvoDe, faixaDe, type Faixa } from './ajustes';
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
  semFrentes = false,
  aoArrastar,
}: {
  resultado: ResultadoModulo;
  vista: Vista;
  selecionado: string | null;
  aoSelecionar: (id: string | null) => void;
  /** Esconde portas e frentes de gaveta (para alcançar o interior). */
  semFrentes?: boolean;
  /** Vista de frente: arrastar divisória (valor = largura do vão à esquerda) ou prateleira (altura). */
  aoArrastar?: (id: string, valor: Dmm) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [arraste, setArraste] = useState<{ id: string; eixo: 'x' | 'y'; faixa: Faixa; inicio: { x: number; y: number }; tela: { x: number; y: number }; valor: Dmm; movido: boolean } | null>(null);
  const ignorarClique = useRef(false);
  const comps = semFrentes ? resultado.componentes.filter((c) => c.papel !== 'porta' && c.papel !== 'frente_gaveta') : resultado.componentes;
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

  // Arraste (só de frente): divisória anda na horizontal, prateleira na vertical.
  const arrastavel = (id: string): { eixo: 'x' | 'y'; faixa: Faixa } | null => {
    if (vista !== 'frente' || !aoArrastar) return null;
    const alvo = alvoDe(id);
    if (!alvo || alvo.tipo === 'vao') return null;
    const faixa = faixaDe(resultado, alvo);
    return faixa ? { eixo: alvo.tipo === 'divisoria' ? 'x' : 'y', faixa } : null;
  };
  const pontoNoDesenho = (e: EventoPonteiro) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(m.inverse());
  };
  const comecar = (e: EventoPonteiro<SVGRectElement>, id: string) => {
    const a = arrastavel(id);
    const p = pontoNoDesenho(e);
    if (!a || !p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setArraste({ id, ...a, inicio: { x: p.x, y: p.y }, tela: { x: e.clientX, y: e.clientY }, valor: a.faixa.atual, movido: false });
  };
  const mover = (e: EventoPonteiro<SVGRectElement>) => {
    if (!arraste) return;
    const p = pontoNoDesenho(e);
    if (!p) return;
    // O desenho está em décimos de mm; o eixo vertical do SVG é para baixo.
    const delta = arraste.eixo === 'x' ? p.x - arraste.inicio.x : arraste.inicio.y - p.y;
    const valor = ajustarValor(arraste.faixa, arraste.faixa.atual + delta) ?? arraste.faixa.atual;
    const movido = arraste.movido || Math.hypot(e.clientX - arraste.tela.x, e.clientY - arraste.tela.y) > 4;
    if (valor !== arraste.valor || movido !== arraste.movido) setArraste({ ...arraste, valor, movido });
  };
  const soltar = () => {
    if (!arraste) return;
    if (arraste.movido) {
      ignorarClique.current = true;
      if (arraste.valor !== arraste.faixa.atual) aoArrastar?.(arraste.id, arraste.valor);
      else aoSelecionar(arraste.id);
    }
    setArraste(null);
  };
  const deslocamento = (id: string) => {
    if (!arraste || arraste.id !== id) return { dx: 0, dy: 0 };
    const d = arraste.valor - arraste.faixa.atual;
    return arraste.eixo === 'x' ? { dx: d, dy: 0 } : { dx: 0, dy: -d };
  };
  // Fundo primeiro, depois a área clicável de cada vão, depois o resto.
  const ordem = [...rets.filter((r) => porId.get(r.id)!.papel === 'fundo'), ...rets.filter((r) => porId.get(r.id)!.papel !== 'fundo')];
  const nFundos = rets.filter((r) => porId.get(r.id)!.papel === 'fundo').length;
  const areasDosVaos = vista === 'frente' && aoArrastar ? resultado.vaos : [];

  return (
    <svg
      ref={svgRef}
      viewBox={vb}
      className="desenho-tecnico mx-auto block max-h-[26rem] w-full select-none"
      role="img"
      aria-label={`${NOME_VISTA[vista]}, ${formatarMm(dmm(largura))} por ${formatarMm(dmm(altura))} mm`}
      onClick={() => aoSelecionar(null)}
    >
      {ordem.map((r, indice) => {
        const c = porId.get(r.id)!;
        const ativo = selecionado === r.id;
        const estilo = ativo ? COR_SELECAO : ESTILO[c.papel];
        const a = arrastavel(r.id);
        const { dx, dy } = deslocamento(r.id);
        return [
          indice === nFundos
            ? areasDosVaos.map((v) => {
                const id = `vao_${v.indice}`;
                return (
                  <rect
                    key={id}
                    x={xi + v.x}
                    y={y(yi, Hi)}
                    width={v.largura}
                    height={Hi}
                    fill={selecionado === id ? COR_SELECAO.fill : 'transparent'}
                    fillOpacity={selecionado === id ? 0.35 : 1}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      aoSelecionar(selecionado === id ? null : id);
                    }}
                  >
                    <title>Vão {v.indice}: {formatarMm(v.largura)} mm</title>
                  </rect>
                );
              })
            : null,
          <rect
            key={r.id}
            x={r.u + dx}
            y={y(r.v, r.dv) + dy}
            width={r.du}
            height={r.dv}
            fill={estilo.fill}
            stroke={estilo.stroke}
            strokeWidth={traco}
            className={a ? (a.eixo === 'x' ? 'cursor-ew-resize' : 'cursor-ns-resize') : 'cursor-pointer'}
            style={a ? { touchAction: 'none' } : undefined}
            onPointerDown={a ? (e) => comecar(e, r.id) : undefined}
            onPointerMove={a ? mover : undefined}
            onPointerUp={a ? soltar : undefined}
            onPointerCancel={a ? () => setArraste(null) : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (ignorarClique.current) {
                ignorarClique.current = false;
                return;
              }
              aoSelecionar(ativo ? null : r.id);
            }}
          >
            <title>
              {c.nome}: {formatarMm(c.comprimento)} × {formatarMm(c.largura)} × {formatarMm(c.espessura)} mm
            </title>
          </rect>,
        ];
      })}

      {/* Peça selecionada por cima, tracejada: aparece mesmo quando outra a cobre. */}
      {rets
        .filter((r) => r.id === selecionado)
        .map((r) => (
          <rect
            key={`sel-${r.id}`}
            x={r.u + deslocamento(r.id).dx}
            y={y(r.v, r.dv) + deslocamento(r.id).dy}
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

      {/* Medida ao vivo durante o arraste */}
      {arraste &&
        (() => {
          const r = rets.find((x) => x.id === arraste.id);
          if (!r) return null;
          const { dx, dy } = deslocamento(arraste.id);
          const alvo = alvoDe(arraste.id);
          let texto = `${formatarMm(arraste.valor)} mm`;
          if (alvo?.tipo === 'divisoria') {
            const direita = (resultado.vaos[alvo.k - 1]!.largura + resultado.vaos[alvo.k]!.largura) - arraste.valor;
            texto = `${formatarMm(arraste.valor)} | ${formatarMm(dmm(direita))} mm`;
          }
          const cx = r.u + dx + r.du / 2;
          const cy = y(r.v, r.dv) + dy + (alvo?.tipo === 'prateleira' ? -fonte * 0.6 : r.dv / 2);
          return (
            <g className="pointer-events-none">
              <rect x={cx - fonte * 4.2} y={cy - fonte * 1.1} width={fonte * 8.4} height={fonte * 1.6} rx={fonte * 0.3} fill="#1c1917" fillOpacity={0.85} />
              <text x={cx} y={cy + fonte * 0.15} fontSize={fonte} textAnchor="middle" fill="#ffffff" className="tabular">
                {texto}
              </text>
            </g>
          );
        })()}

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
