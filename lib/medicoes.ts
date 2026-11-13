/**
 * Medições no local: gravação no servidor e no próprio aparelho.
 *
 * Na casa do cliente o sinal costuma falhar. Tudo o que se digita vai antes
 * para o aparelho (localStorage) e as fotos ficam guardadas nele (IndexedDB)
 * até subir. Quando há sinal, a medição e as fotos são enviadas sozinhas.
 */
import type { DadosMedicao } from '@marcenaria/core';
import { supabase } from './supabase';
// Import direto (não sob demanda): sem sinal, um pedaço do site baixado depois não chegaria.
import { prepararImagem } from './visao';

export type StatusMedicao = 'em_andamento' | 'concluida';

export interface MedicaoServidor {
  id: string;
  empresa_id: string;
  cliente_id: string | null;
  titulo: string;
  endereco: string | null;
  status: StatusMedicao;
  dados: DadosMedicao;
  versao: number;
  updated_at: string;
  cliente?: { nome: string } | null;
  autor?: { nome: string } | null;
}

/** O que fica no aparelho. */
export interface RegistroLocal {
  id: string;
  empresaId: string;
  clienteId: string | null;
  titulo: string;
  endereco: string | null;
  status: StatusMedicao;
  dados: DadosMedicao;
  /** Versão do servidor que este registro conhece; null = ainda não foi enviado. */
  versao: number | null;
  /** Há mudança que o servidor ainda não tem. */
  pendente: boolean;
  alteradoEm: string;
}

export const NOME_STATUS_MEDICAO: Record<StatusMedicao, string> = { em_andamento: 'Em andamento', concluida: 'Concluída' };

const BALDE = 'medicoes';
const COLUNAS = 'id, empresa_id, cliente_id, titulo, endereco, status, dados, versao, updated_at, cliente:clientes(nome), autor:usuarios!medicoes_criado_por_fkey(nome)';

export const chavesMedicao = {
  lista: (empresaId: string) => ['medicoes', empresaId] as const,
  uma: (id: string) => ['medicao', id] as const,
  foto: (caminho: string) => ['foto-medicao', caminho] as const,
};

// ---------------------------------------------------------------------------
// No aparelho
// ---------------------------------------------------------------------------

const chaveRegistro = (id: string) => `marcenaria:medicao:${id}`;
const chaveIndice = (empresaId: string) => `marcenaria:medicoes:${empresaId}`;

