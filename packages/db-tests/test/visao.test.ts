import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessaoTeste, type Resultado, type Usuario } from '../src/sessao';

/** Visão IA — cota mensal, registro de uso e isolamento. */

let s: SessaoTeste;
let ana: Usuario; // dona da A
let rita: Usuario; // produção da A
let bruno: Usuario; // dono da B
let empresaA: string;
let empresaB: string;

const PERMISSAO_NEGADA = '42501';

function falhou(r: Resultado<unknown>) {
  if (r.ok) throw new Error('Esperava erro, mas o comando foi aceito.');
  return r.erro;
}
async function um<T>(p: Promise<T[]>): Promise<T> {
  const l = await p;
  if (!l[0]) throw new Error('Nenhuma linha retornada.');
  return l[0];
}
const iniciar = (ator: Usuario, empresa: string) => s.como<{ id: string }>(ator, `select public.iniciar_analise_visao($1) as id`, [empresa]);
const cota = async (ator: Usuario, empresa: string) => (await um(s.exigir<{ c: { usadas: number; limite: number } }>(ator, `select public.cota_visao($1) as c`, [empresa]))).c;
const concluir = (ator: Usuario, id: string, status = 'concluida') => s.como(ator, `select public.concluir_analise_visao($1, $2::public.status_analise_visao, 'modelo-x', 1500, 300, null)`, [id, status]);

beforeAll(async () => {
  s = await SessaoTeste.abrir();
  ana = await s.criarUsuario('ana@a.test', 'Ana');
  bruno = await s.criarUsuario('bruno@b.test', 'Bruno');
  ({ id: empresaA } = await um(s.exigir<{ id: string }>(ana, `select public.criar_empresa('Marcenaria A') as id`)));
  ({ id: empresaB } = await um(s.exigir<{ id: string }>(bruno, `select public.criar_empresa('Marcenaria B') as id`)));
  rita = await s.criarUsuario('rita@a.test', 'Rita');
  await s.lerDireto(`insert into public.membros_empresa (empresa_id, usuario_id, papel) values ($1, $2, 'producao')`, [empresaA, rita.id]);
  await s.lerDireto(`update public.empresas set visao_limite_mensal = 3 where id = $1`, [empresaA]);
});
afterAll(async () => {
  await s?.fechar();
});

describe('cota da Visão IA', () => {
  it('começa zerada, com o limite da empresa', async () => {
    expect(await cota(ana, empresaA)).toEqual({ usadas: 0, limite: 3 });
  });

  it('análise concluída gasta cota; falha e recusa não gastam', async () => {
    const a = await iniciar(ana, empresaA);
    const b = await iniciar(ana, empresaA);
    const c = await iniciar(ana, empresaA);
    expect(a.ok && b.ok && c.ok).toBe(true);
    // Três em andamento: a cota está toda reservada.
    expect(falhou(await iniciar(ana, empresaA)).hint).toBe('cota_visao');
    if (!a.ok || !b.ok || !c.ok) return;
    expect((await concluir(ana, a.rows[0]!.id, 'concluida')).ok).toBe(true);
    expect((await concluir(ana, b.rows[0]!.id, 'falhou')).ok).toBe(true);
    expect((await concluir(ana, c.rows[0]!.id, 'recusada')).ok).toBe(true);
    expect(await cota(ana, empresaA)).toEqual({ usadas: 1, limite: 3 });
    const linha = await um(s.exigir<{ status: string; tokens_entrada: number; modelo: string }>(ana, `select status, tokens_entrada, modelo from public.visao_analises where id = $1`, [a.rows[0]!.id]));
    expect(linha).toEqual({ status: 'concluida', tokens_entrada: 1500, modelo: 'modelo-x' });
  });

  it('análise travada há mais de 5 minutos deixa de reservar cota', async () => {
    const a = await iniciar(ana, empresaA);
    expect(await cota(ana, empresaA)).toEqual({ usadas: 2, limite: 3 });
    await s.lerDireto(`update public.visao_analises set created_at = now() - interval '6 minutes' where id = $1`, [a.ok ? a.rows[0]!.id : null]);
    expect(await cota(ana, empresaA)).toEqual({ usadas: 1, limite: 3 });
  });

  it('análise do mês passado não conta', async () => {
    await s.lerDireto(`insert into public.visao_analises (empresa_id, status, created_at) values ($1, 'concluida', now() - interval '40 days')`, [empresaA]);
    expect((await cota(ana, empresaA)).usadas).toBe(1);
  });

  it('só quem iniciou encerra, e só uma vez', async () => {
    const a = await iniciar(ana, empresaA);
    const id = a.ok ? a.rows[0]!.id : '';
    expect(falhou(await concluir(bruno, id)).code).toBe(PERMISSAO_NEGADA);
    expect((await concluir(ana, id)).ok).toBe(true);
    expect(falhou(await concluir(ana, id)).code).toBe(PERMISSAO_NEGADA);
  });

  it('cota cheia: recusa nova análise', async () => {
    const a = await iniciar(ana, empresaA);
    if (a.ok) await concluir(ana, a.rows[0]!.id);
    expect(await cota(ana, empresaA)).toEqual({ usadas: 3, limite: 3 });
    expect(falhou(await iniciar(ana, empresaA)).hint).toBe('cota_visao');
  });
});

describe('permissões e isolamento', () => {
  it('produção não usa a Visão IA', async () => {
    expect(falhou(await iniciar(rita, empresaA)).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await s.como(rita, `select public.cota_visao($1)`, [empresaA])).code).toBe(PERMISSAO_NEGADA);
    expect(await s.exigir(rita, `select id from public.visao_analises`)).toHaveLength(0);
  });

  it('outra empresa não gasta a cota alheia nem vê o registro', async () => {
    expect(falhou(await iniciar(bruno, empresaA)).code).toBe(PERMISSAO_NEGADA);
    expect(await s.exigir(bruno, `select id from public.visao_analises`)).toHaveLength(0);
    expect(await cota(bruno, empresaB)).toEqual({ usadas: 0, limite: 30 });
  });

  it('ninguém grava direto na tabela nem muda o próprio limite', async () => {
    expect(falhou(await s.como(ana, `insert into public.visao_analises (empresa_id) values ($1)`, [empresaA])).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await s.como(ana, `update public.visao_analises set status = 'falhou'`)).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await s.como(ana, `update public.empresas set visao_limite_mensal = 9999 where id = $1`, [empresaA])).code).toBe(PERMISSAO_NEGADA);
  });
});
