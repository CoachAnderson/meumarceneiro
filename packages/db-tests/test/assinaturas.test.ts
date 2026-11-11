import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessaoTeste, type Resultado, type Usuario } from '../src/sessao';

/** Assinatura — período de teste, trava de gravação, situação vinda do Mercado Pago e isolamento. */

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
interface Situacao { liberada: boolean; teste_ate: string; paga_ate: string | null; status: string | null; agora: string }
const situacao = async (ator: Usuario, empresa: string) => (await um(s.exigir<{ r: Situacao }>(ator, `select public.situacao_assinatura($1) as r`, [empresa]))).r;
const iniciar = (ator: Usuario, empresa: string, plano = 'mensal') => s.como<{ r: { id: string; anteriores: string[] } }>(ator, `select public.iniciar_assinatura($1, $2) as r`, [empresa, plano]);
const vincular = (id: string, mp: string) => s.como('servico', `select public.vincular_assinatura_mp($1, $2, 14900, 'pagador@x.test')`, [id, mp]);
const aplicar = async (id: string, mp: string, status: string, proxima: string | null = null, ultima: string | null = null) =>
  (await um(s.exigir<{ r: boolean }>('servico', `select public.aplicar_assinatura_mp($1, $2, $3, $4::timestamptz, $5::timestamptz) as r`, [id, mp, status, proxima, ultima]))).r;
const criarCliente = (ator: Usuario, empresa: string, nome: string) => s.como(ator, `insert into public.clientes (empresa_id, nome) values ($1, $2)`, [empresa, nome]);
const encerrarTeste = (empresa: string) => s.lerDireto(`update public.empresas set teste_ate = now() - interval '1 hour' where id = $1`, [empresa]);
const dias = (iso: string, agora: string) => (Date.parse(iso) - Date.parse(agora)) / 86_400_000;

async function novaAssinatura(ator: Usuario, empresa: string, mp: string): Promise<string> {
  const r = await iniciar(ator, empresa);
  if (!r.ok) throw new Error(r.erro.message);
  const id = r.rows[0]!.r.id;
  expect((await vincular(id, mp)).ok).toBe(true);
  return id;
}

beforeAll(async () => {
  s = await SessaoTeste.abrir();
  ana = await s.criarUsuario('ana@a.test', 'Ana');
  bruno = await s.criarUsuario('bruno@b.test', 'Bruno');
  ({ id: empresaA } = await um(s.exigir<{ id: string }>(ana, `select public.criar_empresa('Marcenaria A') as id`)));
  ({ id: empresaB } = await um(s.exigir<{ id: string }>(bruno, `select public.criar_empresa('Marcenaria B') as id`)));
  rita = await s.criarUsuario('rita@a.test', 'Rita');
  await s.lerDireto(`insert into public.membros_empresa (empresa_id, usuario_id, papel) values ($1, $2, 'producao')`, [empresaA, rita.id]);
});
afterAll(async () => {
  await s?.fechar();
});

describe('período de teste', () => {
  it('empresa nova começa com 14 dias liberados, sem assinatura', async () => {
    const r = await situacao(ana, empresaA);
    expect(r.liberada).toBe(true);
    expect(r.status).toBeNull();
    expect(r.paga_ate).toBeNull();
    expect(dias(r.teste_ate, r.agora)).toBeCloseTo(14, 1);
  });

  it('qualquer membro consulta a situação; quem é de fora não', async () => {
    expect((await situacao(rita, empresaA)).liberada).toBe(true);
    expect(falhou(await s.como(bruno, `select public.situacao_assinatura($1)`, [empresaA])).code).toBe(PERMISSAO_NEGADA);
  });

  it('a API não altera o fim do teste', async () => {
    expect(falhou(await s.como(ana, `update public.empresas set teste_ate = now() + interval '10 years' where id = $1`, [empresaA])).code).toBe(PERMISSAO_NEGADA);
  });
});

