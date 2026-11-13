import { supabase } from './supabase';

export type SituacaoLicenca = 'teste' | 'ativa' | 'encerrando' | 'bloqueada';

export interface EmpresaDoPainel {
  id: string;
  nome: string;
  cnpj: string | null;
  criada_em: string;
  teste_ate: string;
  dono_nome: string | null;
  dono_email: string | null;
  usuarios: number;
  projetos: number;
  ultima_atividade: string | null;
  assinatura_status: 'pendente' | 'ativa' | 'pausada' | 'cancelada' | null;
  valor_centavos: number | null;
  ultima_cobranca: string | null;
  proxima_cobranca: string | null;
  paga_ate: string | null;
  total_pago_centavos: number;
  situacao: SituacaoLicenca;
}

export interface ResumoDoPainel {
  agora: string;
  recorrente_centavos: number;
  recebido_mes_centavos: number;
  empresas_novas_30d: number;
  cancelamentos_30d: number;
  meses: Array<{ mes: string; centavos: number; cobrancas: number }>;
}

export const chaveAdmin = (usuarioId: string | undefined) => ['admin-plataforma', usuarioId ?? ''] as const;

/** A pessoa é administradora do sistema? (A RLS só mostra a própria linha.) */
export async function ehAdministrador(usuarioId: string): Promise<boolean> {
  const { data, error } = await supabase.from('administradores_plataforma').select('usuario_id').eq('usuario_id', usuarioId).maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function buscarPainel(): Promise<{ empresas: EmpresaDoPainel[]; resumo: ResumoDoPainel }> {
  const [e, r] = await Promise.all([supabase.rpc('admin_empresas'), supabase.rpc('admin_resumo')]);
  if (e.error) throw e.error;
  if (r.error) throw r.error;
  return { empresas: (e.data ?? []) as EmpresaDoPainel[], resumo: r.data as ResumoDoPainel };
}

export async function estenderTeste(empresaId: string, dias: number): Promise<void> {
  const { error } = await supabase.rpc('admin_estender_teste', { p_empresa: empresaId, p_dias: dias });
  if (error) throw error;
}
