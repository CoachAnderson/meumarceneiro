import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessaoTeste, type Resultado, type Usuario } from '../src/sessao';

/**
 * Fase 5 — projetos e histórico de versões.
 * Critérios: isolamento entre empresas, papéis, versões numeradas em sequência
 * e imutáveis, cliente sempre da mesma empresa.
 */

let s: SessaoTeste;
let ana: Usuario; // dona da A
let paulo: Usuario; // projetista da A
let rita: Usuario; // produção da A
let bruno: Usuario; // dono da B
let empresaA: string;
let empresaB: string;
let clienteA: string;
let clienteB: string;
let projeto: string;

const PERMISSAO_NEGADA = '42501';
const VIOLA_CHECK = '23514';
const VIOLA_FK = '23503';

const DADOS = JSON.stringify({ montagem: 'tampo_base_entre_laterais', fundo: 'fundo_canal', L: '600', A: '700', P: '550' });
const REGRAS = 'tampo_base_entre_laterais@1+fundo_canal@1';

function falhou(r: Resultado<unknown>) {
  if (r.ok) throw new Error('Esperava erro, mas o comando foi aceito.');
  return r.erro;
}

async function um<T>(p: Promise<T[]>): Promise<T> {
  const l = await p;
  if (!l[0]) throw new Error('Nenhuma linha retornada.');
  return l[0];
}

async function membro(email: string, nome: string, papel: string): Promise<Usuario> {
  const u = await s.criarUsuario(email, nome);
  await s.lerDireto(`insert into public.membros_empresa (empresa_id, usuario_id, papel) values ($1, $2, $3)`, [empresaA, u.id, papel]);
  return u;
}

const novaVersao = (ator: Usuario, projetoId: string, empresa = empresaA, obs: string | null = null) =>
  s.como<{ numero: number }>(
    ator,
    `insert into public.projeto_versoes (empresa_id, projeto_id, numero, dados, regras, valido, observacao)
     values ($1, $2, 999, $3::jsonb, $4, true, $5) returning numero`,
    [empresa, projetoId, DADOS, REGRAS, obs],
  );

beforeAll(async () => {
  s = await SessaoTeste.abrir();
  ana = await s.criarUsuario('ana@a.test', 'Ana');
  bruno = await s.criarUsuario('bruno@b.test', 'Bruno');
  ({ id: empresaA } = await um(s.exigir<{ id: string }>(ana, `select public.criar_empresa('Marcenaria A') as id`)));
  ({ id: empresaB } = await um(s.exigir<{ id: string }>(bruno, `select public.criar_empresa('Marcenaria B') as id`)));
  paulo = await membro('paulo@a.test', 'Paulo', 'projetista');
  rita = await membro('rita@a.test', 'Rita', 'producao');
  ({ id: clienteA } = await um(s.exigir<{ id: string }>(ana, `insert into public.clientes (empresa_id, nome) values ($1, 'João') returning id`, [empresaA])));
  ({ id: clienteB } = await um(s.exigir<{ id: string }>(bruno, `insert into public.clientes (empresa_id, nome) values ($1, 'Maria') returning id`, [empresaB])));
  ({ id: projeto } = await um(
    s.exigir<{ id: string }>(paulo, `select public.criar_projeto($1, 'Cozinha do João', $2, $3::jsonb, $4, true) as id`, [
      empresaA,
      clienteA,
      DADOS,
      REGRAS,
    ]),
  ));
});

afterAll(async () => {
  await s?.fechar();
});

describe('criar projeto', () => {
  it('nasce com a versão 1', async () => {
    const v = await s.exigir<{ numero: number; criado_por: string; observacao: string }>(paulo, `select numero, criado_por, observacao from public.projeto_versoes where projeto_id = $1`, [projeto]);
    expect(v).toEqual([{ numero: 1, criado_por: paulo.id, observacao: 'Versão inicial' }]);
    const p = await um(s.exigir<{ versao_atual: number }>(paulo, `select versao_atual from public.projetos where id = $1`, [projeto]));
    expect(p.versao_atual).toBe(1);
  });

  it('produção não cria projeto', async () => {
    const r = await s.como(rita, `select public.criar_projeto($1, 'X projeto', null, '{}'::jsonb, $2, true)`, [empresaA, REGRAS]);
    expect(falhou(r).code).toBe(PERMISSAO_NEGADA);
  });

  it('cliente de outra empresa é recusado', async () => {
    const r = await s.como(ana, `select public.criar_projeto($1, 'Projeto errado', $2, '{}'::jsonb, $3, true)`, [empresaA, clienteB, REGRAS]);
    expect(falhou(r).code).toBe(VIOLA_FK);
  });

  it('nome curto e dados que não são objeto são recusados', async () => {
    expect(falhou(await s.como(ana, `select public.criar_projeto($1, 'X', null, '{}'::jsonb, $2, true)`, [empresaA, REGRAS])).code).toBe(VIOLA_CHECK);
    expect(falhou(await s.como(ana, `select public.criar_projeto($1, 'Projeto', null, '[1]'::jsonb, $2, true)`, [empresaA, REGRAS])).code).toBe(VIOLA_CHECK);
  });

  it('falha na versão inicial desfaz o projeto inteiro', async () => {
    await s.como(ana, `select public.criar_projeto($1, 'Projeto órfão', null, '[1]'::jsonb, $2, true)`, [empresaA, REGRAS]);
    const r = await s.lerDireto(`select 1 from public.projetos where nome = 'Projeto órfão'`);
    expect(r).toHaveLength(0);
  });
});

