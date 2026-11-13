import type { DirecaoVeio, TipoMaterial } from '@marcenaria/catalog';
import type { Papel } from './tipos';
import { supabase } from './supabase';

export interface Fornecedor {
  id: string;
  nome: string;
  documento: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  observacoes: string | null;
  ativo: boolean;
}

export interface Chapa {
  id: string;
  material_id: string;
  comprimento_dmm: number;
  largura_dmm: number;
  preco_centavos: number | null;
  ativo: boolean;
}

export interface Material {
  id: string;
  tipo: TipoMaterial;
  nome: string;
  fabricante: string | null;
  cor_padrao: string | null;
  espessura_nominal_dmm: number;
  espessura_real_dmm: number | null;
  espessura_calculo_dmm: number;
  veio: DirecaoVeio;
  fornecedor_id: string | null;
  observacoes: string | null;
  ativo: boolean;
  chapas: Chapa[];
  fornecedor: { id: string; nome: string } | null;
}

export interface Fita {
  id: string;
  nome: string;
  fabricante: string | null;
  cor_padrao: string | null;
  largura_dmm: number;
  espessura_cmm: number;
  comprimento_rolo_dmm: number | null;
  preco_metro_centavos: number | null;
  fornecedor_id: string | null;
  observacoes: string | null;
  ativo: boolean;
  fornecedor: { id: string; nome: string } | null;
}

export const podeEditarCatalogo = (papel: Papel) => papel === 'dono' || papel === 'projetista';
export const podeAjustarEstoque = (papel: Papel) => papel === 'dono' || papel === 'projetista' || papel === 'producao';

/** PostgREST devolve bigint como número; garante o tipo mesmo se vier texto. */
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function buscarMateriais(empresaId: string): Promise<Material[]> {
  const { data, error } = await supabase
    .from('materiais')
    .select(
      'id, tipo, nome, fabricante, cor_padrao, espessura_nominal_dmm, espessura_real_dmm, espessura_calculo_dmm, veio, fornecedor_id, observacoes, ativo, chapas(id, material_id, comprimento_dmm, largura_dmm, preco_centavos, ativo), fornecedor:fornecedores(id, nome)',
    )
    .eq('empresa_id', empresaId)
    .order('nome')
    .order('espessura_nominal_dmm');
  if (error) throw error;
  return ((data ?? []) as unknown as Material[]).map((m) => ({
    ...m,
    chapas: m.chapas
      .map((c) => ({ ...c, preco_centavos: num(c.preco_centavos) }))
      .sort((a, b) => b.comprimento_dmm * b.largura_dmm - a.comprimento_dmm * a.largura_dmm),
  }));
}

export async function buscarFitas(empresaId: string): Promise<Fita[]> {
  const { data, error } = await supabase
    .from('fitas')
    .select(
      'id, nome, fabricante, cor_padrao, largura_dmm, espessura_cmm, comprimento_rolo_dmm, preco_metro_centavos, fornecedor_id, observacoes, ativo, fornecedor:fornecedores(id, nome)',
    )
    .eq('empresa_id', empresaId)
    .order('nome');
  if (error) throw error;
  return ((data ?? []) as unknown as Fita[]).map((f) => ({ ...f, preco_metro_centavos: num(f.preco_metro_centavos) }));
}

export async function buscarFornecedores(empresaId: string): Promise<Fornecedor[]> {
  const { data, error } = await supabase
    .from('fornecedores')
    .select('id, nome, documento, contato, telefone, email, observacoes, ativo')
    .eq('empresa_id', empresaId)
    .order('nome');
  if (error) throw error;
  return (data ?? []) as Fornecedor[];
}

export interface Saldos {
  chapas: Map<string, number>;
  fitas: Map<string, number>;
  ferragens: Map<string, number>;
}

export async function buscarSaldos(empresaId: string): Promise<Saldos> {
  const { data, error } = await supabase
    .from('estoque_saldos')
    .select('chapa_id, fita_id, ferragem_id, saldo')
    .eq('empresa_id', empresaId);
  if (error) throw error;
  const saldos: Saldos = { chapas: new Map(), fitas: new Map(), ferragens: new Map() };
  for (const s of (data ?? []) as Array<{ chapa_id: string | null; fita_id: string | null; ferragem_id: string | null; saldo: unknown }>) {
    if (s.ferragem_id) saldos.ferragens.set(s.ferragem_id, Number(s.saldo));
    if (s.chapa_id) saldos.chapas.set(s.chapa_id, Number(s.saldo));
    if (s.fita_id) saldos.fitas.set(s.fita_id, Number(s.saldo));
  }
  return saldos;
}

