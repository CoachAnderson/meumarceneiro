import { useEffect, useMemo, useRef, useState } from 'react';
import { fluxoDeCaixa, formatarReais, hojeBrasil, somarDias, somarMeses, type PeriodoFluxo } from '@marcenaria/core';
import { Cartao } from '../components/ui';
import type { Lancamento } from '../lib/financeiro';

const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotulo = (p: PeriodoFluxo, mensal: boolean) => (mensal ? `${MES[Number(p.inicio.slice(5, 7)) - 1]}/${p.inicio.slice(2, 4)}` : `${dia(p.inicio)}–${dia(p.fim)}`);
/** No celular a semana mostra só o primeiro dia (cabe embaixo da barra). */
const rotuloCurto = (p: PeriodoFluxo, mensal: boolean) => (mensal ? MES[Number(p.inicio.slice(5, 7)) - 1]! : dia(p.inicio));

/** Largura real do gráfico, para o texto sair no tamanho certo em qualquer tela. */
function useLargura(inicial: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e?.contentRect.width ?? 0);
      if (w > 0) setLargura(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, largura] as const;
}

/** Barras de entradas e saídas por período (o que entrou e o que vai entrar; o que saiu e o que vai sair). */
function Grafico({ periodos, mensal }: { periodos: readonly PeriodoFluxo[]; mensal: boolean }) {
  const [foco, setFoco] = useState<number | null>(null);
  const [ref, largura] = useLargura(720);
  const W = Math.max(280, largura);
  const H = W < 480 ? 200 : 240;
  const base = H - 28;
  const topo = 12;
  const valores = periodos.flatMap((p) => [p.entradas + p.aReceber, p.saidas + p.aPagar]);
  const max = Math.max(1, ...valores);
  const esquerda = W < 480 ? 64 : 72;
  const passo = (W - esquerda - 8) / periodos.length;
  const barra = Math.min(28, (passo - 10) / 2);
  const altura = (v: number) => (v / max) * (base - topo);
  const marcas = [0, 0.5, 1].map((f) => f * max);
  const p = foco === null ? null : periodos[foco];

  return (
    <div className="relative" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Entradas e saídas por período">
        {marcas.map((m) => (
          <g key={m}>
            <line x1={esquerda} x2={W - 8} y1={base - altura(m)} y2={base - altura(m)} stroke="currentColor" className="text-stone-200" strokeWidth={1} />
            <text x={esquerda - 6} y={base - altura(m) + 4} fontSize={11} textAnchor="end" className="fill-stone-500">
              {m === 0 ? 'R$ 0' : formatarReais(Math.round(m)).replace(/,\d\d$/, '')}
            </text>
          </g>
        ))}
        {periodos.map((q, i) => {
          const x = esquerda + i * passo + passo / 2;
          const e = q.entradas + q.aReceber;
          const s = q.saidas + q.aPagar;
          return (
            <g key={q.inicio} onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)} onFocus={() => setFoco(i)} onBlur={() => setFoco(null)} tabIndex={0}>
              {/* Área de toque maior que a barra. */}
              <rect x={x - passo / 2} y={topo} width={passo} height={base - topo + 24} fill="transparent" />
              {foco === i && <rect x={x - passo / 2 + 2} y={topo} width={passo - 4} height={base - topo} className="fill-stone-100" />}
              <path d={barraArredondada(x - barra - 1, base, barra, altura(e))} fill="var(--serie-1)" />
              <path d={barraArredondada(x + 1, base, barra, altura(s))} fill="var(--serie-2)" />
              <text x={x} y={H - 10} fontSize={11} textAnchor="middle" className="fill-stone-500">
                {passo >= 72 ? rotulo(q, mensal) : rotuloCurto(q, mensal)}
              </text>
            </g>
          );
        })}
        <line x1={esquerda} x2={W - 8} y1={base} y2={base} stroke="currentColor" className="text-stone-400" strokeWidth={1} />
      </svg>
      {p && (
        <div className="pointer-events-none absolute top-2 right-2 rounded-lg bg-white px-3 py-2 text-xs shadow-md ring-1 ring-stone-200">
          <p className="mb-1 font-semibold text-stone-900">{rotulo(p, mensal)}</p>
          <p className="tabular text-stone-700">Entradas: {formatarReais(p.entradas + p.aReceber)}</p>
          <p className="tabular text-stone-700">Saídas: {formatarReais(p.saidas + p.aPagar)}</p>
          <p className="tabular font-medium text-stone-900">Saldo no fim: {formatarReais(p.saldo)}</p>
        </div>
      )}
    </div>
  );
}

