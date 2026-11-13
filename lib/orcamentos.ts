import type { LinhaCusto } from '@marcenaria/core';
import { supabase } from './supabase';
import type { Papel } from './tipos';

export type StatusOrcamento = 'emitido' | 'aprovado' | 'recusado' | 'cancelado';

export const NOME_STATUS: Record<StatusOrcamento, string> = { emitido: 'Emitido', aprovado: 'Aprovado', recusado: 'Recusado', cancelado: 'Cancelado' };

/** Produção não vê preços. */
export const podeVerOrcamentos = (papel: Papel) => papel !== 'producao';

/** O que fica gravado no orçamento emitido. */
export interface DadosOrcamento {
  empresa: string;
  /** Resumo do móvel, em linhas de texto para a proposta. */
  descricao: string[];
  linhas: LinhaCusto[];
  custoCentavos: number;
  margemCentesimos: number;
  margemCentavos: number;
  precoCentavos: number;
  descontoCentesimos: number;
  descontoCentavos: number;
  totalCentavos: number;
  condicoes: string;
}

export interface Orcamento {
  id: string;
  numero: number;
  projeto_id: string | null;
  projeto_versao: number;
  projeto_nome: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  dados: DadosOrcamento;
  custo_centavos: number;
  total_centavos: number;
  validade: string;
  status: StatusOrcamento;
  observacao: string | null;
  created_at: string;
  autor: { nome: string | null; email: string } | null;
}

const COLUNAS = 'id, numero, projeto_id, projeto_versao, projeto_nome, cliente_id, cliente_nome, dados, custo_centavos, total_centavos, validade, status, observacao, created_at, autor:usuarios(nome, email)';

const converter = (o: unknown): Orcamento => {
  const x = o as Orcamento;
  return { ...x, custo_centavos: Number(x.custo_centavos), total_centavos: Number(x.total_centavos) };
};

export const chavesOrcamentos = {
  lista: (empresaId: string) => ['orcamentos', empresaId] as const,
  um: (id: string) => ['orcamento', id] as const,
};

export async function buscarOrcamentos(empresaId: string): Promise<Orcamento[]> {
  const { data, error } = await supabase.from('orcamentos').select(COLUNAS).eq('empresa_id', empresaId).order('numero', { ascending: false }).limit(1000);
  if (error) throw error;
  return (data ?? []).map(converter);
}

export async function buscarOrcamento(id: string): Promise<Orcamento | null> {
  const { data, error } = await supabase.from('orcamentos').select(COLUNAS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? converter(data) : null;
}

export async function emitirOrcamento(p: {
  empresaId: string;
  projetoId: string;
  projetoVersao: number;
  projetoNome: string;
  clienteId: string | null;
  clienteNome: string | null;
  dados: DadosOrcamento;
  validade: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('orcamentos')
    .insert({
      empresa_id: p.empresaId,
      numero: 1, // o banco numera
      projeto_id: p.projetoId,
      projeto_versao: p.projetoVersao,
      projeto_nome: p.projetoNome,
      cliente_id: p.clienteId,
      cliente_nome: p.clienteNome,
      dados: p.dados,
      custo_centavos: p.dados.custoCentavos,
      total_centavos: p.dados.totalCentavos,
      validade: p.validade,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function mudarStatus(id: string, status: StatusOrcamento) {
  const { error } = await supabase.from('orcamentos').update({ status }).eq('id', id);
  if (error) throw error;
}

export const numeroOrcamento = (n: number) => `Nº ${String(n).padStart(4, '0')}`;

export function formatarDia(iso: string): string {
  // Datas puras (AAAA-MM-DD) não passam por fuso.
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Data de hoje + dias, no fuso de quem usa, como AAAA-MM-DD. */
export function dataMais(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
