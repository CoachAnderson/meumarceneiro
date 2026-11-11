import type { CodigoOferta, SituacaoAssinatura, StatusAssinatura } from '@marcenaria/core';
import { supabase } from './supabase';

export const chaveSituacao = (empresaId: string) => ['assinatura-situacao', empresaId] as const;
export const chaveAssinatura = (empresaId: string) => ['assinatura', empresaId] as const;

/** Qualquer membro: a empresa está liberada para gravar? */
export async function buscarSituacao(empresaId: string): Promise<SituacaoAssinatura> {
  const { data, error } = await supabase.rpc('situacao_assinatura', { p_empresa: empresaId });
  if (error) throw error;
  return data as SituacaoAssinatura;
}

export interface Assinatura {
  id: string;
  status: StatusAssinatura;
  valor_centavos: number | null;
  pagador_email: string | null;
  proxima_cobranca: string | null;
  ultima_cobranca: string | null;
  paga_ate: string | null;
  created_at: string;
}

/** Só o dono enxerga (RLS). Devolve a assinatura em aberto ou, se não houver, a mais recente. */
export async function buscarAssinatura(empresaId: string): Promise<Assinatura | null> {
  const { data, error } = await supabase
    .from('assinaturas')
    .select('id, status, valor_centavos, pagador_email, proxima_cobranca, ultima_cobranca, paga_ate, created_at')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  const linhas = (data ?? []) as Assinatura[];
  return linhas.find((l) => l.status !== 'cancelada') ?? linhas[0] ?? null;
}

export class ErroAssinatura extends Error {
  constructor(
    mensagem: string,
    readonly codigo: string,
  ) {
    super(mensagem);
    this.name = 'ErroAssinatura';
  }
}

type Acao = { acao: 'assinar'; plano: CodigoOferta; email: string } | { acao: 'consultar' | 'pausar' | 'reativar' | 'cancelar' };

/** Chama a função de servidor da assinatura. As mensagens de erro já vêm prontas para o usuário. */
export async function chamarAssinatura(empresaId: string, pedido: Acao): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('assinatura', { body: { empresaId, ...pedido } });
  if (error) {
    const resposta = (error as { context?: unknown }).context;
    if (resposta instanceof Response) {
      const corpo = (await resposta.json().catch(() => null)) as { erro?: string; codigo?: string } | null;
      if (corpo?.erro) throw new ErroAssinatura(corpo.erro, corpo.codigo ?? 'erro');
      if (resposta.status === 404) throw new ErroAssinatura('A cobrança ainda não foi publicada neste sistema.', 'sem_funcao');
    }
    throw new ErroAssinatura('Não foi possível falar com o servidor. Confira a internet e tente de novo.', 'rede');
  }
  return (data ?? {}) as Record<string, unknown>;
}

/** Só segue para endereços do Mercado Pago em HTTPS (o servidor já confere; aqui é a segunda trava). */
export function enderecoDePagamento(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  try {
    const u = new URL(valor);
    return u.protocol === 'https:' && /(^|\.)mercadopago\.com(\.br)?$/.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}
