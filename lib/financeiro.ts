import type { FormaPagamento, Parcela, StatusLancamento, TipoLancamento } from '@marcenaria/core';
import { supabase } from './supabase';
import type { Papel } from './tipos';

/** Dinheiro é assunto do dono. */
export const podeVerFinanceiro = (papel: Papel) => papel === 'dono';

export interface Lancamento {
  id: string;
  empresa_id: string;
  tipo: TipoLancamento;
  descricao: string;
  valor_centavos: number;
  vencimento: string;
  status: StatusLancamento;
  pago_em: string | null;
  valor_pago_centavos: number | null;
  forma: FormaPagamento | null;
  conta_id: string | null;
  categoria_id: string | null;
  cliente_id: string | null;
  fornecedor_id: string | null;
  orcamento_id: string | null;
  grupo: string | null;
  parcela: number | null;
  parcelas: number | null;
  documento: string | null;
  observacao: string | null;
  boleto: BoletoLancamento | null;
  cliente?: { nome: string } | null;
  fornecedor?: { nome: string } | null;
  categoria?: { nome: string } | null;
}

/** Boleto emitido pelo Mercado Pago da marcenaria (preenchido pela função do servidor). */
export interface BoletoLancamento {
  id: string;
  status: string;
  url: string | null;
  linha: string | null;
  vencimento: string | null;
  emitido_em: string;
}

export interface ContaFinanceira {
  id: string;
  nome: string;
  saldo_inicial_centavos: number;
  ativa: boolean;
}

export interface Categoria {
  id: string;
  tipo: TipoLancamento;
  nome: string;
  ativa: boolean;
}

export const chavesFinanceiro = {
  lancamentos: (empresaId: string) => ['lancamentos', empresaId] as const,
  contas: (empresaId: string) => ['contas-financeiras', empresaId] as const,
  categorias: (empresaId: string) => ['categorias-financeiras', empresaId] as const,
  saldos: (empresaId: string) => ['saldos-contas', empresaId] as const,
  doOrcamento: (orcamentoId: string) => ['lancamentos-orcamento', orcamentoId] as const,
};

const COLUNAS =
  'id, empresa_id, tipo, descricao, valor_centavos, vencimento, status, pago_em, valor_pago_centavos, forma, conta_id, categoria_id, cliente_id, fornecedor_id, orcamento_id, grupo, parcela, parcelas, documento, observacao, boleto, cliente:clientes(nome), fornecedor:fornecedores(nome), categoria:categorias_financeiras(nome)';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
function normalizar(l: Record<string, unknown>): Lancamento {
  return { ...(l as unknown as Lancamento), valor_centavos: Number(l.valor_centavos), valor_pago_centavos: num(l.valor_pago_centavos) };
}

/** Tudo em aberto e o que foi pago ou cancelado a partir de `desde` (para o fluxo e o histórico). */
export async function buscarLancamentos(empresaId: string, desde: string): Promise<Lancamento[]> {
  const { data, error } = await supabase
    .from('lancamentos')
    .select(COLUNAS)
    .eq('empresa_id', empresaId)
    .or(`status.eq.aberto,vencimento.gte.${desde},pago_em.gte.${desde}`)
    .order('vencimento')
    .limit(10000);
  if (error) throw error;
  return (data ?? []).map((l) => normalizar(l as Record<string, unknown>));
}

export async function buscarLancamentosDoOrcamento(orcamentoId: string): Promise<Lancamento[]> {
  const { data, error } = await supabase.from('lancamentos').select(COLUNAS).eq('orcamento_id', orcamentoId).order('vencimento');
  if (error) throw error;
  return (data ?? []).map((l) => normalizar(l as Record<string, unknown>));
}

export async function buscarContas(empresaId: string): Promise<ContaFinanceira[]> {
  const { data, error } = await supabase.from('contas_financeiras').select('id, nome, saldo_inicial_centavos, ativa').eq('empresa_id', empresaId).order('nome');
  if (error) throw error;
  return (data ?? []).map((c) => ({ ...(c as ContaFinanceira), saldo_inicial_centavos: Number(c.saldo_inicial_centavos) }));
}

export async function buscarSaldos(empresaId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('saldos_contas').select('conta_id, saldo_centavos').eq('empresa_id', empresaId);
  if (error) throw error;
  return new Map((data ?? []).map((s) => [s.conta_id as string, Number(s.saldo_centavos)]));
}

export async function buscarCategorias(empresaId: string): Promise<Categoria[]> {
  const { data, error } = await supabase.from('categorias_financeiras').select('id, tipo, nome, ativa').eq('empresa_id', empresaId).order('nome');
  if (error) throw error;
  return (data ?? []) as Categoria[];
}