describe('trava de gravação sem assinatura', () => {
  it('durante o teste grava normalmente', async () => {
    expect((await criarCliente(ana, empresaA, 'Cliente do teste')).ok).toBe(true);
  });

  it('fim do teste sem assinatura: lê tudo, não cria nem altera, ainda pode apagar', async () => {
    await encerrarTeste(empresaA);
    expect((await situacao(ana, empresaA)).liberada).toBe(false);
    expect(falhou(await criarCliente(ana, empresaA, 'Novo')).hint).toBe('assinatura');
    expect(falhou(await s.como(ana, `update public.clientes set nome = 'Outro' where empresa_id = $1`, [empresaA])).hint).toBe('assinatura');
    expect((await s.exigir(ana, `select id from public.clientes where empresa_id = $1`, [empresaA])).length).toBe(1);
    // Funções com privilégio de dono também param na trava.
    expect(falhou(await s.como(ana, `select public.iniciar_analise_visao($1)`, [empresaA])).hint).toBe('assinatura');
    const apagou = await s.como(ana, `delete from public.clientes where empresa_id = $1`, [empresaA]);
    expect(apagou.ok && apagou.rowCount).toBe(1);
  });

  it('a trava é por empresa: a vizinha em teste segue gravando', async () => {
    expect((await criarCliente(bruno, empresaB, 'Cliente B')).ok).toBe(true);
  });

  it('o dono continua ajustando a equipe e os dados da empresa', async () => {
    expect((await s.como(ana, `update public.empresas set nome = 'Marcenaria A2' where id = $1`, [empresaA])).ok).toBe(true);
    expect((await s.como(ana, `insert into public.convites (empresa_id, email, papel) values ($1, 'novo@a.test', 'vendas')`, [empresaA])).ok).toBe(true);
  });
});

describe('iniciar a assinatura', () => {
  it('só o dono inicia, e só de plano conhecido', async () => {
    expect(falhou(await iniciar(rita, empresaA)).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await iniciar(bruno, empresaA)).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await iniciar(ana, empresaA, 'vitalicio')).code).toBe('22023');
    expect(falhou(await iniciar('anon' as never, empresaA)).code).toBe(PERMISSAO_NEGADA);
  });

  it('nova tentativa fecha a pendente anterior e devolve o identificador dela para cancelar', async () => {
    const a = await iniciar(ana, empresaA);
    if (!a.ok) throw new Error(a.erro.message);
    expect(a.rows[0]!.r.anteriores).toEqual([]);
    expect((await vincular(a.rows[0]!.r.id, 'mp-antiga-0001')).ok).toBe(true);
    const b = await iniciar(ana, empresaA);
    if (!b.ok) throw new Error(b.erro.message);
    expect(b.rows[0]!.r.anteriores).toEqual(['mp-antiga-0001']);
    const linhas = await s.lerDireto<{ status: string }>(`select status from public.assinaturas where empresa_id = $1 order by created_at`, [empresaA]);
    expect(linhas.map((l) => l.status).sort()).toEqual(['cancelada', 'pendente']);
    expect((await vincular(b.rows[0]!.r.id, 'mp-nova-00001')).ok).toBe(true);
    // Pendente não libera nada.
    expect((await situacao(ana, empresaA)).liberada).toBe(false);
  });

  it('usuário não executa as funções do servidor nem grava na tabela', async () => {
    const id = (await um(s.lerDireto<{ id: string }>(`select id from public.assinaturas where mp_preapproval_id = 'mp-nova-00001'`))).id;
    expect(falhou(await s.como(ana, `select public.aplicar_assinatura_mp($1, 'mp-nova-00001', 'authorized', null, now())`, [id])).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await s.como(ana, `select public.vincular_assinatura_mp($1, 'mp-x-0000001', 1, 'a@a.test')`, [id])).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await s.como(ana, `update public.assinaturas set status = 'ativa', paga_ate = now() + interval '1 year' where id = $1`, [id])).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await s.como(ana, `insert into public.assinaturas (empresa_id, plano, status, paga_ate) values ($1, 'mensal', 'ativa', now() + interval '1 year')`, [empresaA])).code).toBe(PERMISSAO_NEGADA);
  });

  it('só o dono vê os dados de cobrança', async () => {
    expect((await s.exigir(ana, `select id from public.assinaturas where empresa_id = $1`, [empresaA])).length).toBe(2);
    expect((await s.exigir(rita, `select id from public.assinaturas where empresa_id = $1`, [empresaA])).length).toBe(0);
    expect((await s.exigir(bruno, `select id from public.assinaturas`)).length).toBe(0);
  });
});

