import { NOME_FURO, descreverFace, formatarMm, orientacaoDaPeca, type Furacao, type ItemLista } from '@marcenaria/core';
import { Botao, Cartao } from '../components/ui';
import { useImpressao } from '../components/Imprimir';
import { baixarTexto, paraCsv } from '../lib/exportar';
import type { Calculo } from './useCalculo';
import { NOME_MATERIAL } from './estilo';

const ORIGEM = { x: 'da esquerda', y: 'de baixo', z: 'da frente' } as const;

interface Linha {
  n: number;
  furo: Furacao;
  /** Posição no comprimento (texto pronto) e posições na largura. */
  u: string;
  v: string;
  pontos: Array<{ u: number; v: number }>;
}

const furosDe = (i: ItemLista) => i.usinagens.filter((u): u is Furacao => u.tipo === 'furos');
const mmTexto = (v: number) => formatarMm(v as never);
const unicos = (l: number[]) => [...new Set(l)].sort((a, b) => a - b);

/**
 * Uma linha por posição no comprimento (furos alinhados na largura ficam
 * juntos). A fileira de pinos de prateleira vira uma linha só: é sempre uma
 * série de passo constante.
 */
function linhasDe(item: ItemLista): Linha[] {
  const r: Linha[] = [];
  for (const furo of furosDe(item)) {
    const us = unicos(furo.centros.map((c) => c.u));
    const passo = us.length > 2 ? us[1]! - us[0]! : 0;
    const serie = furo.finalidade === 'pino_prateleira' && us.length > 2 && us.every((u, i) => i === 0 || u - us[i - 1]! === passo);
    if (serie) {
      r.push({ n: r.length + 1, furo, u: `${mmTexto(us[0]!)} a ${mmTexto(us.at(-1)!)}, a cada ${mmTexto(passo)}`, v: unicos(furo.centros.map((c) => c.v)).map(mmTexto).join(' e '), pontos: furo.centros });
      continue;
    }
    for (const u of us) {
      const pontos = furo.centros.filter((c) => c.u === u);
      r.push({ n: r.length + 1, furo, u: mmTexto(u), v: unicos(pontos.map((c) => c.v)).map(mmTexto).join(' e '), pontos });
    }
  }
  return r;
}

