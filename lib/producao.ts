import type { ChapaCortada, ModeloMontagem, PecaCorte, VeioChapa } from '@marcenaria/core';
import { supabase } from './supabase';
import type { Papel } from './tipos';

export type StatusOrdem = 'aguardando' | 'em_corte' | 'em_montagem' | 'concluida' | 'cancelada';

export const NOME_STATUS_ORDEM: Record<StatusOrdem, string> = {
  aguardando: 'Aguardando',
  em_corte: 'Em corte',
  em_montagem: 'Em montagem',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

/** Ordem natural do trabalho na oficina. */
export const FLUXO: StatusOrdem[] = ['aguardando', 'em_corte', 'em_montagem', 'concluida'];

export const podeCriarOrdem = (papel: Papel) => papel === 'dono' || papel === 'projetista';
export const podeTocarOrdem = (papel: Papel) => papel !== 'vendas';
export const podeEstornar = (papel: Papel) => papel === 'dono' || papel === 'projetista';

export interface Consumo {
  chapas: Array<{ id: string; quantidade: number; nome: string }>;
  retalhos: Array<{ id: string; quantidade: number; nome: string }>;
  fitas: Array<{ id: string; dmm: number; nome: string }>;
  ferragens: Array<{ id: string; quantidade: number; nome: string }>;
  sobras: Array<{ material_id: string; comprimento_dmm: number; largura_dmm: number; quantidade: number; nome: string }>;
}

/** Fotografia que vai para a oficina. Sem preços. */
export interface DadosOrdem {
  quantidadeModulos: number;
  itens: Array<{ codigo: string; nome: string; material: string; quantidade: number; acabada: string; corte: string; fita: string; usinagem: string }>;
  grupos: Array<{ material: string; veio: VeioChapa; pecas: PecaCorte[]; chapas: ChapaCortada[] }>;
  ferragens: Array<{ descricao: string; quantidade: number; item: string | null }>;
  consumo: Consumo;
  /** Uma por peça a cortar (e por módulo): vira a etiqueta com QR. Ordens antigas não têm. */
  etiquetas?: EtiquetaOrdem[];
  /** Forma do móvel, furação e junções: o 3D e a furação da peça no celular da oficina. */
  modelo?: ModeloMontagem;
}

export interface EtiquetaOrdem {
  componente: string;
  unidade: number;
  codigo: string;
  nome: string;
  fita: boolean;
  furo: boolean;
}

/** Limite do banco para os dados da ordem é 1 MB; o modelo 3D sai antes de passar disso. */
export const LIMITE_DADOS_ORDEM = 900_000;

export interface Ordem {
  id: string;
  numero: number;
  projeto_id: string | null;
  projeto_versao: number;
  projeto_nome: string;
  cliente_nome: string | null;
  dados: DadosOrdem;
  status: StatusOrdem;
  prazo: string | null;
  observacao: string | null;
  baixa_em: string | null;
  created_at: string;
}

const COLUNAS = 'id, numero, projeto_id, projeto_versao, projeto_nome, cliente_nome, dados, status, prazo, observacao, baixa_em, created_at';
const RESUMO = 'id, numero, projeto_id, projeto_versao, projeto_nome, cliente_nome, status, prazo, observacao, baixa_em, created_at';

export const chavesProducao = {
  lista: (empresaId: string) => ['ordens', empresaId] as const,
  uma: (id: string) => ['ordem', id] as const,
};

export async function buscarOrdens(empresaId: string): Promise<Array<Omit<Ordem, 'dados'>>> {
  const { data, error } = await supabase.from('ordens_producao').select(RESUMO).eq('empresa_id', empresaId).order('numero', { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []) as Array<Omit<Ordem, 'dados'>>;
}

export async function buscarOrdem(id: string): Promise<Ordem | null> {
  const { data, error } = await supabase.from('ordens_producao').select(COLUNAS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Ordem | null;
}

export async function criarOrdem(p: { empresaId: string; projetoId: string; projetoVersao: number; projetoNome: string; clienteNome: string | null; dados: DadosOrdem; prazo: string | null; observacao: string | null }): Promise<string> {
  const { data, error } = await supabase
    .from('ordens_producao')
    .insert({ empresa_id: p.empresaId, numero: 1, projeto_id: p.projetoId, projeto_versao: p.projetoVersao, projeto_nome: p.projetoNome, cliente_nome: p.clienteNome, dados: p.dados, prazo: p.prazo, observacao: p.observacao })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function mudarStatusOrdem(id: string, status: StatusOrdem) {
  const { error } = await supabase.from('ordens_producao').update({ status }).eq('id', id);
  if (error) throw error;
}

export interface Falta {
  tipo: 'chapa' | 'fita' | 'ferragem';
  nome: string;
  precisa: number;
  tem: number;
}

export async function baixarEstoque(id: string, forcar: boolean): Promise<{ baixado: boolean; faltas: Falta[]; sobras_guardadas?: number }> {
  const { data, error } = await supabase.rpc('baixar_estoque_ordem', { p_ordem: id, p_forcar: forcar, p_guardar_sobras: true });
  if (error) throw error;
  return data as { baixado: boolean; faltas: Falta[]; sobras_guardadas?: number };
}

export async function estornarBaixa(id: string) {
  const { error } = await supabase.rpc('estornar_baixa_ordem', { p_ordem: id });
  if (error) throw error;
}

export const numeroOrdem = (n: number) => `OP ${String(n).padStart(4, '0')}`;
