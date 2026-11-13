import { supabase } from './supabase';

/** Erro da função cobranca, com a mensagem pronta para o dono. */
export class ErroCobranca extends Error {
  constructor(
    mensagem: string,
    readonly codigo: string,
  ) {
    super(mensagem);
    this.name = 'ErroCobranca';
  }
}

/** Chama a função de servidor de boleto e nota fiscal. */
export async function chamarCobranca(corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('cobranca', { body: corpo });
  if (error) {
    const resposta = (error as { context?: unknown }).context;
    if (resposta instanceof Response) {
      const c = (await resposta.json().catch(() => null)) as { erro?: string; codigo?: string } | null;
      if (c?.erro) throw new ErroCobranca(c.erro, c.codigo ?? 'erro');
      if (resposta.status === 404) throw new ErroCobranca('Boleto e nota ainda não foram publicados neste sistema (função cobranca).', 'sem_funcao');
    }
    throw new ErroCobranca('Não foi possível falar com o servidor. Confira a internet e tente de novo.', 'rede');
  }
  return (data ?? {}) as Record<string, unknown>;
}

export type Provedor = 'mercado_pago' | 'focus_nfe';

export interface Integracao {
  provedor: Provedor;
  ambiente: 'teste' | 'producao';
  final: string;
  dados: Record<string, unknown>;
  updated_at: string;
}

export const chaveIntegracoes = (empresaId: string) => ['integracoes', empresaId] as const;

export async function buscarIntegracoes(empresaId: string): Promise<Integracao[]> {
  const { data, error } = await supabase.from('integracoes').select('provedor, ambiente, final, dados, updated_at').eq('empresa_id', empresaId);
  if (error) throw error;
  return (data ?? []) as Integracao[];
}

export interface NotaFiscal {
  id: string;
  tipo: 'nfe' | 'nfse';
  ambiente: 'teste' | 'producao';
  orcamento_id: string | null;
  valor_centavos: number;
  status: string;
  numero: string | null;
  serie: string | null;
  chave: string | null;
  url_pdf: string | null;
  url_xml: string | null;
  mensagem: string | null;
  created_at: string;
}

export const chaveNotas = (orcamentoId: string) => ['notas-fiscais', orcamentoId] as const;

export async function buscarNotasDoOrcamento(orcamentoId: string): Promise<NotaFiscal[]> {
  const { data, error } = await supabase
    .from('notas_fiscais')
    .select('id, tipo, ambiente, orcamento_id, valor_centavos, status, numero, serie, chave, url_pdf, url_xml, mensagem, created_at')
    .eq('orcamento_id', orcamentoId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((n) => ({ ...(n as NotaFiscal), valor_centavos: Number(n.valor_centavos) }));
}

export const NOME_STATUS_NOTA: Record<string, string> = {
  enviando: 'Enviando',
  processando_autorizacao: 'Aguardando a SEFAZ',
  autorizado: 'Autorizada',
  cancelado: 'Cancelada',
  erro_autorizacao: 'Recusada',
  denegado: 'Denegada',
  erro_envio: 'Não enviada',
};

/** Endereço do aviso de pagamento que a marcenaria cola no Mercado Pago dela. */
export const enderecoAvisoBoleto = (empresaId: string) => `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/boleto-aviso?empresa=${empresaId}`;
