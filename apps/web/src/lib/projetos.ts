import { supabase } from './supabase';
import type { Papel } from './tipos';

export interface Projeto {
  id: string;
  nome: string;
  cliente_id: string | null;
  versao_atual: number;
  arquivado: boolean;
  created_at: string;
  updated_at: string;
  cliente: { id: string; nome: string } | null;
}

export interface VersaoProjeto {
  id: string;
  numero: number;
  dados: unknown;
  regras: string;
  valido: boolean;
  observacao: string | null;
  created_at: string;
  autor: { nome: string | null; email: string } | null;
}

export const podeEditarProjetos = (papel: Papel) => papel !== 'producao';

export const chavesProjetos = {
  lista: (empresaId: string) => ['projetos', empresaId] as const,
  projeto: (id: string) => ['projeto', id] as const,
  versoes: (id: string) => ['projeto', id, 'versoes'] as const,
};

const COLUNAS = 'id, nome, cliente_id, versao_atual, arquivado, created_at, updated_at, cliente:clientes(id, nome)';

export async function buscarProjetos(empresaId: string): Promise<Projeto[]> {
  const { data, error } = await supabase.from('projetos').select(COLUNAS).eq('empresa_id', empresaId).order('updated_at', { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as Projeto[];
}

export async function buscarProjeto(id: string): Promise<Projeto | null> {
  const { data, error } = await supabase.from('projetos').select(COLUNAS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as unknown as Projeto | null;
}

export async function buscarVersoes(projetoId: string): Promise<VersaoProjeto[]> {
  const { data, error } = await supabase
    .from('projeto_versoes')
    .select('id, numero, dados, regras, valido, observacao, created_at, autor:usuarios(nome, email)')
    .eq('projeto_id', projetoId)
    .order('numero', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as VersaoProjeto[];
}

export async function criarProjeto(p: { empresaId: string; nome: string; clienteId: string | null; dados: unknown; regras: string; valido: boolean }): Promise<string> {
  const { data, error } = await supabase.rpc('criar_projeto', {
    p_empresa: p.empresaId,
    p_nome: p.nome,
    p_cliente: p.clienteId,
    p_dados: p.dados,
    p_regras: p.regras,
    p_valido: p.valido,
  });
  if (error) throw error;
  return data as string;
}

/** Grava uma nova versão; o banco dá o número. */
export async function salvarVersao(p: { empresaId: string; projetoId: string; dados: unknown; regras: string; valido: boolean; observacao: string | null }): Promise<number> {
  const { data, error } = await supabase
    .from('projeto_versoes')
    .insert({ empresa_id: p.empresaId, projeto_id: p.projetoId, numero: 1, dados: p.dados, regras: p.regras, valido: p.valido, observacao: p.observacao })
    .select('numero')
    .single();
  if (error) throw error;
  return (data as { numero: number }).numero;
}

export async function atualizarProjeto(id: string, campos: { nome?: string; cliente_id?: string | null; arquivado?: boolean }) {
  const { error } = await supabase.from('projetos').update(campos).eq('id', id);
  if (error) throw error;
}

export async function excluirProjeto(id: string) {
  const { error } = await supabase.from('projetos').delete().eq('id', id);
  if (error) throw error;
}

export function formatarData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
