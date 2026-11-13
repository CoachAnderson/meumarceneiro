import { supabase } from './supabase';

/** Etapas de uma peça na oficina, na ordem do trabalho. */
export type Etapa = 'a_cortar' | 'cortada' | 'fitada' | 'furada' | 'montada';

export const ETAPAS: readonly Etapa[] = ['a_cortar', 'cortada', 'fitada', 'furada', 'montada'];

export const NOME_ETAPA: Record<Etapa, string> = {
  a_cortar: 'A cortar',
  cortada: 'Cortada',
  fitada: 'Fitada',
  furada: 'Furada',
  montada: 'Montada',
};

/** Botão para levar a peça a cada etapa. */
export const ACAO_ETAPA: Record<Etapa, string> = {
  a_cortar: 'Voltar para "a cortar"',
  cortada: 'Cortei',
  fitada: 'Passei a fita',
  furada: 'Furei',
  montada: 'Montei',
};

export interface PecaOrdem {
  id: string;
  empresa_id: string;
  ordem_id: string;
  seq: number;
  componente: string;
  unidade: number;
  codigo: string;
  nome: string;
  tem_fita: boolean;
  tem_furo: boolean;
  etapa: Etapa;
  etapa_em: string | null;
  quem: { nome: string } | null;
}

export interface EventoPeca {
  id: number;
  de: Etapa;
  para: Etapa;
  em: string;
  quem: { nome: string } | null;
}

/** Etapas que se aplicam à peça: sem fita, pula "fitada"; sem furo, pula "furada". */
export function etapasDaPeca(p: Pick<PecaOrdem, 'tem_fita' | 'tem_furo'>): Etapa[] {
  return ETAPAS.filter((e) => (e !== 'fitada' || p.tem_fita) && (e !== 'furada' || p.tem_furo));
}

/** A próxima etapa do trabalho; null quando já está montada. */
export function proximaEtapa(p: Pick<PecaOrdem, 'tem_fita' | 'tem_furo' | 'etapa'>): Etapa | null {
  const lista = etapasDaPeca(p);
  const atual = ETAPAS.indexOf(p.etapa);
  return lista.find((e) => ETAPAS.indexOf(e) > atual) ?? null;
}

/** A peça já passou (ou está) nesta etapa? */
export const chegou = (p: Pick<PecaOrdem, 'etapa'>, e: Etapa) => ETAPAS.indexOf(p.etapa) >= ETAPAS.indexOf(e);

export interface Andamento {
  total: number;
  cortadas: number;
  com_fita: number;
  fitadas: number;
  com_furo: number;
  furadas: number;
  montadas: number;
}

/** Contagem por etapa, só entre as peças em que a etapa se aplica (igual à view andamento_ordens). */
export function andamento(pecas: readonly PecaOrdem[]): Andamento {
  const n = (f: (p: PecaOrdem) => boolean) => pecas.filter(f).length;
  return {
    total: pecas.length,
    cortadas: n((p) => chegou(p, 'cortada')),
    com_fita: n((p) => p.tem_fita),
    fitadas: n((p) => p.tem_fita && chegou(p, 'fitada')),
    com_furo: n((p) => p.tem_furo),
    furadas: n((p) => p.tem_furo && chegou(p, 'furada')),
    montadas: n((p) => p.etapa === 'montada'),
  };
}

export const linkDaPeca = (id: string) => `${window.location.origin}/oficina/p/${id}`;

const COLUNAS = 'id, empresa_id, ordem_id, seq, componente, unidade, codigo, nome, tem_fita, tem_furo, etapa, etapa_em, quem:usuarios(nome)';

export const chavesOficina = {
  daOrdem: (ordemId: string) => ['pecas-ordem', ordemId] as const,
  peca: (id: string) => ['peca-ordem', id] as const,
  andamento: (empresaId: string) => ['andamento-ordens', empresaId] as const,
};

export async function buscarPecasDaOrdem(ordemId: string): Promise<PecaOrdem[]> {
  const { data, error } = await supabase.from('pecas_ordem').select(COLUNAS).eq('ordem_id', ordemId).order('seq').limit(5000);
  if (error) throw error;
  return (data ?? []) as unknown as PecaOrdem[];
}

export async function buscarPeca(id: string): Promise<{ peca: PecaOrdem; eventos: EventoPeca[] } | null> {
  const { data, error } = await supabase.from('pecas_ordem').select(COLUNAS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const ev = await supabase.from('pecas_ordem_eventos').select('id, de, para, em, quem:usuarios(nome)').eq('peca_id', id).order('em', { ascending: false }).limit(50);
  if (ev.error) throw ev.error;
  return { peca: data as unknown as PecaOrdem, eventos: (ev.data ?? []) as unknown as EventoPeca[] };
}

export async function buscarAndamentos(empresaId: string): Promise<Map<string, Andamento>> {
  const { data, error } = await supabase.from('andamento_ordens').select('ordem_id, total, cortadas, com_fita, fitadas, com_furo, furadas, montadas').eq('empresa_id', empresaId).limit(2000);
  if (error) throw error;
  return new Map(((data ?? []) as Array<Andamento & { ordem_id: string }>).map(({ ordem_id, ...a }) => [ordem_id, a]));
}

/** Marca a etapa de uma ou mais peças. Devolve quantas mudaram. */
export async function marcarEtapa(ids: readonly string[], etapa: Etapa): Promise<number> {
  const { data, error } = await supabase.rpc('marcar_etapa_pecas', { p_pecas: ids, p_etapa: etapa });
  if (error) throw error;
  return data as number;
}

/** UUID do QR (o link da etiqueta). */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
