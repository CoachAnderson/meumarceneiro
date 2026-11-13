/**
 * Financeiro: contas a receber e a pagar, parcelas, baixa e fluxo de caixa.
 *
 * Dinheiro em centavos inteiros; datas como texto "AAAA-MM-DD" (dia do
 * calendário, sem fuso). A soma das parcelas é sempre exatamente o total:
 * os centavos que sobram da divisão vão para a primeira parcela.
 */

export type TipoLancamento = 'receber' | 'pagar';
export type StatusLancamento = 'aberto' | 'pago' | 'cancelado';
export type FormaPagamento = 'dinheiro' | 'pix' | 'boleto' | 'cartao_credito' | 'cartao_debito' | 'transferencia' | 'cheque' | 'outro';

export const NOME_FORMA: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  boleto: 'Boleto',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  transferencia: 'Transferência',
  cheque: 'Cheque',
  outro: 'Outro',
};

/** O mínimo que as contas precisam de um lançamento. */
export interface LancamentoBase {
  tipo: TipoLancamento;
  status: StatusLancamento;
  valor_centavos: number;
  vencimento: string;
  pago_em: string | null;
  valor_pago_centavos: number | null;
  conta_id?: string | null;
}

export class ErroFinanceiro extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroFinanceiro';
  }
}

// ---------------------------------------------------------------------------
// Datas (dia do calendário)
// ---------------------------------------------------------------------------

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dataValida(iso: string): boolean {
  const m = DATA.exec(iso);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
}

function partes(iso: string): [number, number, number] {
  if (!dataValida(iso)) throw new ErroFinanceiro(`Data inválida: "${iso}".`);
  const [a, m, d] = iso.split('-').map(Number) as [number, number, number];
  return [a, m, d];
}

const paraIso = (d: Date) => d.toISOString().slice(0, 10);

export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = partes(iso);
  return paraIso(new Date(Date.UTC(a, m - 1, d + dias)));
}

/** Mesmo dia, n meses depois; dia que não existe no mês vira o último (31/01 + 1 mês = 28 ou 29/02). */
export function somarMeses(iso: string, meses: number, diaDesejado?: number): string {
  const [a, m, d] = partes(iso);
  const dia = diaDesejado ?? d;
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimo));
  return paraIso(alvo);
}

export function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = partes(de);
  const [a2, m2, d2] = partes(ate);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/** Hoje no fuso de São Paulo (o dia que a marcenaria vê no calendário). */
export function hojeBrasil(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

// ---------------------------------------------------------------------------
// Parcelas
// ---------------------------------------------------------------------------

export interface PlanoParcelas {
  totalCentavos: number;
  /** Entrada (0 = sem entrada). Vence em `primeiroVencimento`; as parcelas começam um intervalo depois. */
  entradaCentavos?: number;
  /** Número de parcelas, sem contar a entrada. */
  parcelas: number;
  primeiroVencimento: string;
  /** 'mensal' (mesmo dia de cada mês) ou um número de dias entre parcelas. */
  intervalo: 'mensal' | number;
}

export interface Parcela {
  /** 0 = entrada. */
  numero: number;
  /** Quantas parcelas no total (sem a entrada). */
  de: number;
  valorCentavos: number;
  vencimento: string;
}

export const LIMITE_CENTAVOS = 100_000_000_00; // R$ 100 milhões
export const MAX_PARCELAS = 120;

/** Divide o total em parcelas iguais; a soma é exatamente o total. */
export function dividirEmParcelas(p: PlanoParcelas): Parcela[] {
  const entrada = p.entradaCentavos ?? 0;
  if (!Number.isInteger(p.totalCentavos) || p.totalCentavos <= 0 || p.totalCentavos > LIMITE_CENTAVOS) throw new ErroFinanceiro('Total inválido.');
  if (!Number.isInteger(entrada) || entrada < 0 || entrada > p.totalCentavos) throw new ErroFinanceiro('A entrada precisa ficar entre zero e o total.');
  if (!Number.isInteger(p.parcelas) || p.parcelas < 0 || p.parcelas > MAX_PARCELAS) throw new ErroFinanceiro(`De 0 a ${MAX_PARCELAS} parcelas.`);
  if (p.intervalo !== 'mensal' && (!Number.isInteger(p.intervalo) || p.intervalo < 1 || p.intervalo > 366)) throw new ErroFinanceiro('Intervalo de 1 a 366 dias.');
  partes(p.primeiroVencimento);
  const resto = p.totalCentavos - entrada;
  if (p.parcelas === 0 && resto > 0) throw new ErroFinanceiro('Sem parcelas, a entrada precisa ser o total.');
  if (p.parcelas > 0 && resto < p.parcelas) throw new ErroFinanceiro('Cada parcela precisa ser de pelo menos 1 centavo.');

  const lista: Parcela[] = [];
  if (entrada > 0) lista.push({ numero: 0, de: p.parcelas, valorCentavos: entrada, vencimento: p.primeiroVencimento });
  const [, , dia] = partes(p.primeiroVencimento);
  const base = Math.floor(resto / Math.max(1, p.parcelas));
  const sobra = resto - base * p.parcelas;
  for (let i = 1; i <= p.parcelas; i++) {
    // Com entrada, a 1ª parcela vence um intervalo depois dela; sem entrada, no primeiro vencimento.
    const passos = entrada > 0 ? i : i - 1;
    const vencimento = p.intervalo === 'mensal' ? somarMeses(p.primeiroVencimento, passos, dia) : somarDias(p.primeiroVencimento, passos * p.intervalo);
    lista.push({ numero: i, de: p.parcelas, valorCentavos: base + (i === 1 ? sobra : 0), vencimento });
  }
  return lista;
}

/** Mesmo valor repetido (aluguel, energia): n lançamentos, um por mês. */
export function repetirMensal(valorCentavos: number, primeiroVencimento: string, vezes: number): Parcela[] {
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0 || valorCentavos > LIMITE_CENTAVOS) throw new ErroFinanceiro('Valor inválido.');
  if (!Number.isInteger(vezes) || vezes < 1 || vezes > MAX_PARCELAS) throw new ErroFinanceiro(`De 1 a ${MAX_PARCELAS} meses.`);
  const [, , dia] = partes(primeiroVencimento);
  return Array.from({ length: vezes }, (_, k) => ({ numero: k + 1, de: vezes, valorCentavos, vencimento: somarMeses(primeiroVencimento, k, dia) }));
}