/** Retângulo com os cantos de cima arredondados (4 px), apoiado na base. */
function barraArredondada(x: number, base: number, w: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${base}V${base - h + r}Q${x},${base - h} ${x + r},${base - h}H${x + w - r}Q${x + w},${base - h} ${x + w},${base - h + r}V${base}Z`;
}

export function Fluxo({ lancamentos, saldoAtual }: { lancamentos: readonly Lancamento[]; saldoAtual: number }) {
  const [escala, setEscala] = useState<'semanas' | 'meses'>('semanas');
  const hoje = hojeBrasil();
  const periodos = useMemo(() => {
    // Do saldo de hoje para a frente: só o previsto (o realizado já está no saldo).
    const abertos = lancamentos.filter((l) => l.status === 'aberto');
    return escala === 'semanas'
      ? fluxoDeCaixa(abertos, saldoAtual, hoje, somarDias(hoje, 7 * 8 - 1), 7)
      : fluxoDeCaixa(abertos, saldoAtual, hoje, somarDias(somarMeses(`${hoje.slice(0, 7)}-01`, 6), -1), 'mes');
  }, [lancamentos, saldoAtual, escala, hoje]);
  const menor = periodos.reduce((m, p) => (p.saldo < m.saldo ? p : m), periodos[0]!);

  return (
    <Cartao
      titulo="Fluxo de caixa"
      descricao="Do saldo das contas hoje para a frente, com o que está para receber e para pagar. O que já venceu e não foi pago entra no primeiro período."
      acoes={
        <div className="inline-flex rounded-lg bg-stone-100 p-1" role="radiogroup" aria-label="Período">
          {(['semanas', 'meses'] as const).map((e) => (
            <button key={e} type="button" role="radio" aria-checked={escala === e} onClick={() => setEscala(e)} className={`min-h-9 rounded-md px-3 text-sm font-medium ${escala === e ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'}`}>
              {e === 'semanas' ? '8 semanas' : '6 meses'}
            </button>
          ))}
        </div>
      }
    >
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-stone-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: 'var(--serie-1)' }} /> Entradas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: 'var(--serie-2)' }} /> Saídas
        </span>
      </div>
      <Grafico periodos={periodos} mensal={escala === 'meses'} />
      {menor && menor.saldo < 0 && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          O saldo previsto fica negativo em {formatarReais(menor.saldo)} no período {rotulo(menor, escala === 'meses')}.
        </p>
      )}
      <div className="-mx-5 mt-4 overflow-x-auto sm:-mx-6">
        <table className="cartoes-celular min-w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-stone-500">
              <th className="px-5 py-1.5 font-medium sm:px-6">Período</th>
              <th className="px-3 py-1.5 text-right font-medium">Entradas</th>
              <th className="px-3 py-1.5 text-right font-medium">Saídas</th>
              <th className="px-5 py-1.5 text-right font-medium sm:px-6">Saldo no fim</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {periodos.map((p) => (
              <tr key={p.inicio}>
                <td className="px-5 py-1.5 sm:px-6">{rotulo(p, escala === 'meses')}</td>
                <td className="tabular px-3 py-1.5 text-right">{formatarReais(p.entradas + p.aReceber)}</td>
                <td className="tabular px-3 py-1.5 text-right">{formatarReais(p.saidas + p.aPagar)}</td>
                <td className={`tabular px-5 py-1.5 text-right font-medium sm:px-6 ${p.saldo < 0 ? 'text-red-700' : ''}`}>{formatarReais(p.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Cartao>
  );
}
