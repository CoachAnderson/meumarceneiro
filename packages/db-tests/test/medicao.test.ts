import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessaoTeste, type Resultado, type Usuario } from '../src/sessao';

/** Medição guiada no local. */

let s: SessaoTeste;
let ana: Usuario; // dona da A
let rita: Usuario; // produção da A (montadora que mede)
let vera: Usuario; // vendas da A
let bruno: Usuario; // dono da B
let empresaA: string;
let empresaB: string;
let cliente: string;

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
const DADOS = JSON.stringify({ versao: 1, ambiente: 'Quarto', movel: 'Roupeiro', profundidadeLivre: 6000, paredes: [], fotos: [], observacoes: '' });
const criar = (ator: Usuario, empresa: string, id?: string) =>
  s.como<{ id: string; versao: number; criado_por: string }>(
    ator,
    `insert into public.medicoes (${id ? 'id, ' : ''}empresa_id, titulo, dados) values (${id ? '$3, ' : ''}$1, 'Quarto do casal', $2::jsonb) returning id, versao, criado_por`,
    id ? [empresa, DADOS, id] : [empresa, DADOS],
  );

beforeAll(async () => {
  s = await SessaoTeste.abrir();
  ana = await s.criarUsuario('ana@a.test', 'Ana');
  bruno = await s.criarUsuario('bruno@b.test', 'Bruno');
  ({ id: empresaA } = await um(s.exigir<{ id: string }>(ana, `select public.criar_empresa('Marcenaria A') as id`)));
  ({ id: empresaB } = await um(s.exigir<{ id: string }>(bruno, `select public.criar_empresa('Marcenaria B') as id`)));
  rita = await membro('rita@a.test', 'Rita', 'producao');
  vera = await membro('vera@a.test', 'Vera', 'vendas');
  ({ id: cliente } = await um(s.exigir<{ id: string }>(ana, `insert into public.clientes (empresa_id, nome) values ($1, 'João Pereira') returning id`, [empresaA])));
});

afterAll(async () => {
  await s?.fechar();
});