// ---------------------------------------------------------------------------
// Situação, baixa e resumo
// ---------------------------------------------------------------------------

export type Situacao = 'pago' | 'cancelado' | 'vencido' | 'vence_hoje' | 'a_vencer';

export const NOME_SITUACAO: Record<Situacao, string> = {
  pago: 'Pago',
  cancelado: 'Cancelado',
  vencido: 'Vencido',
  vence_hoje: 'Vence hoje',
  a_vencer: 'A vencer',
};

export function situacao(l: Pick<LancamentoBase, 'status' | 'vencimento'>, hoje: string): Situacao {
  if (l.status === 'pago') return 'pago';
  if (l.status === 'cancelado') return 'cancelado';
  if (l.vencimento < hoje) return 'vencido';
  if (l.vencimento === hoje) return 'vence_hoje';
  return 'a_vencer';
}

export interface Baixa {
  /** Valor que quita este lançamento. */
  pagoCentavos: number;
  /** Baixa parcial: o que continua em aberto num lançamento novo (mesmo vencimento). */
  restanteCentavos: number;
  /** Juros ou multa (pagou mais) ou desconto (pagou menos e quitou). */
  diferencaCentavos: number;
}

/**
 * Baixa de um lançamento de `valor` com `pago`:
 * - pago ≥ valor: quita; a diferença é juros ou multa;
 * - pago < valor e parcial: quita esta parte e o resto fica em aberto;
 * - pago < valor e não parcial: quita com desconto.
 */
export function calcularBaixa(valorCentavos: number, pagoCentavos: number, parcial: boolean): Baixa {
  if (!Number.isInteger(pagoCentavos) || pagoCentavos <= 0 || pagoCentavos > LIMITE_CENTAVOS) throw new ErroFinanceiro('Valor pago inválido.');
  if (pagoCentavos >= valorCentavos || !parcial) return { pagoCentavos, restanteCentavos: 0, diferencaCentavos: pagoCentavos - valorCentavos };
  return { pagoCentavos, restanteCentavos: valorCentavos - pagoCentavos, diferencaCentavos: 0 };
}

export interface ResumoTipo {
  vencido: number;
  hoje: number;
  proximos7: number;
  proximos30: number;
  /** Pago (ou recebido) no mês de hoje. */
  noMes: number;
  qtdVencidos: number;
}

export interface ResumoFinanceiro {
  receber: ResumoTipo;
  pagar: ResumoTipo;
}

