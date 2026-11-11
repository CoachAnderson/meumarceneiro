import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessaoTeste, type Resultado, type Usuario } from '../src/sessao';

/** Painel do dono do sistema — quem entra, o que vê e os números. */

let s: SessaoTeste;
let chefe: Usuario; // administrador da plataforma
let ana: Usuario; // dona da A (assinante)
let bruno: Usuario; // dono da B (em teste)
let carla: Usuario; // dona da C (teste vencido)
let empresaA: string;
let empresaB: string;
let empresaC: string;

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
interface Linha { id: string; nome: string; dono_email: string; situacao: string; usuarios: number; projetos: number; valor_centavos: number | null; total_pago_centavos: number; assinatura_status: string | null }
const empresas = async (ator: Usuario) => (await um(s.exigir<{ r: Linha[] }>(ator, `select public.admin_empresas() as r`))).r;
interface Resumo { recorrente_centavos: number; recebido_mes_centavos: number; empresas_novas_30d: number; cancelamentos_30d: number; meses: Array<{ mes: string; centavos: number; cobrancas: number }> }
const resumo = async (ator: Usuario) => (await um(s.exigir<{ r: Resumo }>(ator, `select public.admin_resumo() as r`))).r;
const aplicar = (id: string, mp: string, status: string, ultima: string | null) => s.exigir('servico', `select public.aplicar_assinatura_mp($1, $2, $3, null, $4::timestamptz)`, [id, mp, status, ultima]);

beforeAll(async () => {
  s = await SessaoTeste.abrir();
  chefe = await s.criarUsuario('chefe@sistema.test', 'Chefe');
  ana = await s.criarUsuario('ana@a.test', 'Ana');
  bruno = await s.criarUsuario('bruno@b.test', 'Bruno');
  carla = await s.criarUsuario('carla@c.test', 'Carla');
  ({ id: empresaA } = await um(s.exigir<{ id: string }>(ana, `select public.criar_empresa('Marcenaria A') as id`)));
  ({ id: empresaB } = await um(s.exigir<{ id: string }>(bruno, `select public.criar_empresa('Marcenaria B') as id`)));
  ({ id: empresaC } = await um(s.exigir<{ id: string }>(carla, `select public.criar_empresa('Marcenaria C') as id`)));
  await s.lerDireto(`insert into public.administradores_plataforma (usuario_id) values ($1)`, [chefe.id]);
  await s.lerDireto(`update public.empresas set teste_ate = now() - interval '2 days' where id = $1`, [empresaC]);
  // A assina e é cobrada duas vezes: mês passado e agora.
  const { r } = await um(s.exigir<{ r: { id: string } }>(ana, `select public.iniciar_assinatura($1, 'mensal') as r`, [empresaA]));
  await s.exigir('servico', `select public.vincular_assinatura_mp($1, 'mp-painel-0001', 14900, 'ana@a.test')`, [r.id]);
  const mesPassado = (await um(s.lerDireto<{ d: string }>(`select (now() - interval '1 month')::text as d`))).d;
  const agora = (await um(s.lerDireto<{ d: string }>(`select now()::text as d`))).d;
  await aplicar(r.id, 'mp-painel-0001', 'authorized', mesPassado);
  await aplicar(r.id, 'mp-painel-0001', 'authorized', agora);
  await aplicar(r.id, 'mp-painel-0001', 'authorized', agora); // aviso repetido
});
afterAll(async () => {
  await s?.fechar();
});

describe('quem entra no painel', () => {
  it('só o administrador executa as consultas e a extensão de teste', async () => {
    for (const ator of [ana, bruno]) {
      expect(falhou(await s.como(ator, `select public.admin_empresas()`)).code).toBe(PERMISSAO_NEGADA);
      expect(falhou(await s.como(ator, `select public.admin_resumo()`)).code).toBe(PERMISSAO_NEGADA);
      expect(falhou(await s.como(ator, `select public.admin_estender_teste($1, 30)`, [empresaB])).code).toBe(PERMISSAO_NEGADA);
    }
    expect(falhou(await s.como('anon', `select public.admin_empresas()`)).code).toBe(PERMISSAO_NEGADA);
  });

  it('ninguém se promove a administrador pela API; cada um só vê a própria linha', async () => {
    expect(falhou(await s.como(ana, `insert into public.administradores_plataforma (usuario_id) values ($1)`, [ana.id])).code).toBe(PERMISSAO_NEGADA);
    expect((await s.exigir(ana, `select usuario_id from public.administradores_plataforma`)).length).toBe(0);
    expect((await s.exigir(chefe, `select usuario_id from public.administradores_plataforma`)).length).toBe(1);
  });

  it('ser administrador não abre os dados de trabalho das marcenarias', async () => {
    await s.exigir(ana, `insert into public.clientes (empresa_id, nome) values ($1, 'Cliente da Ana')`, [empresaA]);
    expect((await s.exigir(chefe, `select id from public.clientes`)).length).toBe(0);
    expect((await s.exigir(chefe, `select id from public.assinaturas`)).length).toBe(0);
    expect(falhou(await s.como(chefe, `insert into public.clientes (empresa_id, nome) values ($1, 'Intruso')`, [empresaA])).code).toBe(PERMISSAO_NEGADA);
  });
});