export async function definirEstoque(item: { chapa: string } | { fita: string }, saldo: number, motivo: string) {
  const { error } = await supabase.rpc('definir_estoque', {
    p_chapa: 'chapa' in item ? item.chapa : null,
    p_fita: 'fita' in item ? item.fita : null,
    p_saldo: saldo,
    p_motivo: motivo.trim() || null,
  });
  if (error) throw error;
}

export const chaves = {
  materiais: (empresaId: string) => ['materiais', empresaId] as const,
  fitas: (empresaId: string) => ['fitas', empresaId] as const,
  fornecedores: (empresaId: string) => ['fornecedores', empresaId] as const,
  saldos: (empresaId: string) => ['saldos', empresaId] as const,
};

export interface Retalho {
  id: string;
  material_id: string;
  comprimento_dmm: number;
  largura_dmm: number;
  quantidade: number;
  local: string | null;
  observacoes: string | null;
}

export const podeMexerRetalhos = (papel: Papel) => papel !== 'vendas';

export async function buscarRetalhos(empresaId: string): Promise<Retalho[]> {
  const { data, error } = await supabase
    .from('retalhos')
    .select('id, material_id, comprimento_dmm, largura_dmm, quantidade, local, observacoes')
    .eq('empresa_id', empresaId)
    .order('comprimento_dmm', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []) as Retalho[];
}

export const chaveRetalhos = (empresaId: string) => ['retalhos', empresaId] as const;

export type TipoFerragem = 'dobradica_reta' | 'dobradica_curva' | 'dobradica_supercurva' | 'corredica' | 'puxador' | 'suporte_prateleira' | 'minifix' | 'cavilha' | 'parafuso_montagem' | 'parafuso_gaveta' | 'parafuso_corredica' | 'parafuso_frente' | 'parafuso_engrosso' | 'pe_mesa' | 'parafuso_pe' | 'sapata_niveladora' | 'mao_francesa' | 'suporte_invisivel' | 'cantoneira' | 'parafuso_suporte' | 'parafuso_tampo' | 'outro';

export const NOME_TIPO_FERRAGEM: Record<TipoFerragem, string> = {
  dobradica_reta: 'Dobradiça reta',
  dobradica_curva: 'Dobradiça curva',
  dobradica_supercurva: 'Dobradiça supercurva',
  corredica: 'Corrediça',
  puxador: 'Puxador',
  suporte_prateleira: 'Suporte de prateleira',
  minifix: 'Minifix',
  cavilha: 'Cavilha',
  parafuso_montagem: 'Parafuso de montagem',
  parafuso_gaveta: 'Parafuso de montagem da gaveta',
  parafuso_corredica: 'Parafuso de corrediça',
  parafuso_frente: 'Parafuso da frente de gaveta',
  parafuso_engrosso: 'Parafuso da borda engrossada',
  pe_mesa: 'Pé de mesa',
  parafuso_pe: 'Parafuso da chapa do pé',
  sapata_niveladora: 'Sapata niveladora',
  mao_francesa: 'Mão-francesa',
  suporte_invisivel: 'Suporte invisível',
  cantoneira: 'Cantoneira',
  parafuso_suporte: 'Parafuso do suporte',
  parafuso_tampo: 'Parafuso de fixação do tampo',
  outro: 'Outro',
};

export interface Ferragem {
  id: string;
  tipo: TipoFerragem;
  nome: string;
  fabricante: string | null;
  comprimento_dmm: number | null;
  preco_centavos: number | null;
  fornecedor_id: string | null;
  observacoes: string | null;
  ativo: boolean;
}

export async function buscarFerragens(empresaId: string): Promise<Ferragem[]> {
  const { data, error } = await supabase
    .from('ferragens')
    .select('id, tipo, nome, fabricante, comprimento_dmm, preco_centavos, fornecedor_id, observacoes, ativo')
    .eq('empresa_id', empresaId)
    .order('tipo')
    .order('nome')
    .limit(2000);
  if (error) throw error;
  return ((data ?? []) as Ferragem[]).map((f) => ({ ...f, preco_centavos: num(f.preco_centavos) }));
}

export const chaveFerragens = (empresaId: string) => ['ferragens', empresaId] as const;

export async function definirEstoqueFerragem(ferragemId: string, saldo: number, motivo: string) {
  const { error } = await supabase.rpc('definir_estoque_ferragem', { p_ferragem: ferragemId, p_saldo: saldo, p_motivo: motivo.trim() || null });
  if (error) throw error;
}