export function resumir(lancamentos: readonly LancamentoBase[], hoje: string): ResumoFinanceiro {
  const vazio = (): ResumoTipo => ({ vencido: 0, hoje: 0, proximos7: 0, proximos30: 0, noMes: 0, qtdVencidos: 0 });
  const r: ResumoFinanceiro = { receber: vazio(), pagar: vazio() };
  const mes = hoje.slice(0, 7);
  for (const l of lancamentos) {
    const t = r[l.tipo];
    if (l.status === 'pago') {
      if (l.pago_em?.slice(0, 7) === mes) t.noMes += l.valor_pago_centavos ?? l.valor_centavos;
      continue;
    }
    if (l.status !== 'aberto') continue;
    const dias = diasEntre(hoje, l.vencimento);
    if (dias < 0) {
      t.vencido += l.valor_centavos;
      t.qtdVencidos++;
    } else if (dias === 0) t.hoje += l.valor_centavos;
    if (dias >= 0 && dias <= 7) t.proximos7 += l.valor_centavos;
    if (dias >= 0 && dias <= 30) t.proximos30 += l.valor_centavos;
  }
  return r;
}

// ---------------------------------------------------------------------------
// Fluxo de caixa
// ---------------------------------------------------------------------------

export interface PeriodoFluxo {
  inicio: string;
  fim: string;
  /** Recebido e pago de fato (pela data da baixa). */
  entradas: number;
  saidas: number;
  /** Ainda em aberto, pelo vencimento (o vencido em aberto entra no primeiro período). */
  aReceber: number;
  aPagar: number;
  /** Saldo no fim do período, contando o realizado e o previsto. */
  saldo: number;
}

/**
 * Fluxo de caixa de `de` a `ate`, em períodos de `dias` (7 = semanas) ou
 * por mês. `saldoInicial` é o saldo das contas no começo de `de`.
 */
export function fluxoDeCaixa(lancamentos: readonly LancamentoBase[], saldoInicial: number, de: string, ate: string, periodo: number | 'mes'): PeriodoFluxo[] {
  if (de > ate) throw new ErroFinanceiro('O início vem depois do fim.');
  const periodos: PeriodoFluxo[] = [];
  let inicio = de;
  while (inicio <= ate && periodos.length < 400) {
    const proximo = periodo === 'mes' ? somarMeses(`${inicio.slice(0, 7)}-01`, 1) : somarDias(inicio, periodo);
    const fim = somarDias(proximo, -1) < ate ? somarDias(proximo, -1) : ate;
    periodos.push({ inicio, fim, entradas: 0, saidas: 0, aReceber: 0, aPagar: 0, saldo: 0 });
    inicio = proximo;
  }
  const onde = (data: string) => periodos.findIndex((p) => data >= p.inicio && data <= p.fim);
  for (const l of lancamentos) {
    if (l.status === 'pago' && l.pago_em) {
      const i = onde(l.pago_em);
      if (i < 0) continue;
      const v = l.valor_pago_centavos ?? l.valor_centavos;
      if (l.tipo === 'receber') periodos[i]!.entradas += v;
      else periodos[i]!.saidas += v;
    } else if (l.status === 'aberto') {
      const i = l.vencimento < de ? 0 : onde(l.vencimento);
      if (i < 0) continue;
      if (l.tipo === 'receber') periodos[i]!.aReceber += l.valor_centavos;
      else periodos[i]!.aPagar += l.valor_centavos;
    }
  }
  let saldo = saldoInicial;
  for (const p of periodos) {
    saldo += p.entradas - p.saidas + p.aReceber - p.aPagar;
    p.saldo = saldo;
  }
  return periodos;
}

/** Saldo de uma conta: inicial mais o que entrou e menos o que saiu por ela (lançamentos pagos). */
export function saldoDaConta(contaId: string, saldoInicial: number, lancamentos: readonly LancamentoBase[], ate?: string): number {
  let s = saldoInicial;
  for (const l of lancamentos) {
    if (l.status !== 'pago' || l.conta_id !== contaId || !l.pago_em || (ate && l.pago_em > ate)) continue;
    const v = l.valor_pago_centavos ?? l.valor_centavos;
    s += l.tipo === 'receber' ? v : -v;
  }
  return s;
}

/** "R$ 1.234,56" */
export function formatarReais(centavos: number): string {
  const negativo = centavos < 0;
  const abs = Math.abs(centavos);
  const inteiro = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '−' : ''}R$ ${inteiro},${String(abs % 100).padStart(2, '0')}`;
}