describe('versões', () => {
  it('numeradas em sequência pelo banco, ignorando o número enviado', async () => {
    const v2 = await um(s.exigir<{ numero: number }>(paulo, `insert into public.projeto_versoes (empresa_id, projeto_id, numero, dados, regras, valido) values ($1, $2, 999, $3::jsonb, $4, true) returning numero`, [empresaA, projeto, DADOS, REGRAS]));
    const v3 = await novaVersao(ana, projeto, empresaA, 'Cliente pediu 2 cm a mais');
    expect(v2.numero).toBe(2);
    expect(v3.ok && v3.rows[0]?.numero).toBe(3);
    const p = await um(s.exigir<{ versao_atual: number }>(ana, `select versao_atual from public.projetos where id = $1`, [projeto]));
    expect(p.versao_atual).toBe(3);
  });

  it('não podem ser alteradas nem apagadas, nem pelo dono', async () => {
    // Sem permissão de UPDATE/DELETE na tabela: o banco recusa.
    expect(falhou(await s.como(ana, `update public.projeto_versoes set observacao = 'mexi' where projeto_id = $1`, [projeto])).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await s.como(ana, `delete from public.projeto_versoes where projeto_id = $1`, [projeto])).code).toBe(PERMISSAO_NEGADA);
    // Mesmo fora da RLS, o trigger barra.
    await s.lerDireto('savepoint direto');
    await expect(s.lerDireto(`update public.projeto_versoes set observacao = 'x' where projeto_id = $1`, [projeto])).rejects.toThrow(/não podem ser alteradas/);
    await s.lerDireto('rollback to savepoint direto');
    await s.lerDireto('savepoint direto2');
    await expect(s.lerDireto(`delete from public.projeto_versoes where projeto_id = $1`, [projeto])).rejects.toThrow(/não podem ser alteradas/);
    await s.lerDireto('rollback to savepoint direto2');
  });

  it('versao_atual não é alterável pelo usuário', async () => {
    expect(falhou(await s.como(ana, `update public.projetos set versao_atual = 50 where id = $1`, [projeto])).code).toBe(PERMISSAO_NEGADA);
    await s.exigir(ana, `update public.projetos set nome = 'Cozinha do João (rev)' where id = $1`, [projeto]);
    const p = await um(s.exigir<{ versao_atual: number; nome: string }>(ana, `select versao_atual, nome from public.projetos where id = $1`, [projeto]));
    expect(p).toEqual({ versao_atual: 3, nome: 'Cozinha do João (rev)' });
  });

  it('produção lê, mas não salva versão', async () => {
    const l = await s.exigir(rita, `select numero from public.projeto_versoes where projeto_id = $1`, [projeto]);
    expect(l).toHaveLength(3);
    expect(falhou(await novaVersao(rita, projeto)).code).toBe(PERMISSAO_NEGADA);
  });
});

describe('isolamento entre empresas', () => {
  it('outra empresa não vê projeto nem versões', async () => {
    expect(await s.exigir(bruno, `select id from public.projetos where id = $1`, [projeto])).toHaveLength(0);
    expect(await s.exigir(bruno, `select id from public.projeto_versoes where projeto_id = $1`, [projeto])).toHaveLength(0);
  });

  it('não grava versão em projeto alheio, nem fingindo ser da própria empresa', async () => {
    expect(falhou(await novaVersao(bruno, projeto, empresaA)).code).toBe(PERMISSAO_NEGADA);
    // empresa_id da B com projeto da A: a FK composta não encontra o par.
    expect(falhou(await novaVersao(bruno, projeto, empresaB)).code).toBe(VIOLA_FK);
    const p = await s.lerDireto<{ versao_atual: number }>(`select versao_atual from public.projetos where id = $1`, [projeto]);
    expect(p[0]?.versao_atual).toBe(3);
  });

  it('não move projeto para outra empresa', async () => {
    const r = await s.como(ana, `update public.projetos set empresa_id = $2 where id = $1`, [projeto, empresaB]);
    expect(falhou(r).code).toBe(PERMISSAO_NEGADA);
  });

  it('anônimo não vê nada', async () => {
    const r = await s.como('anon', `select id from public.projetos`);
    expect(r.ok ? r.rowCount : 0).toBe(0);
  });
});

describe('apagar', () => {
  it('só o dono apaga o projeto, e as versões vão junto', async () => {
    const d1 = await s.como(paulo, `delete from public.projetos where id = $1 returning id`, [projeto]);
    expect(d1.ok && d1.rowCount).toBe(0);
    await s.exigir(ana, `delete from public.projetos where id = $1`, [projeto]);
    expect(await s.lerDireto(`select 1 from public.projeto_versoes where projeto_id = $1`, [projeto])).toHaveLength(0);
  });

  it('apagar o cliente mantém o projeto, sem cliente', async () => {
    const { id } = await um(s.exigir<{ id: string }>(ana, `select public.criar_projeto($1, 'Sala', $2, '{}'::jsonb, $3, false) as id`, [empresaA, clienteA, REGRAS]));
    await s.exigir(ana, `delete from public.clientes where id = $1`, [clienteA]);
    const p = await s.lerDireto<{ cliente_id: string | null; empresa_id: string }>(`select cliente_id, empresa_id from public.projetos where id = $1`, [id]);
    expect(p[0]).toEqual({ cliente_id: null, empresa_id: empresaA });
  });
});
