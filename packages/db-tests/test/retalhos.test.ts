import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessaoTeste, type Resultado, type Usuario } from '../src/sessao';

/** Fase 6 — retalhos: papéis, validações e isolamento entre empresas. */

let s: SessaoTeste;
let ana: Usuario; // dona da A
let rita: Usuario; // produção da A
let vera: Usuario; // vendas da A
let bruno: Usuario; // dono da B
let empresaA: string;
let empresaB: string;
let materialA: string;
let materialB: string;
let retalho: string;

const PERMISSAO_NEGADA = '42501';
const VIOLA_CHECK = '23514';
const VIOLA_FK = '23503';

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

const inserir = (ator: Usuario, empresa: string, material: string, c = 10000, l = 6000) =>
  s.como<{ id: string }>(ator, `insert into public.retalhos (empresa_id, material_id, comprimento_dmm, largura_dmm, local) values ($1, $2, $3, $4, 'Prateleira 2') returning id`, [
    empresa,
    material,
    c,
    l,
  ]);

beforeAll(async () => {
  s = await SessaoTeste.abrir();
  ana = await s.criarUsuario('ana@a.test', 'Ana');
  bruno = await s.criarUsuario('bruno@b.test', 'Bruno');
  ({ id: empresaA } = await um(s.exigir<{ id: string }>(ana, `select public.criar_empresa('Marcenaria A') as id`)));
  ({ id: empresaB } = await um(s.exigir<{ id: string }>(bruno, `select public.criar_empresa('Marcenaria B') as id`)));
  rita = await membro('rita@a.test', 'Rita', 'producao');
  vera = await membro('vera@a.test', 'Vera', 'vendas');
  ({ id: materialA } = await um(s.exigir<{ id: string }>(ana, `insert into public.materiais (empresa_id, tipo, nome, espessura_nominal_dmm) values ($1, 'mdf', 'MDF Branco', 180) returning id`, [empresaA])));
  ({ id: materialB } = await um(s.exigir<{ id: string }>(bruno, `insert into public.materiais (empresa_id, tipo, nome, espessura_nominal_dmm) values ($1, 'mdf', 'MDF Preto', 180) returning id`, [empresaB])));
});

afterAll(async () => {
  await s?.fechar();
});

describe('retalhos', () => {
  it('produção cadastra', async () => {
    const r = await inserir(rita, empresaA, materialA);
    expect(r.ok).toBe(true);
    retalho = r.ok ? r.rows[0]!.id : '';
  });

  it('vendas só consulta', async () => {
    expect(falhou(await inserir(vera, empresaA, materialA)).code).toBe(PERMISSAO_NEGADA);
    expect(await s.exigir(vera, `select id from public.retalhos`)).toHaveLength(1);
    const u = await s.como(vera, `update public.retalhos set quantidade = 5 where id = $1 returning id`, [retalho]);
    expect(u.ok && u.rowCount).toBe(0);
  });

  it('medidas fora do limite são recusadas', async () => {
    expect(falhou(await inserir(ana, empresaA, materialA, 100, 6000)).code).toBe(VIOLA_CHECK);
    const q = await s.como(ana, `update public.retalhos set quantidade = -1 where id = $1`, [retalho]);
    expect(falhou(q).code).toBe(VIOLA_CHECK);
  });

  it('material de outra empresa é recusado', async () => {
    expect(falhou(await inserir(ana, empresaA, materialB)).code).toBe(VIOLA_FK);
  });

  it('outra empresa não vê nem altera', async () => {
    expect(await s.exigir(bruno, `select id from public.retalhos where id = $1`, [retalho])).toHaveLength(0);
    const d = await s.como(bruno, `delete from public.retalhos where id = $1 returning id`, [retalho]);
    expect(d.ok && d.rowCount).toBe(0);
    expect(falhou(await inserir(bruno, empresaA, materialA)).code).toBe(PERMISSAO_NEGADA);
  });

  it('apagar o material apaga os retalhos dele', async () => {
    await s.exigir(ana, `delete from public.materiais where id = $1`, [materialA]);
    expect(await s.lerDireto(`select 1 from public.retalhos where id = $1`, [retalho])).toHaveLength(0);
  });
});