describe('o que o painel mostra', () => {
  it('uma linha por marcenaria, com dono e situação da licença', async () => {
    const l = await empresas(chefe);
    const por = Object.fromEntries(l.map((x) => [x.id, x]));
    expect(l.length).toBe(3);
    expect(por[empresaA]).toMatchObject({ nome: 'Marcenaria A', dono_email: 'ana@a.test', situacao: 'ativa', assinatura_status: 'ativa', valor_centavos: 14900, total_pago_centavos: 29800, usuarios: 1 });
    expect(por[empresaB]).toMatchObject({ situacao: 'teste', assinatura_status: null, total_pago_centavos: 0 });
    expect(por[empresaC]).toMatchObject({ situacao: 'bloqueada', dono_email: 'carla@c.test' });
  });

  it('receita: recorrente, recebido no mês e os últimos 6 meses; aviso repetido não duplica cobrança', async () => {
    const r = await resumo(chefe);
    expect(r.recorrente_centavos).toBe(14900);
    expect(r.empresas_novas_30d).toBe(3);
    expect(r.meses.length).toBe(6);
    expect(r.meses.reduce((t, m) => t + m.centavos, 0)).toBe(29800);
    expect(r.meses.reduce((t, m) => t + m.cobrancas, 0)).toBe(2);
    expect(r.meses.at(-1)!.centavos).toBe(r.recebido_mes_centavos);
    expect((await s.lerDireto(`select id from public.assinatura_cobrancas`)).length).toBe(2);
  });

  it('cancelada com período pago: encerrando, sai da receita recorrente e conta como cancelamento', async () => {
    const id = (await um(s.lerDireto<{ id: string }>(`select id from public.assinaturas where mp_preapproval_id = 'mp-painel-0001'`))).id;
    await aplicar(id, 'mp-painel-0001', 'cancelled', null);
    expect((await empresas(chefe)).find((x) => x.id === empresaA)!.situacao).toBe('encerrando');
    const r = await resumo(chefe);
    expect(r.recorrente_centavos).toBe(0);
    expect(r.cancelamentos_30d).toBe(1);
  });

  it('o dono vê as próprias cobranças; outra empresa não', async () => {
    expect((await s.exigir(ana, `select id from public.assinatura_cobrancas`)).length).toBe(2);
    expect((await s.exigir(bruno, `select id from public.assinatura_cobrancas`)).length).toBe(0);
  });
});

describe('estender o teste', () => {
  it('teste vencido: conta a partir de hoje e a empresa volta a gravar', async () => {
    expect(falhou(await s.como(carla, `insert into public.clientes (empresa_id, nome) values ($1, 'Cliente X')`, [empresaC])).hint).toBe('assinatura');
    const { d } = await um(s.exigir<{ d: number }>(chefe, `select extract(epoch from public.admin_estender_teste($1, 15) - now()) / 86400 as d`, [empresaC]));
    expect(Number(d)).toBeCloseTo(15, 1);
    expect((await empresas(chefe)).find((x) => x.id === empresaC)!.situacao).toBe('teste');
    const gravou = await s.como(carla, `insert into public.clientes (empresa_id, nome) values ($1, 'Cliente X')`, [empresaC]);
    expect(gravou.ok ? '' : gravou.erro.message).toBe('');
  });

  it('teste em curso: soma ao fim atual; limites de 1 a 90 dias', async () => {
    const { d } = await um(s.exigir<{ d: number }>(chefe, `select extract(epoch from public.admin_estender_teste($1, 7) - now()) / 86400 as d`, [empresaB]));
    expect(Number(d)).toBeCloseTo(21, 1);
    expect(falhou(await s.como(chefe, `select public.admin_estender_teste($1, 0)`, [empresaB])).code).toBe('22023');
    expect(falhou(await s.como(chefe, `select public.admin_estender_teste($1, 91)`, [empresaB])).code).toBe('22023');
    expect(falhou(await s.como(chefe, `select public.admin_estender_teste('00000000-0000-4000-8000-000000000000', 5)`)).code).toBe('P0002');
  });
});

describe('aceite dos termos', () => {
  it('o cadastro grava a versão aceita e a hora do servidor; versão malformada é ignorada', async () => {
    const criar = async (email: string, versao: unknown) =>
      (await um(s.lerDireto<{ id: string }>(`insert into auth.users (id, email, raw_user_meta_data, aud, role) values (gen_random_uuid(), $1, $2::jsonb, 'authenticated', 'authenticated') returning id`, [email, JSON.stringify({ nome: 'Novo', termos_versao: versao })]))).id;
    const ok = await criar('aceitou@x.test', '2026-11-11');
    const ruim = await criar('ruim@x.test', '<script>');
    const ler = (id: string) => um(s.lerDireto<{ termos_versao: string | null; aceitou: boolean }>(`select termos_versao, termos_aceitos_em is not null as aceitou from public.usuarios where id = $1`, [id]));
    expect(await ler(ok)).toEqual({ termos_versao: '2026-11-11', aceitou: true });
    expect(await ler(ruim)).toEqual({ termos_versao: null, aceitou: false });
  });

  it('a pessoa não altera o próprio aceite pela API', async () => {
    expect(falhou(await s.como(ana, `update public.usuarios set termos_versao = '2020-01-01', termos_aceitos_em = now() where id = $1`, [ana.id])).code).toBe(PERMISSAO_NEGADA);
  });
});