export async function salvarConta(empresaId: string, c: { id?: string; nome: string; saldo_inicial_centavos: number; ativa: boolean }) {
  const { error } = c.id
    ? await supabase.from('contas_financeiras').update({ nome: c.nome, saldo_inicial_centavos: c.saldo_inicial_centavos, ativa: c.ativa }).eq('id', c.id)
    : await supabase.from('contas_financeiras').insert({ empresa_id: empresaId, nome: c.nome, saldo_inicial_centavos: c.saldo_inicial_centavos, ativa: c.ativa });
  if (error) throw error;
}

export async function salvarCategoria(empresaId: string, c: { id?: string; tipo: TipoLancamento; nome: string; ativa: boolean }) {
  const { error } = c.id
    ? await supabase.from('categorias_financeiras').update({ nome: c.nome, ativa: c.ativa }).eq('id', c.id)
    : await supabase.from('categorias_financeiras').insert({ empresa_id: empresaId, tipo: c.tipo, nome: c.nome, ativa: c.ativa });
  if (error) throw error;
}

export interface NovoLancamento {
  tipo: TipoLancamento;
  descricao: string;
  categoria_id: string | null;
  cliente_id: string | null;
  fornecedor_id: string | null;
  orcamento_id: string | null;
  documento: string | null;
  observacao: string | null;
}

/** Cria as parcelas de uma vez (mesmo grupo quando há mais de uma). */
export async function criarLancamentos(empresaId: string, base: NovoLancamento, parcelas: readonly Parcela[]): Promise<void> {
  const grupo = parcelas.length > 1 ? crypto.randomUUID() : null;
  const total = parcelas.filter((p) => p.numero > 0).length;
  const linhas = parcelas.map((p) => ({
    empresa_id: empresaId,
    ...base,
    descricao:
      parcelas.length > 1 ? `${base.descricao.slice(0, 180)} · ${p.numero === 0 ? 'entrada' : `${p.numero}/${total}`}` : base.descricao,
    valor_centavos: p.valorCentavos,
    vencimento: p.vencimento,
    grupo,
    parcela: parcelas.length > 1 ? p.numero : null,
    parcelas: parcelas.length > 1 ? total : null,
  }));
  const { error } = await supabase.from('lancamentos').insert(linhas);
  if (error) throw error;
}

export async function editarLancamento(
  id: string,
  campos: Partial<Pick<Lancamento, 'descricao' | 'valor_centavos' | 'vencimento' | 'categoria_id' | 'cliente_id' | 'fornecedor_id' | 'documento' | 'observacao'>>,
) {
  const { error } = await supabase.from('lancamentos').update(campos).eq('id', id);
  if (error) throw error;
}

export async function baixarLancamento(p: { id: string; pagoEm: string; valorCentavos: number; contaId: string | null; forma: FormaPagamento; parcial: boolean }) {
  const { error } = await supabase.rpc('baixar_lancamento', {
    p_id: p.id,
    p_pago_em: p.pagoEm,
    p_valor_centavos: p.valorCentavos,
    p_conta: p.contaId,
    p_forma: p.forma,
    p_parcial: p.parcial,
  });
  if (error) throw error;
}

export async function estornarLancamento(id: string) {
  const { error } = await supabase.rpc('estornar_lancamento', { p_id: id });
  if (error) throw error;
}

export async function cancelarLancamento(id: string, cancelar = true) {
  const { error } = await supabase.rpc('cancelar_lancamento', { p_id: id, p_cancelar: cancelar });
  if (error) throw error;
}

export async function excluirLancamento(id: string) {
  const { error } = await supabase.from('lancamentos').delete().eq('id', id);
  if (error) throw error;
}

/** Planilha (CSV com ponto e vírgula, como o Excel em português abre) para o contador. */
export function csvDosLancamentos(lista: readonly Lancamento[], nomeConta: (id: string | null) => string): string {
  const cab = ['Tipo', 'Descrição', 'Cliente/Fornecedor', 'Categoria', 'Vencimento', 'Valor', 'Situação', 'Pago em', 'Valor pago', 'Forma', 'Conta', 'Documento', 'Observação'];
  const reais = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2).replace('.', ','));
  const dia = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');
  const campo = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const linhas = lista.map((l) =>
    [
      l.tipo === 'receber' ? 'A receber' : 'A pagar',
      l.descricao,
      l.cliente?.nome ?? l.fornecedor?.nome ?? '',
      l.categoria?.nome ?? '',
      dia(l.vencimento),
      reais(l.valor_centavos),
      { aberto: 'Em aberto', pago: 'Pago', cancelado: 'Cancelado' }[l.status],
      dia(l.pago_em),
      reais(l.valor_pago_centavos),
      l.forma ?? '',
      l.conta_id ? nomeConta(l.conta_id) : '',
      l.documento ?? '',
      l.observacao ?? '',
    ]
      .map((v) => campo(String(v)))
      .join(';'),
  );
  return `﻿${[cab.join(';'), ...linhas].join('\r\n')}\r\n`;
}
