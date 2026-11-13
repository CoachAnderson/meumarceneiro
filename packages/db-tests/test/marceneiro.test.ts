import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessaoTeste, type Resultado, type Usuario } from '../src/sessao';

/**
 * Marceneiro virtual — apresentações (link público), cota mensal, limite por
 * link, ritmo e isolamento.
 *
 * Os testes rodam numa transação só: now() é o mesmo o tempo todo, então toda
 * pergunta conta como "do último minuto" para o controle de ritmo.
 */

let s: SessaoTeste;
let ana: Usuario; // dona da A
let rita: Usuario; // produção da A
let vera: Usuario; // vendas da A
let bruno: Usuario; // dono da B
let empresaA: string;
let empresaB: string;

const PERMISSAO_NEGADA = '42501';
const FICHA = { versao: 1, marcenaria: 'Marcenaria A', titulo: 'Mesa', tipo: 'Mesa', largura: 1200, altura: 750, profundidade: 800, materiais: [], totalPecas: 2, composicao: [], ferragens: [], precoCentavos: null, prazoDias: null, observacoes: '' };

function falhou(r: Resultado<unknown>) {
  if (r.ok) throw new Error('Esperava erro, mas o comando foi aceito.');
  return r.erro;
}
async function um<T>(p: Promise<T[]>): Promise<T> {
  const l = await p;
  if (!l[0]) throw new Error('Nenhuma linha retornada.');
  return l[0];
}

const novoId = async () => (await um(s.lerDireto<{ id: string }>(`select gen_random_uuid() as id`))).id;
const criar = async (ator: Usuario, empresa: string, extra: { limite?: number; nome?: string; ficha?: unknown } = {}) => {
  const id = await novoId();
  const r = await s.como(ator, `insert into public.apresentacoes (id, empresa_id, nome_assistente, ficha, limite_perguntas) values ($1, $2, $3, $4, $5)`, [
    id,
    empresa,
    extra.nome ?? 'Seu Zé',
    JSON.stringify(extra.ficha ?? FICHA),
    extra.limite ?? 40,
  ]);
  return { id, r };
};
const abrir = (empresa: string, id: string) => s.como<{ a: { nome: string; restantes: number } | null }>('servico', `select public.abrir_apresentacao($1, $2) as a`, [empresa, id]);
const perguntarLink = (empresa: string, id: string) => s.como<{ p: { pergunta_id: string; restantes: number; nome: string } }>('servico', `select public.iniciar_pergunta_link($1, $2) as p`, [empresa, id]);
const perguntarEditor = (ator: Usuario, empresa: string) => s.como<{ id: string }>(ator, `select public.iniciar_pergunta_editor($1) as id`, [empresa]);
const concluir = (ator: Usuario | 'servico', id: string, status = 'concluida') =>
  s.como(ator, `select public.concluir_pergunta_marceneiro($1, $2::public.status_pergunta_marceneiro, 'modelo-x', 900, 60)`, [id, status]);
const cota = async (ator: Usuario, empresa: string) => (await um(s.exigir<{ c: { usadas: number; limite: number } }>(ator, `select public.cota_marceneiro($1) as c`, [empresa]))).c;
const ok = <T>(r: Resultado<T>) => {
  if (!r.ok) throw new Error(`Falhou: ${r.erro.message}`);
  return r.rows[0]!;
};

beforeAll(async () => {
  s = await SessaoTeste.abrir();
  ana = await s.criarUsuario('ana@a.test', 'Ana');
  bruno = await s.criarUsuario('bruno@b.test', 'Bruno');
  ({ id: empresaA } = await um(s.exigir<{ id: string }>(ana, `select public.criar_empresa('Marcenaria A') as id`)));
  ({ id: empresaB } = await um(s.exigir<{ id: string }>(bruno, `select public.criar_empresa('Marcenaria B') as id`)));
  rita = await s.criarUsuario('rita@a.test', 'Rita');
  vera = await s.criarUsuario('vera@a.test', 'Vera');
  await s.lerDireto(`insert into public.membros_empresa (empresa_id, usuario_id, papel) values ($1, $2, 'producao'), ($1, $3, 'vendas')`, [empresaA, rita.id, vera.id]);
});
afterAll(async () => {
  await s?.fechar();
});

