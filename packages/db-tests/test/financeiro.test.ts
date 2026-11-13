import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessaoTeste, type Resultado, type Usuario } from '../src/sessao';

/** Financeiro: contas a receber e a pagar. */

let s: SessaoTeste;
let ana: Usuario; // dona da A
let pedro: Usuario; // projetista da A
let bruno: Usuario; // dono da B
let empresaA: string;
let empresaB: string;
let conta: string;
let catReceita: string;
let catDespesa: string;
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
const lancar = (ator: Usuario | 'anon', empresa: string, extra: Record<string, unknown> = {}) => {
  const campos = { empresa_id: empresa, tipo: 'receber', descricao: 'Roupeiro · parcela 1/3', valor_centavos: 100000, vencimento: '2026-12-10', ...extra };
  const chaves = Object.keys(campos);
  return s.como<{ id: string }>(ator, `insert into public.lancamentos (${chaves.join(', ')}) values (${chaves.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, Object.values(campos));
};
const ler = (id: string) =>
  um(s.exigir<{ status: string; valor_centavos: string; valor_pago_centavos: string | null; pago_em: string | null; grupo: string | null; conta_id: string | null }>(ana, `select status, valor_centavos::text, valor_pago_centavos::text, pago_em::text, grupo, conta_id from public.lancamentos where id = $1`, [id]));
const baixar = (ator: Usuario, id: string, valor: number, parcial = false, data = '2026-11-10') =>
  s.como<{ resto: string | null }>(ator, `select public.baixar_lancamento($1, $2::date, $3, $4, 'pix', $5) as resto`, [id, data, valor, conta, parcial]);

beforeAll(async () => {
  s = await SessaoTeste.abrir();
  ana = await s.criarUsuario('ana@a.test', 'Ana');
  bruno = await s.criarUsuario('bruno@b.test', 'Bruno');
  ({ id: empresaA } = await um(s.exigir<{ id: string }>(ana, `select public.criar_empresa('Marcenaria A') as id`)));
  ({ id: empresaB } = await um(s.exigir<{ id: string }>(bruno, `select public.criar_empresa('Marcenaria B') as id`)));
  pedro = await s.criarUsuario('pedro@a.test', 'Pedro');
  await s.lerDireto(`insert into public.membros_empresa (empresa_id, usuario_id, papel) values ($1, $2, 'projetista')`, [empresaA, pedro.id]);
  ({ id: conta } = await um(s.exigir<{ id: string }>(ana, `insert into public.contas_financeiras (empresa_id, nome, saldo_inicial_centavos) values ($1, 'Banco', 50000) returning id`, [empresaA])));
  ({ id: catReceita } = await um(s.exigir<{ id: string }>(ana, `insert into public.categorias_financeiras (empresa_id, tipo, nome) values ($1, 'receber', 'Venda de móveis') returning id`, [empresaA])));
  ({ id: catDespesa } = await um(s.exigir<{ id: string }>(ana, `insert into public.categorias_financeiras (empresa_id, tipo, nome) values ($1, 'pagar', 'Chapas') returning id`, [empresaA])));
  ({ id: cliente } = await um(s.exigir<{ id: string }>(ana, `insert into public.clientes (empresa_id, nome) values ($1, 'João Pereira') returning id`, [empresaA])));
});

afterAll(async () => {
  await s?.fechar();
});

describe('quem vê o financeiro', () => {
  it('só o dono: projetista, outra empresa e anônimo não veem nem lançam', async () => {
    expect((await lancar(ana, empresaA, { cliente_id: cliente, categoria_id: catReceita })).ok).toBe(true);
    expect(await s.exigir(pedro, `select 1 from public.lancamentos`)).toEqual([]);
    expect(await s.exigir(pedro, `select 1 from public.contas_financeiras`)).toEqual([]);
    expect(falhou(await lancar(pedro, empresaA)).code).toBe('42501');
    expect(await s.exigir(bruno, `select 1 from public.lancamentos where empresa_id = $1`, [empresaA])).toEqual([]);
    expect(falhou(await lancar(bruno, empresaA)).code).toBe('42501');
    expect(falhou(await lancar('anon', empresaA)).code).toBe('42501');
    expect(await s.exigir(bruno, `select 1 from public.saldos_contas where empresa_id = $1`, [empresaA])).toEqual([]);
  });

  it('não liga conta, categoria ou cliente de outra empresa; categoria tem o tipo certo', async () => {
    const { id: contaB } = await um(s.exigir<{ id: string }>(bruno, `insert into public.contas_financeiras (empresa_id, nome) values ($1, 'Caixa') returning id`, [empresaB]));
    expect(falhou(await lancar(ana, empresaA, { conta_id: contaB })).code).toBe('23503');
    expect(falhou(await lancar(bruno, empresaB, { cliente_id: cliente })).code).toBe('23503');
    expect(falhou(await lancar(ana, empresaA, { categoria_id: catDespesa })).code).toBe('23514');
    // Cliente só em conta a receber; fornecedor só em conta a pagar.
    expect(falhou(await lancar(ana, empresaA, { tipo: 'pagar', cliente_id: cliente })).code).toBe('23514');
  });
});

describe('baixa, estorno e cancelamento', () => {
  it('baixa integral: pago com data, valor e conta; saldo da conta sobe', async () => {
    const { id } = await um(s.exigir<{ id: string }>(ana, `insert into public.lancamentos (empresa_id, tipo, descricao, valor_centavos, vencimento) values ($1, 'receber', 'Cozinha', 200000, '2026-11-10') returning id`, [empresaA]));
    const r = await baixar(ana, id, 200000);
    if (!r.ok) throw new Error(r.erro.message);
    expect(r.rows[0]!.resto).toBeNull();
    expect(await ler(id)).toMatchObject({ status: 'pago', valor_pago_centavos: '200000', pago_em: '2026-11-10', conta_id: conta });
    const [saldo] = await s.exigir<{ saldo_centavos: string }>(ana, `select saldo_centavos::text from public.saldos_contas where conta_id = $1`, [conta]);
    expect(saldo!.saldo_centavos).toBe('250000');
  });

  it('baixa parcial: esta parte fica paga e o resto vira outro lançamento em aberto, no mesmo grupo', async () => {
    const { id } = await um(s.exigir<{ id: string }>(ana, `insert into public.lancamentos (empresa_id, tipo, descricao, valor_centavos, vencimento) values ($1, 'receber', 'Painel', 100000, '2026-11-20') returning id`, [empresaA]));
    const r = await baixar(ana, id, 40000, true);
    if (!r.ok) throw new Error(r.erro.message);
    const resto = r.rows[0]!.resto!;
    expect(await ler(id)).toMatchObject({ status: 'pago', valor_centavos: '40000', valor_pago_centavos: '40000', grupo: id });
    const [novo] = await s.exigir<{ status: string; valor_centavos: string; vencimento: string; grupo: string }>(ana, `select status, valor_centavos::text, vencimento::text, grupo from public.lancamentos where id = $1`, [resto]);
    expect(novo).toEqual({ status: 'aberto', valor_centavos: '60000', vencimento: '2026-11-20', grupo: id });
  });

  it('pago não muda sem estornar; estorno volta para aberto; não baixa duas vezes', async () => {
    const { id } = await um(s.exigir<{ id: string }>(ana, `insert into public.lancamentos (empresa_id, tipo, descricao, valor_centavos, vencimento) values ($1, 'pagar', 'MDF', 80000, '2026-11-05') returning id`, [empresaA]));
    await baixar(ana, id, 80000);
    expect(falhou(await s.como(ana, `update public.lancamentos set valor_centavos = 1 where id = $1`, [id])).hint).toBe('lancamento_pago');
    expect(falhou(await baixar(ana, id, 80000)).hint).toBe('nao_aberto');
    expect((await s.como(ana, `update public.lancamentos set observacao = 'NF 123' where id = $1`, [id])).ok).toBe(true);
    expect((await s.como(ana, `select public.estornar_lancamento($1)`, [id])).ok).toBe(true);
    expect(await ler(id)).toMatchObject({ status: 'aberto', valor_pago_centavos: null, pago_em: null });
  });

  it('status e pagamento não mudam direto pela API, só pelas funções', async () => {
    const { id } = await um(s.exigir<{ id: string }>(ana, `insert into public.lancamentos (empresa_id, tipo, descricao, valor_centavos, vencimento) values ($1, 'receber', 'X', 100, '2026-11-05') returning id`, [empresaA]));
    expect(falhou(await s.como(ana, `update public.lancamentos set status = 'pago', pago_em = '2026-11-05', valor_pago_centavos = 100 where id = $1`, [id])).code).toBe('42501');
    expect((await s.como(ana, `select public.cancelar_lancamento($1)`, [id])).ok).toBe(true);
    expect((await ler(id)).status).toBe('cancelado');
    expect(falhou(await baixar(ana, id, 100)).hint).toBe('nao_aberto');
    expect((await s.como(ana, `select public.cancelar_lancamento($1, false)`, [id])).ok).toBe(true);
    expect((await ler(id)).status).toBe('aberto');
  });

  it('data de pagamento no futuro, valor zero e lançamento de outra empresa: recusado', async () => {
    const { id } = await um(s.exigir<{ id: string }>(ana, `insert into public.lancamentos (empresa_id, tipo, descricao, valor_centavos, vencimento) values ($1, 'receber', 'Y', 100, '2026-11-05') returning id`, [empresaA]));
    expect(falhou(await baixar(ana, id, 100, false, '2099-01-01')).code).toBe('22023');
    expect(falhou(await baixar(ana, id, 0)).code).toBe('22023');
    expect(falhou(await baixar(bruno, id, 100)).code).toBe('42501');
    expect(falhou(await s.como(pedro, `select public.estornar_lancamento($1)`, [id])).hint).toBe('nao_pago');
  });

  it('conta com lançamento pago não pode ser apagada', async () => {
    expect(falhou(await s.como(ana, `delete from public.contas_financeiras where id = $1`, [conta])).code).toBe('23503');
  });

  it('sem assinatura ativa: vê, mas não lança', async () => {
    await s.lerDireto(`update public.empresas set teste_ate = now() - interval '1 hour' where id = $1`, [empresaA]);
    expect(falhou(await lancar(ana, empresaA)).hint).toBe('assinatura');
    expect((await s.exigir(ana, `select 1 from public.lancamentos`)).length).toBeGreaterThan(0);
    await s.lerDireto(`update public.empresas set teste_ate = now() + interval '14 days' where id = $1`, [empresaA]);
  });
});
