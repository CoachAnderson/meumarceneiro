import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessaoTeste, type Resultado, type Usuario } from '../src/sessao';

/** Fase 8 — orçamentos emitidos: numeração, imutabilidade, papéis e isolamento. */

let s: SessaoTeste;
let ana: Usuario; // dona da A
let vera: Usuario; // vendas da A
let rita: Usuario; // produção da A
let bruno: Usuario; // dono da B
let empresaA: string;
let empresaB: string;
let projeto: string;
let orc1: string;

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

const emitir = (ator: Usuario, empresa: string, proj: string | null, total = 130424, dados = '{"linhas":[]}') =>
  s.como<{ id: string; numero: number; status: string; criado_por: string }>(
    ator,
    `insert into public.orcamentos (empresa_id, numero, projeto_id, projeto_versao, projeto_nome, cliente_nome, dados, custo_centavos, total_centavos, validade, status)
     values ($1, 999, $2, 1, 'Cozinha', 'João', $3::jsonb, 101695, $4, current_date + 15, 'aprovado')
     returning id, numero, status, criado_por`,
    [empresa, proj, dados, total],
  );

beforeAll(async () => {
  s = await SessaoTeste.abrir();
  ana = await s.criarUsuario('ana@a.test', 'Ana');
  bruno = await s.criarUsuario('bruno@b.test', 'Bruno');
  ({ id: empresaA } = await um(s.exigir<{ id: string }>(ana, `select public.criar_empresa('Marcenaria A') as id`)));
  ({ id: empresaB } = await um(s.exigir<{ id: string }>(bruno, `select public.criar_empresa('Marcenaria B') as id`)));
  vera = await membro('vera@a.test', 'Vera', 'vendas');
  rita = await membro('rita@a.test', 'Rita', 'producao');
  ({ id: projeto } = await um(s.exigir<{ id: string }>(ana, `select public.criar_projeto($1, 'Cozinha', null, '{}'::jsonb, 'a@1+b@1', true) as id`, [empresaA])));
});

afterAll(async () => {
  await s?.fechar();
});

describe('emissão', () => {
  it('número sequencial por empresa, status e autor definidos pelo banco', async () => {
    const a = await emitir(vera, empresaA, projeto);
    const b = await emitir(ana, empresaA, projeto);
    expect(a.ok && a.rows[0]).toMatchObject({ numero: 1, status: 'emitido', criado_por: vera.id });
    expect(b.ok && b.rows[0]).toMatchObject({ numero: 2, status: 'emitido', criado_por: ana.id });
    orc1 = a.ok ? a.rows[0]!.id : '';
    // A outra empresa tem a própria sequência.
    const c = await emitir(bruno, empresaB, null);
    expect(c.ok && c.rows[0]!.numero).toBe(1);
  });

  it('produção não emite nem vê orçamentos', async () => {
    expect(falhou(await emitir(rita, empresaA, projeto)).code).toBe(PERMISSAO_NEGADA);
    expect(await s.exigir(rita, `select id from public.orcamentos`)).toHaveLength(0);
  });

  it('emissão recusada não gasta número', async () => {
    await emitir(rita, empresaA, projeto);
    const r = await emitir(ana, empresaA, projeto);
    expect(r.ok && r.rows[0]!.numero).toBe(3);
  });

  it('valores negativos e dados que não são objeto são recusados', async () => {
    expect(falhou(await emitir(ana, empresaA, projeto, -1)).code).toBe(VIOLA_CHECK);
    expect(falhou(await emitir(ana, empresaA, projeto, 100, '[1]')).code).toBe(VIOLA_CHECK);
  });

  it('projeto de outra empresa é recusado', async () => {
    expect(falhou(await emitir(bruno, empresaB, projeto)).code).toBe(VIOLA_FK);
  });
});

describe('depois de emitido', () => {
  it('status e observação mudam; conteúdo não', async () => {
    await s.exigir(vera, `update public.orcamentos set status = 'aprovado', observacao = 'Fechou por telefone' where id = $1`, [orc1]);
    for (const set of [`total_centavos = 1`, `dados = '{"x":1}'::jsonb`, `numero = 50`, `validade = current_date + 90`, `projeto_nome = 'Outro'`, `custo_centavos = 0`]) {
      const r = await s.como(ana, `update public.orcamentos set ${set} where id = $1`, [orc1]);
      expect(falhou(r).code, set).toBe(PERMISSAO_NEGADA);
    }
    const o = await um(s.exigir<{ status: string; total_centavos: string }>(ana, `select status, total_centavos from public.orcamentos where id = $1`, [orc1]));
    expect(o).toEqual({ status: 'aprovado', total_centavos: '130424' });
  });

  it('o contador da empresa não é editável', async () => {
    // A coluna não tem permissão de escrita pela API, nem para o dono.
    expect(falhou(await s.como(ana, `update public.empresas set proximo_orcamento = 1 where id = $1`, [empresaA])).code).toBe(PERMISSAO_NEGADA);
    const r = await emitir(ana, empresaA, projeto);
    expect(r.ok && r.rows[0]!.numero).toBe(4);
  });

  it('só o dono exclui', async () => {
    const r = await s.como(vera, `delete from public.orcamentos where id = $1 returning id`, [orc1]);
    expect(r.ok && r.rowCount).toBe(0);
  });

  it('apagar o projeto mantém o orçamento, com o nome copiado', async () => {
    await s.exigir(ana, `delete from public.projetos where id = $1`, [projeto]);
    const o = await um(s.lerDireto<{ projeto_id: string | null; projeto_nome: string }>(`select projeto_id, projeto_nome from public.orcamentos where id = $1`, [orc1]));
    expect(o).toEqual({ projeto_id: null, projeto_nome: 'Cozinha' });
  });
});

describe('isolamento', () => {
  it('outra empresa não vê nem altera', async () => {
    expect(await s.exigir(bruno, `select id from public.orcamentos where empresa_id = $1`, [empresaA])).toHaveLength(0);
    const r = await s.como(bruno, `update public.orcamentos set status = 'cancelado' where id = $1 returning id`, [orc1]);
    expect(r.ok && r.rowCount).toBe(0);
    expect(falhou(await emitir(bruno, empresaA, null)).code).toBe(PERMISSAO_NEGADA);
  });
});