describe('apresentações (link do marceneiro virtual)', () => {
  it('dono e vendas criam; produção e outra empresa não', async () => {
    expect((await criar(ana, empresaA)).r.ok).toBe(true);
    expect((await criar(vera, empresaA)).r.ok).toBe(true);
    expect(falhou((await criar(rita, empresaA)).r).code).toBe(PERMISSAO_NEGADA);
    expect(falhou((await criar(bruno, empresaA)).r).code).toBe(PERMISSAO_NEGADA);
  });

  it('a API não mexe no contador, na validade nem no criador; só liga e desliga', async () => {
    const { id } = await criar(ana, empresaA);
    for (const sql of [
      `update public.apresentacoes set perguntas = 0 where id = $1`,
      `update public.apresentacoes set expira_em = now() + interval '10 years' where id = $1`,
      `update public.apresentacoes set limite_perguntas = 200 where id = $1`,
    ]) {
      expect(falhou(await s.como(ana, sql, [id])).code, sql).toBe(PERMISSAO_NEGADA);
    }
    expect(falhou(await s.como(ana, `insert into public.apresentacoes (id, empresa_id, nome_assistente, ficha, expira_em) values (gen_random_uuid(), $1, 'X', '{}', now() + interval '1 year')`, [empresaA])).code).toBe(PERMISSAO_NEGADA);
    expect((await s.como(ana, `update public.apresentacoes set ativa = false where id = $1`, [id])).ok).toBe(true);
    const criador = await um(s.lerDireto<{ criado_por: string }>(`select criado_por from public.apresentacoes where id = $1`, [id]));
    expect(criador.criado_por).toBe(ana.id);
  });

  it('ficha grande demais ou nome vazio são recusados', async () => {
    expect(falhou((await criar(ana, empresaA, { ficha: { ...FICHA, observacoes: 'x'.repeat(13000) } })).r).code).toBe('23514');
    expect(falhou((await criar(ana, empresaA, { nome: '  ' })).r).code).toBe('23514');
  });

  it('isolamento: a outra empresa não vê as apresentações nem o uso', async () => {
    const vistas = await s.exigir<{ n: number }>(bruno, `select count(*)::int as n from public.apresentacoes where empresa_id = $1`, [empresaA]);
    expect(vistas[0]!.n).toBe(0);
    const uso = await s.exigir<{ n: number }>(bruno, `select count(*)::int as n from public.marceneiro_perguntas where empresa_id = $1`, [empresaA]);
    expect(uso[0]!.n).toBe(0);
    expect(falhou(await s.como(bruno, `select public.cota_marceneiro($1)`, [empresaA])).code).toBe(PERMISSAO_NEGADA);
  });
});

describe('link público', () => {
  it('abrir devolve nome e ficha; com a empresa errada, desligado ou vencido devolve nada', async () => {
    const { id } = await criar(ana, empresaA);
    expect(ok(await abrir(empresaA, id)).a).toMatchObject({ nome: 'Seu Zé', restantes: 40 });
    expect(ok(await abrir(empresaB, id)).a).toBeNull();

    const desligado = await criar(ana, empresaA);
    await s.exigir(ana, `update public.apresentacoes set ativa = false where id = $1`, [desligado.id]);
    expect(ok(await abrir(empresaA, desligado.id)).a).toBeNull();

    const vencido = await criar(ana, empresaA);
    await s.lerDireto(`update public.apresentacoes set expira_em = now() - interval '1 second' where id = $1`, [vencido.id]);
    expect(ok(await abrir(empresaA, vencido.id)).a).toBeNull();
    expect(falhou(await perguntarLink(empresaA, vencido.id)).hint).toBe('marceneiro_indisponivel');
    expect(falhou(await perguntarLink(empresaB, id)).hint).toBe('marceneiro_indisponivel');
  });

  it('visitante anônimo e usuário logado não chamam as funções do link', async () => {
    const { id } = await criar(ana, empresaA);
    expect(falhou(await s.como('anon', `select public.abrir_apresentacao($1, $2)`, [empresaA, id])).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await s.como('anon', `select public.iniciar_pergunta_link($1, $2)`, [empresaA, id])).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await s.como(ana, `select public.iniciar_pergunta_link($1, $2)`, [empresaA, id])).code).toBe(PERMISSAO_NEGADA);
  });

  it('limite por link: a falha devolve a pergunta, a concluída gasta', async () => {
    const { id } = await criar(ana, empresaA, { limite: 2 });
    const p1 = ok(await perguntarLink(empresaA, id)).p;
    expect(p1).toMatchObject({ nome: 'Seu Zé', restantes: 1 });
    const p2 = ok(await perguntarLink(empresaA, id)).p;
    expect(p2.restantes).toBe(0);
    expect(falhou(await perguntarLink(empresaA, id)).hint).toBe('limite_link');

    expect((await concluir('servico', p1.pergunta_id, 'falhou')).ok).toBe(true);
    expect((await concluir('servico', p2.pergunta_id, 'concluida')).ok).toBe(true);
    // A que falhou voltou para o link.
    expect(ok(await perguntarLink(empresaA, id)).p.restantes).toBe(0);

    const linha = await um(s.lerDireto<{ status: string; modelo: string; tokens_entrada: number; criado_por: string | null }>(`select status, modelo, tokens_entrada, criado_por from public.marceneiro_perguntas where id = $1`, [p2.pergunta_id]));
    expect(linha).toEqual({ status: 'concluida', modelo: 'modelo-x', tokens_entrada: 900, criado_por: null });
  });

  it('pergunta do link só é encerrada pelo servidor, uma vez', async () => {
    const { id } = await criar(ana, empresaA);
    const p = ok(await perguntarLink(empresaA, id)).p;
    expect(falhou(await concluir(ana, p.pergunta_id)).code).toBe(PERMISSAO_NEGADA);
    expect((await concluir('servico', p.pergunta_id)).ok).toBe(true);
    expect(falhou(await concluir('servico', p.pergunta_id)).code).toBe(PERMISSAO_NEGADA);
  });

  it('ritmo: no máximo 6 perguntas por minuto no mesmo link', async () => {
    const { id } = await criar(ana, empresaA, { limite: 50 });
    for (let i = 0; i < 6; i++) expect((await perguntarLink(empresaA, id)).ok, `pergunta ${i + 1}`).toBe(true);
    expect(falhou(await perguntarLink(empresaA, id)).hint).toBe('devagar');
  });

  it('assinatura vencida desliga o link', async () => {
    const { id } = await criar(bruno, empresaB);
    await s.lerDireto(`update public.empresas set teste_ate = now() - interval '1 hour' where id = $1`, [empresaB]);
    expect(ok(await abrir(empresaB, id)).a).toBeNull();
    expect(falhou(await perguntarLink(empresaB, id)).hint).toBe('assinatura');
    await s.lerDireto(`update public.empresas set teste_ate = now() + interval '14 days' where id = $1`, [empresaB]);
  });
});