/** Desenho da peça com os furos. Comprimento na horizontal; a borda da frente fica embaixo. */
function Desenho({ item, linhas }: { item: ItemLista; linhas: Linha[] }) {
  const [C, L] = [item.comprimento, item.largura];
  const margem = Math.max(C, L) * 0.06 + 120;
  const traco = Math.max(C, L) / 400;
  const fonte = Math.max(C, L) / 38;
  // Face com mais furos: desenhada cheia. As outras faces, tracejadas.
  const contagem = new Map<string, number>();
  for (const l of linhas) if (!l.furo.topo) contagem.set(l.furo.face, (contagem.get(l.furo.face) ?? 0) + 1);
  const principal = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return (
    <svg viewBox={`${-margem} ${-margem} ${C + 2 * margem} ${L + 2 * margem}`} className="w-full" style={{ maxHeight: '22rem' }} role="img" aria-label={`Furação de ${item.nome}`}>
      <rect x={0} y={0} width={C} height={L} fill="#fbf7f1" stroke="#3b2416" strokeWidth={traco * 1.5} />
      <text x={C / 2} y={L + margem * 0.75} textAnchor="middle" fontSize={fonte} fill="#57534e">
        frente da peça · comprimento {formatarMm(C)} mm
      </text>
      <text x={-margem * 0.35} y={L / 2} textAnchor="middle" fontSize={fonte} fill="#57534e" transform={`rotate(-90 ${-margem * 0.35} ${L / 2})`}>
        largura {formatarMm(L)} mm
      </text>
      {linhas.flatMap((l) => l.pontos.map((p, i) => ({ l, p, chave: `${l.n}-${i}`, rotulo: i === 0 }))).map(({ l, p, chave, rotulo }) => {
        // v cresce a partir da frente; no desenho a frente fica embaixo.
        const x = p.u;
        const y = L - p.v;
        const r = Math.max(l.furo.diametro / 2, traco * 3);
        if (l.furo.topo) {
          // Furo de topo: traço entrando na peça a partir da borda.
          const pr = l.furo.profundidade;
          const [dx, dy] = p.u === 0 ? [pr, 0] : p.u === C ? [-pr, 0] : p.v === 0 ? [0, -pr] : [0, pr];
          return (
            <g key={chave}>
              <line x1={x} y1={y} x2={x + dx} y2={y + dy} stroke="#c2702a" strokeWidth={Math.max(l.furo.diametro, traco * 4)} strokeLinecap="butt" opacity={0.75} />
              <text x={x + (dx === 0 ? fonte * 0.9 : dx > 0 ? -fonte * 0.9 : fonte * 0.9)} y={y + (dy === 0 ? fonte * 0.35 : dy < 0 ? fonte * 1.2 : -fonte * 0.5)} textAnchor="middle" fontSize={fonte} fill="#9a3412">
                {rotulo ? l.n : ''}
              </text>
            </g>
          );
        }
        const cheia = l.furo.face === principal;
        return (
          <g key={chave}>
            <circle cx={x} cy={y} r={r} fill={cheia ? '#3b2416' : 'none'} stroke="#3b2416" strokeWidth={traco * 1.2} strokeDasharray={cheia ? undefined : `${traco * 3} ${traco * 2}`} />
            <text x={x + r + fonte * 0.3} y={y - r - fonte * 0.15} fontSize={fonte} fill="#1c1917">
              {rotulo ? l.n : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Peca({ item, origem }: { item: ItemLista; origem: { u: string; v: string } | null }) {
  const linhas = linhasDe(item);
  return (
    <figure className="break-inside-avoid rounded-xl bg-white p-4 ring-1 ring-stone-200">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-stone-900">
          {item.codigo} · {item.nome}
        </span>
        <span className="tabular text-xs text-stone-500">
          {item.quantidade} × {formatarMm(item.comprimento)} × {formatarMm(item.largura)} × {formatarMm(item.espessura)} mm · {NOME_MATERIAL[item.material]}
        </span>
      </figcaption>
      <Desenho item={item} linhas={linhas} />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-stone-500">
            <tr>
              <th className="py-1 pr-2 font-medium">Nº</th>
              <th className="py-1 pr-2 font-medium">Furos</th>
              <th className="py-1 pr-2 font-medium">Onde</th>
              <th className="py-1 pr-2 text-right font-medium">Ø</th>
              <th className="py-1 pr-2 text-right font-medium">Prof.</th>
              <th className="py-1 pr-2 text-right font-medium">No comprimento{origem ? `, ${origem.u}` : ''}</th>
              <th className="py-1 text-right font-medium">Na largura{origem ? `, ${origem.v}` : ''}</th>
            </tr>
          </thead>
          <tbody className="tabular divide-y divide-stone-100">
            {linhas.map((l) => (
              <tr key={l.n}>
                <td className="py-1 pr-2 font-medium">{l.n}</td>
                <td className="py-1 pr-2">
                  {l.pontos.length} {NOME_FURO[l.furo.finalidade][l.pontos.length === 1 ? 0 : 1]}
                </td>
                <td className="py-1 pr-2">{descreverFace(l.furo)}</td>
                <td className="py-1 pr-2 text-right">{formatarMm(l.furo.diametro)}</td>
                <td className="py-1 pr-2 text-right">{l.furo.passante ? 'passante' : formatarMm(l.furo.profundidade)}</td>
                <td className="py-1 pr-2 text-right">{l.u}</td>
                <td className="py-1 text-right">{l.v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-stone-500">Furo de topo: no meio da espessura. Círculo cheio: face com mais furos; tracejado: outra face (veja a coluna "Onde").</p>
    </figure>
  );
}

/** Folha de furação: um desenho cotado por peça, para imprimir ou levar à furadeira. */
export function FolhaFuracao({ calculo, nomeArquivo }: { calculo: Calculo; nomeArquivo: string }) {
  const { imprimir, Area } = useImpressao();
  const { lista, resultado } = calculo;
  if (!lista || !resultado?.valido) return null;
  const itens = lista.itens.filter((i) => furosDe(i).length > 0);
  if (itens.length === 0) return null;
  const total = itens.reduce((s, i) => s + furosDe(i).reduce((t, f) => t + f.centros.length, 0) * i.quantidade, 0);

  const origemDe = (item: ItemLista) => {
    const c = resultado.componentes.find((x) => x.id === item.ids[0]);
    const o = c && orientacaoDaPeca(c);
    return o ? { u: ORIGEM[o[0]], v: ORIGEM[o[1]] } : null;
  };

  function exportarCsv() {
    const linhas: Array<Array<string | number>> = [
      ['Código', 'Peça', 'Qtd de peças', 'Furo', 'Onde', 'Diâmetro (mm)', 'Profundidade (mm)', 'No comprimento (mm)', 'Na largura (mm)'],
      // No CSV vai um furo por linha, para servir de entrada a outra máquina ou planilha.
      ...itens.flatMap((i) =>
        furosDe(i).flatMap((f) => f.centros.map((c) => [i.codigo, i.nome, i.quantidade, NOME_FURO[f.finalidade][0], descreverFace(f), formatarMm(f.diametro), f.passante ? 'passante' : formatarMm(f.profundidade), mmTexto(c.u), mmTexto(c.v)])),
      ),
    ];
    baixarTexto(`${nomeArquivo}-furacao.csv`, paraCsv(linhas), 'text/csv');
  }

  const folhas = (
    <div className="folhas grid gap-4">
      {itens.map((i) => (
        <Peca key={i.codigo} item={i} origem={origemDe(i)} />
      ))}
    </div>
  );

  return (
    <Cartao
      titulo="Folha de furação"
      descricao={`${itens.length} ${itens.length === 1 ? 'peça furada' : 'peças furadas'}, ${total} furos no total. Medidas a partir da ponta e da borda indicadas em cada tabela.`}
      acoes={
        <div className="flex gap-2">
          <Botao variante="secundario" onClick={exportarCsv}>
            Baixar CSV
          </Botao>
          <Botao onClick={imprimir}>Imprimir</Botao>
        </div>
      }
    >
      {folhas}
      <Area>
        <h1 className="mb-3 text-lg font-semibold">Folha de furação · {nomeArquivo}</h1>
        {folhas}
      </Area>
    </Cartao>
  );
}