function ler<T>(chave: string): T | null {
  try {
    const v = localStorage.getItem(chave);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

/** Grava no aparelho. false se o armazenamento está cheio ou bloqueado. */
export function guardarLocal(r: RegistroLocal): boolean {
  try {
    localStorage.setItem(chaveRegistro(r.id), JSON.stringify(r));
    const indice = new Set(ler<string[]>(chaveIndice(r.empresaId)) ?? []);
    indice.add(r.id);
    localStorage.setItem(chaveIndice(r.empresaId), JSON.stringify([...indice]));
    return true;
  } catch {
    return false;
  }
}

export const lerLocal = (id: string) => ler<RegistroLocal>(chaveRegistro(id));

export function esquecerLocal(empresaId: string, id: string) {
  try {
    localStorage.removeItem(chaveRegistro(id));
    const indice = (ler<string[]>(chaveIndice(empresaId)) ?? []).filter((x) => x !== id);
    localStorage.setItem(chaveIndice(empresaId), JSON.stringify(indice));
  } catch {
    // Nada a fazer.
  }
}

/** Medições deste aparelho que ainda têm algo por enviar. */
export function pendentesLocais(empresaId: string): RegistroLocal[] {
  return (ler<string[]>(chaveIndice(empresaId)) ?? []).map(lerLocal).filter((r): r is RegistroLocal => !!r && r.pendente);
}

export function doServidor(m: MedicaoServidor): RegistroLocal {
  return { id: m.id, empresaId: m.empresa_id, clienteId: m.cliente_id, titulo: m.titulo, endereco: m.endereco, status: m.status, dados: m.dados, versao: m.versao, pendente: false, alteradoEm: m.updated_at };
}

// Fotos que ainda não subiram: IndexedDB (cabe muito mais que o localStorage).
const BANCO = 'marcenaria-fotos';
function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('fotos');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
}
async function operar<T>(modo: IDBTransactionMode, fazer: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrirBanco();
  return new Promise((ok, erro) => {
    const t = db.transaction('fotos', modo);
    const r = fazer(t.objectStore('fotos'));
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
    t.oncomplete = () => db.close();
  });
}
export const guardarFotoLocal = (id: string, foto: Blob) => operar('readwrite', (s) => s.put(foto, id)).then(() => undefined);
export const lerFotoLocal = (id: string) => operar<Blob | undefined>('readonly', (s) => s.get(id)).catch(() => undefined);
export const apagarFotoLocal = (id: string) => operar('readwrite', (s) => s.delete(id)).then(() => undefined).catch(() => undefined);

// ---------------------------------------------------------------------------
// No servidor
// ---------------------------------------------------------------------------

export async function buscarMedicoes(empresaId: string): Promise<MedicaoServidor[]> {
  const { data, error } = await supabase.from('medicoes').select(COLUNAS).eq('empresa_id', empresaId).order('updated_at', { ascending: false }).limit(300);
  if (error) throw error;
  return (data ?? []) as unknown as MedicaoServidor[];
}

export async function buscarMedicao(id: string): Promise<MedicaoServidor | null> {
  const { data, error } = await supabase.from('medicoes').select(COLUNAS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as unknown as MedicaoServidor | null;
}

export type ResultadoEnvio = { ok: true; versao: number } | { ok: false; conflito: true };

/** Envia o registro: cria (primeira vez) ou grava por cima da versão conhecida. `forcar` ignora a versão. */
export async function enviarMedicao(r: RegistroLocal, forcar = false): Promise<ResultadoEnvio> {
  const campos = { cliente_id: r.clienteId, titulo: r.titulo.trim() || 'Medição', endereco: r.endereco?.trim() || null, status: r.status, dados: r.dados };
  if (r.versao === null) {
    const { data, error } = await supabase.from('medicoes').insert({ id: r.id, empresa_id: r.empresaId, ...campos }).select('versao').single();
    if (error) {
      // Já criada (envio anterior que caiu no meio): segue como atualização.
      if (error.code === '23505') return enviarMedicao({ ...r, versao: 0 }, true);
      throw error;
    }
    return { ok: true, versao: (data as { versao: number }).versao };
  }
  let q = supabase.from('medicoes').update(campos).eq('id', r.id);
  if (!forcar) q = q.eq('versao', r.versao);
  const { data, error } = await q.select('versao');
  if (error) throw error;
  const linha = (data as Array<{ versao: number }>)[0];
  return linha ? { ok: true, versao: linha.versao } : { ok: false, conflito: true };
}

export const caminhoDaFoto = (empresaId: string, medicaoId: string, fotoId: string) => `${empresaId}/${medicaoId}/${fotoId}.jpg`;

export async function enviarFoto(caminho: string, foto: Blob): Promise<void> {
  const { error } = await supabase.storage.from(BALDE).upload(caminho, foto, { contentType: 'image/jpeg', upsert: false });
  // Já enviada antes (o envio anterior caiu depois de gravar): tudo certo.
  if (error && !/exists|duplicate/i.test(error.message)) throw error;
}

/** Link temporário (1 hora) para ver a foto: o balde é privado. */
export async function linkDaFoto(caminho: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BALDE).createSignedUrl(caminho, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function apagarFotosDoServidor(caminhos: string[]): Promise<void> {
  if (caminhos.length === 0) return;
  const { error } = await supabase.storage.from(BALDE).remove(caminhos);
  if (error) throw error;
}

export async function apagarMedicao(m: { id: string; empresaId: string; dados: DadosMedicao }): Promise<void> {
  // Fotos primeiro: sem a linha, ninguém mais saberia quais eram.
  await apagarFotosDoServidor(m.dados.fotos.flatMap((f) => (f.caminho ? [f.caminho] : [])));
  const { error } = await supabase.from('medicoes').delete().eq('id', m.id);
  if (error) throw error;
  for (const f of m.dados.fotos) await apagarFotoLocal(f.id);
  esquecerLocal(m.empresaId, m.id);
}

/** Foto reduzida no aparelho (JPEG, até 1568 px), sem os dados embutidos do arquivo original. */
export async function fotoReduzida(arquivo: File): Promise<Blob> {
  const img = await prepararImagem(arquivo);
  const bin = atob(img.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

// Fotos apagadas sem sinal: o arquivo no servidor sai no próximo envio.
const CHAVE_APAGAR = 'marcenaria:fotos-medicao-apagar';

export function marcarFotoParaApagar(caminho: string) {
  try {
    const l = new Set(ler<string[]>(CHAVE_APAGAR) ?? []);
    l.add(caminho);
    localStorage.setItem(CHAVE_APAGAR, JSON.stringify([...l]));
  } catch {
    // Sem armazenamento: o arquivo fica até alguém apagar a medição.
  }
}

/** Apaga no servidor as fotos removidas enquanto não havia sinal. */
export async function apagarFotosPendentes(): Promise<void> {
  const l = ler<string[]>(CHAVE_APAGAR) ?? [];
  if (l.length === 0) return;
  await apagarFotosDoServidor(l);
  try {
    localStorage.removeItem(CHAVE_APAGAR);
  } catch {
    // Nada a fazer.
  }
}