describe('editor e cota mensal', () => {
  it('produção não usa; vendas usa; a pergunta é encerrada só por quem fez', async () => {
    expect(falhou(await perguntarEditor(rita, empresaA)).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await perguntarEditor(bruno, empresaA)).code).toBe(PERMISSAO_NEGADA);
    const id = ok(await perguntarEditor(vera, empresaA)).id;
    expect(falhou(await concluir(ana, id)).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await concluir('servico', id)).code).toBe(PERMISSAO_NEGADA);
    expect((await concluir(vera, id)).ok).toBe(true);
    expect(falhou(await s.como('anon', `select public.iniciar_pergunta_editor($1)`, [empresaA])).code).toBe(PERMISSAO_NEGADA);
  });

  it('a cota conta concluídas e em andamento, e vale para link e editor juntos', async () => {
    // Empresa B nova na cota: limite 3.
    await s.lerDireto(`update public.empresas set marceneiro_limite_mensal = 3 where id = $1`, [empresaB]);
    expect(await cota(bruno, empresaB)).toEqual({ usadas: 0, limite: 3 });
    const { id } = await criar(bruno, empresaB);
    const a = ok(await perguntarLink(empresaB, id)).p.pergunta_id;
    const b = ok(await perguntarEditor(bruno, empresaB)).id;
    const c = ok(await perguntarEditor(bruno, empresaB)).id;
    expect(falhou(await perguntarEditor(bruno, empresaB)).hint).toBe('cota_marceneiro');
    expect(falhou(await perguntarLink(empresaB, id)).hint).toBe('cota_marceneiro');
    await concluir('servico', a, 'concluida');
    await concluir(bruno, b, 'falhou');
    await concluir(bruno, c, 'concluida');
    // A que falhou não gasta: abriu uma vaga.
    expect(await cota(bruno, empresaB)).toEqual({ usadas: 2, limite: 3 });
    expect((await perguntarEditor(bruno, empresaB)).ok).toBe(true);
  });

  it('ritmo no editor: no máximo 10 por minuto por usuário', async () => {
    await s.lerDireto(`update public.empresas set marceneiro_limite_mensal = 1000 where id = $1`, [empresaA]);
    // Ana ainda não perguntou pelo editor nesta sessão.
    for (let i = 0; i < 10; i++) expect((await perguntarEditor(ana, empresaA)).ok, `pergunta ${i + 1}`).toBe(true);
    expect(falhou(await perguntarEditor(ana, empresaA)).hint).toBe('devagar');
  });

  it('a API não grava no registro de uso nem no limite da empresa', async () => {
    expect(falhou(await s.como(ana, `insert into public.marceneiro_perguntas (empresa_id) values ($1)`, [empresaA])).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await s.como(ana, `update public.marceneiro_perguntas set status = 'falhou' where empresa_id = $1`, [empresaA])).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await s.como(ana, `update public.empresas set marceneiro_limite_mensal = 100000 where id = $1`, [empresaA])).code).toBe(PERMISSAO_NEGADA);
  });
});
