import type { AjusteMedidas, FalaConversa, FichaMovel } from '@marcenaria/core';
import { supabase } from './supabase';

/** Quem pode conversar pelo editor e publicar o marceneiro no link (o banco confere de novo). */
export const podeUsarMarceneiro = (papel: string) => papel !== 'producao';

export const NOME_PADRAO_MARCENEIRO = 'Marceneiro virtual';

export interface RespostaDoMarceneiro {
  resposta: string;
  encaminhar: boolean;
  ajuste: AjusteMedidas | null;
  /** Perguntas que ainda cabem no link (só no link público). */
  restantes: number | null;
}

export interface AberturaMarceneiro {
  nome: string;
  saudacao: string;
  temPreco: boolean;
  restantes: number | null;
}

export class ErroMarceneiro extends Error {
  constructor(
    mensagem: string,
    readonly codigo: string,
  ) {
    super(mensagem);
    this.name = 'ErroMarceneiro';
  }
}

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('marceneiro-virtual', { body: corpo });
  if (error) {
    const resposta = (error as { context?: unknown }).context;
    if (resposta instanceof Response) {
      const c = (await resposta.json().catch(() => null)) as { erro?: string; codigo?: string } | null;
      if (c?.erro) throw new ErroMarceneiro(c.erro, c.codigo ?? 'erro');
      if (resposta.status === 404) throw new ErroMarceneiro('O marceneiro virtual ainda não foi publicado neste sistema.', 'sem_funcao');
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ErroMarceneiro('Este aparelho está sem internet. Conecte e tente de novo.', 'rede');
    throw new ErroMarceneiro('O marceneiro virtual não respondeu. Tente de novo em instantes.', 'sem_resposta');
  }
  return data as T;
}

/** Link público: descobre se este móvel tem marceneiro virtual. null quando não tem (ou o link venceu). */
export async function abrirMarceneiro(empresaId: string, apresentacaoId: string): Promise<AberturaMarceneiro | null> {
  try {
    const d = await chamar<AberturaMarceneiro>({ modo: 'abrir', empresaId, apresentacaoId });
    return d && typeof d.nome === 'string' && typeof d.saudacao === 'string' ? d : null;
  } catch {
    // Sem marceneiro (ou função não publicada): a página mostra só o móvel.
    return null;
  }
}

function conferir(d: unknown): RespostaDoMarceneiro {
  const r = d as Partial<RespostaDoMarceneiro> | null;
  if (!r || typeof r.resposta !== 'string') throw new ErroMarceneiro('O servidor respondeu sem a fala. Tente de novo.', 'resposta');
  return { resposta: r.resposta, encaminhar: r.encaminhar === true, ajuste: r.ajuste ?? null, restantes: typeof r.restantes === 'number' ? r.restantes : null };
}

export async function perguntarPeloLink(p: { empresaId: string; apresentacaoId: string; pergunta: string; historico: FalaConversa[] }): Promise<RespostaDoMarceneiro> {
  return conferir(await chamar({ modo: 'link', ...p }));
}

export async function perguntarPeloEditor(p: { empresaId: string; ficha: FichaMovel; nome: string; pergunta: string; historico: FalaConversa[] }): Promise<RespostaDoMarceneiro> {
  return conferir(await chamar({ modo: 'editor', ...p }));
}

/** Publica o marceneiro junto com o link do móvel (mesmo identificador do arquivo 3D). */
export async function publicarApresentacao(p: { id: string; empresaId: string; nome: string; ficha: FichaMovel }): Promise<void> {
  const { error } = await supabase.from('apresentacoes').insert({ id: p.id, empresa_id: p.empresaId, nome_assistente: p.nome, ficha: p.ficha });
  if (error) throw new ErroMarceneiro(error.hint === 'assinatura' ? 'A assinatura não está ativa: o link foi criado sem o marceneiro virtual.' : 'Não foi possível incluir o marceneiro virtual no link.', 'publicar');
}