describe('medições', () => {
  it('qualquer pessoa da equipe mede; o id pode vir do aparelho (medição feita sem sinal)', async () => {
    const id = '7d1f4a52-3a0e-4c3b-9a7e-5d2b8c6f1e90';
    const r = await criar(rita, empresaA, id);
    if (!r.ok) throw new Error(r.erro.message);
    expect(r.rows[0]).toEqual({ id, versao: 1, criado_por: rita.id });
    expect((await criar(vera, empresaA)).ok).toBe(true);
  });

  it('cada gravação sobe a versão; o aparelho grava só por cima da versão que viu', async () => {
    const { id } = await um(s.exigir<{ id: string }>(ana, `insert into public.medicoes (empresa_id, titulo, dados, cliente_id) values ($1, 'Cozinha', $2::jsonb, $3) returning id`, [empresaA, DADOS, cliente]));
    const v2 = await s.exigir<{ versao: number; alterado_por: string }>(rita, `update public.medicoes set status = 'concluida' where id = $1 and versao = 1 returning versao, alterado_por`, [id]);
    expect(v2).toEqual([{ versao: 2, alterado_por: rita.id }]);
    // Outro aparelho ainda com a versão 1: não grava nada (a tela avisa e recarrega).
    expect(await s.exigir(ana, `update public.medicoes set titulo = 'X' where id = $1 and versao = 1 returning id`, [id])).toEqual([]);
  });

  it('não muda de empresa nem de autor, nem a versão na mão', async () => {
    const { id } = (await criar(ana, empresaA)).ok ? (await s.exigir<{ id: string }>(ana, `select id from public.medicoes where empresa_id = $1 limit 1`, [empresaA]))[0]! : { id: '' };
    expect(falhou(await s.como(ana, `update public.medicoes set versao = 99 where id = $1`, [id])).code).toBe('42501');
    expect(falhou(await s.como(ana, `update public.medicoes set criado_por = $2 where id = $1`, [id, bruno.id])).code).toBe('42501');
    expect(falhou(await s.como(ana, `update public.medicoes set empresa_id = $2 where id = $1`, [id, empresaB])).code).toBe('42501');
  });

  it('outra empresa não vê, não cria na A e não liga cliente de outra empresa', async () => {
    expect(await s.exigir(bruno, `select 1 from public.medicoes where empresa_id = $1`, [empresaA])).toEqual([]);
    expect(falhou(await criar(bruno, empresaA)).code).toBe('42501');
    const r = await s.como(bruno, `insert into public.medicoes (empresa_id, titulo, dados, cliente_id) values ($1, 'X', '{}', $2)`, [empresaB, cliente]);
    expect(falhou(r).code).toBe('23503');
    expect(falhou(await s.como('anon', `select 1 from public.medicoes`)).code).toBe('42501');
  });

  it('apaga: o dono ou quem criou', async () => {
    const deRita = await um(s.exigir<{ id: string }>(rita, `insert into public.medicoes (empresa_id, titulo, dados) values ($1, 'Lavanderia', '{}') returning id`, [empresaA]));
    const deAna = await um(s.exigir<{ id: string }>(ana, `insert into public.medicoes (empresa_id, titulo, dados) values ($1, 'Sala', '{}') returning id`, [empresaA]));
    expect(await s.exigir(vera, `delete from public.medicoes where id = $1 returning id`, [deRita.id])).toEqual([]);
    expect(await s.exigir(rita, `delete from public.medicoes where id = $1 returning id`, [deAna.id])).toEqual([]);
    expect((await s.exigir(rita, `delete from public.medicoes where id = $1 returning id`, [deRita.id])).length).toBe(1);
    expect((await s.exigir(ana, `delete from public.medicoes where id = $1 returning id`, [deAna.id])).length).toBe(1);
  });

  it('dados que não são objeto ou título vazio: recusado', async () => {
    expect(falhou(await s.como(ana, `insert into public.medicoes (empresa_id, titulo, dados) values ($1, 'X', '[]')`, [empresaA])).code).toBe('23514');
    expect(falhou(await s.como(ana, `insert into public.medicoes (empresa_id, titulo, dados) values ($1, '  ', '{}')`, [empresaA])).code).toBe('23514');
  });

  it('sem assinatura ativa: vê, mas não grava', async () => {
    await s.lerDireto(`update public.empresas set teste_ate = now() - interval '1 hour' where id = $1`, [empresaA]);
    expect(falhou(await criar(ana, empresaA)).hint).toBe('assinatura');
    expect((await s.exigir(ana, `select 1 from public.medicoes where empresa_id = $1`, [empresaA])).length).toBeGreaterThan(0);
    await s.lerDireto(`update public.empresas set teste_ate = now() + interval '14 days' where id = $1`, [empresaA]);
  });
});

describe('fotos da medição (balde privado)', () => {
  const caminho = (empresa: string) => `${empresa}/11111111-2222-4333-8444-555555555555/66666666-7777-4888-9999-000000000000.jpg`;

  it('o balde não é público', async () => {
    const b = await s.lerDireto<{ public: boolean; allowed_mime_types: string[] }>(`select public, allowed_mime_types from storage.buckets where id = 'medicoes'`);
    expect(b).toEqual([{ public: false, allowed_mime_types: ['image/jpeg'] }]);
  });

  it('a equipe grava e vê na pasta da própria empresa; outra empresa não vê nem grava', async () => {
    expect((await s.como(rita, `insert into storage.objects (bucket_id, name) values ('medicoes', $1)`, [caminho(empresaA)])).ok).toBe(true);
    expect((await s.exigir(vera, `select name from storage.objects where bucket_id = 'medicoes'`)).length).toBe(1);
    expect(await s.exigir(bruno, `select name from storage.objects where bucket_id = 'medicoes'`)).toEqual([]);
    expect(falhou(await s.como(bruno, `insert into storage.objects (bucket_id, name) values ('medicoes', $1)`, [caminho(empresaA)])).code).toBe('42501');
    expect(falhou(await s.como(ana, `insert into storage.objects (bucket_id, name) values ('medicoes', $1)`, [`${empresaA}/qualquer.png`])).code).toBe('42501');
    expect(await s.exigir('anon', `select name from storage.objects where bucket_id = 'medicoes'`).catch(() => [])).toEqual([]);
  });
});