describe('situação vinda do Mercado Pago', () => {
  let id: string;
  const MP = 'mp-nova-00001';

  beforeAll(async () => {
    id = (await um(s.lerDireto<{ id: string }>(`select id from public.assinaturas where mp_preapproval_id = $1`, [MP]))).id;
  });

  it('identificador que não confere com a referência é ignorado', async () => {
    expect(await aplicar(id, 'mp-de-outro-01', 'authorized')).toBe(false);
    expect(await aplicar('00000000-0000-4000-8000-000000000000', MP, 'authorized')).toBe(false);
    expect((await situacao(ana, empresaA)).liberada).toBe(false);
  });

  it('situação desconhecida é recusada', async () => {
    expect(falhou(await s.como('servico', `select public.aplicar_assinatura_mp($1, $2, 'approved')`, [id, MP])).code).toBe('22023');
  });

  it('autorizada sem cobrança ainda: 3 dias provisórios', async () => {
    expect(await aplicar(id, MP, 'authorized', new Date(Date.now() + 3_600_000).toISOString())).toBe(true);
    const r = await situacao(ana, empresaA);
    expect(r).toMatchObject({ liberada: true, status: 'ativa' });
    expect(dias(r.paga_ate!, r.agora)).toBeCloseTo(3, 1);
    expect((await criarCliente(ana, empresaA, 'Voltou a gravar')).ok).toBe(true);
    // Aviso repetido não estica o prazo provisório.
    expect(await aplicar(id, MP, 'authorized')).toBe(true);
    const de_novo = await situacao(ana, empresaA);
    expect(de_novo.paga_ate).toBe(r.paga_ate);
  });

  it('cobrança aprovada: um mês e 5 dias a partir da cobrança; repetir o aviso não muda nada', async () => {
    const cobranca = '2026-11-10T12:00:00Z';
    expect(await aplicar(id, MP, 'authorized', '2026-12-10T12:00:00Z', cobranca)).toBe(true);
    expect(await aplicar(id, MP, 'authorized', '2026-12-10T12:00:00Z', cobranca)).toBe(true);
    const linha = await um(s.exigir<{ paga_ate: Date; ultima_cobranca: Date; valor_centavos: number }>(ana, `select paga_ate, ultima_cobranca, valor_centavos from public.assinaturas where id = $1`, [id]));
    expect(linha.paga_ate.toISOString()).toBe('2026-12-15T12:00:00.000Z');
    expect(linha.ultima_cobranca.toISOString()).toBe('2026-11-10T12:00:00.000Z');
    expect(linha.valor_centavos).toBe(14900);
  });

  it('já assinante não inicia outra', async () => {
    expect(falhou(await iniciar(ana, empresaA)).hint).toBe('ja_assinante');
  });

  it('pausada ou cancelada: vale até o fim do período pago, depois trava', async () => {
    const recente = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(await aplicar(id, MP, 'authorized', null, recente)).toBe(true);
    expect(await aplicar(id, MP, 'paused')).toBe(true);
    expect(await situacao(ana, empresaA)).toMatchObject({ liberada: true, status: 'pausada' });
    expect(await aplicar(id, MP, 'cancelled')).toBe(true);
    expect(await situacao(ana, empresaA)).toMatchObject({ liberada: true, status: 'cancelada' });
    await s.lerDireto(`update public.assinaturas set paga_ate = now() - interval '1 minute' where id = $1`, [id]);
    expect((await situacao(ana, empresaA)).liberada).toBe(false);
    expect(falhou(await criarCliente(ana, empresaA, 'Travou')).hint).toBe('assinatura');
  });

  it('grafia "canceled" também é aceita', async () => {
    const outro = await novaAssinatura(bruno, empresaB, 'mp-b-00000001');
    expect(await aplicar(outro, 'mp-b-00000001', 'canceled')).toBe(true);
    expect((await um(s.lerDireto<{ status: string }>(`select status from public.assinaturas where id = $1`, [outro]))).status).toBe('cancelada');
  });

  it('pagamento chega para a tentativa antiga depois de abrir uma nova: vale a paga, a nova pendente é fechada', async () => {
    const antiga = await novaAssinatura(bruno, empresaB, 'mp-b-00000002');
    // Simula a falha ao cancelar a antiga no Mercado Pago: o cliente pagou o link velho.
    const nova = await novaAssinatura(bruno, empresaB, 'mp-b-00000003');
    expect(await aplicar(antiga, 'mp-b-00000002', 'authorized', null, new Date().toISOString())).toBe(true);
    const linhas = await s.lerDireto<{ id: string; status: string }>(`select id, status from public.assinaturas where id in ($1, $2)`, [antiga, nova]);
    expect(Object.fromEntries(linhas.map((l) => [l.id, l.status]))).toEqual({ [antiga]: 'ativa', [nova]: 'cancelada' });
  });

  it('uma empresa nunca vê nem altera a assinatura da outra', async () => {
    expect((await s.exigir(ana, `select id from public.assinaturas where empresa_id = $1`, [empresaB])).length).toBe(0);
    expect(falhou(await iniciar(ana, empresaB)).code).toBe(PERMISSAO_NEGADA);
  });
});
