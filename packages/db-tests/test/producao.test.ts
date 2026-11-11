import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessaoTeste, type Resultado, type Usuario } from '../src/sessao';

/** Fase 9 — ordens de produção, baixa de estoque atômica e estorno. */

let s: SessaoTeste;
let ana: Usuario; // dona da A
let rita: Usuario; // produção da A
let vera: Usuario; // vendas da A
let bruno: Usuario; // dono da B
let empresaA: string;
let empresaB: string;
let material: string;
let chapa: string;
let fita: string;
let ferragem: string;
let retalho: string;
let ordem: string;

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
async function membro(email: string, nome: string, papel: string): Promise<Usuario> {
  const u = await s.criarUsuario(email, nome);
  await s.lerDireto(`insert into public.membros_empresa (empresa_id, usuario_id, papel) values ($1, $2, $3)`, [empresaA, u.id, papel]);
  return u;
}
async function saldo(coluna: 'chapa_id' | 'fita_id' | 'ferragem_id', id: string): Promise<number> {
  const l = await s.exigir<{ saldo: string }>(ana, `select saldo from public.estoque_saldos where ${coluna} = $1`, [id]);
  return l[0] ? Number(l[0].saldo) : 0;
}
const qtdRetalho = async (id: string) => (await s.lerDireto<{ quantidade: number }>(`select quantidade from public.retalhos where id = $1`, [id]))[0]?.quantidade ?? null;

function consumo(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    pecas: [],
    consumo: {
      chapas: [{ id: chapa, quantidade: 2 }],
      fitas: [{ id: fita, dmm: 164500 }],
      ferragens: [{ id: ferragem, quantidade: 6 }],
      retalhos: [{ id: retalho, quantidade: 1 }],
      sobras: [{ material_id: material, comprimento_dmm: 12000, largura_dmm: 4000, quantidade: 1 }],
      ...extra,
    },
  });
}
const criarOrdem = (ator: Usuario, empresa = empresaA, dados = consumo()) =>
  s.como<{ id: string; numero: number; status: string }>(
    ator,
    `insert into public.ordens_producao (empresa_id, numero, projeto_versao, projeto_nome, dados, status, baixa_em)
     values ($1, 77, 1, 'Cozinha', $2::jsonb, 'concluida', now()) returning id, numero, status`,
    [empresa, dados],
  );
const baixar = (ator: Usuario, id: string, forcar = false) =>
  s.como<{ r: { baixado: boolean; faltas: Array<{ tipo: string; precisa: number; tem: number }>; sobras_guardadas?: number } }>(ator, `select public.baixar_estoque_ordem($1, $2) as r`, [id, forcar]);

beforeAll(async () => {
  s = await SessaoTeste.abrir();
  ana = await s.criarUsuario('ana@a.test', 'Ana');
  bruno = await s.criarUsuario('bruno@b.test', 'Bruno');
  ({ id: empresaA } = await um(s.exigir<{ id: string }>(ana, `select public.criar_empresa('Marcenaria A') as id`)));
  ({ id: empresaB } = await um(s.exigir<{ id: string }>(bruno, `select public.criar_empresa('Marcenaria B') as id`)));
  rita = await membro('rita@a.test', 'Rita', 'producao');
  vera = await membro('vera@a.test', 'Vera', 'vendas');
  ({ id: material } = await um(s.exigir<{ id: string }>(ana, `insert into public.materiais (empresa_id, tipo, nome, espessura_nominal_dmm) values ($1, 'mdf', 'MDF Branco', 180) returning id`, [empresaA])));
  ({ id: chapa } = await um(s.exigir<{ id: string }>(ana, `insert into public.chapas (empresa_id, material_id, comprimento_dmm, largura_dmm) values ($1, $2, 27500, 18500) returning id`, [empresaA, material])));
  ({ id: fita } = await um(s.exigir<{ id: string }>(ana, `insert into public.fitas (empresa_id, nome, largura_dmm, espessura_cmm) values ($1, 'Fita Branco', 220, 45) returning id`, [empresaA])));
  ({ id: ferragem } = await um(s.exigir<{ id: string }>(ana, `insert into public.ferragens (empresa_id, tipo, nome) values ($1, 'dobradica_reta', 'Dobradiça reta') returning id`, [empresaA])));
  ({ id: retalho } = await um(s.exigir<{ id: string }>(ana, `insert into public.retalhos (empresa_id, material_id, comprimento_dmm, largura_dmm, quantidade) values ($1, $2, 9000, 6000, 1) returning id`, [empresaA, material])));
  await s.exigir(ana, `select public.definir_estoque(p_chapa => $1, p_saldo => 5)`, [chapa]);
  await s.exigir(ana, `select public.definir_estoque(p_fita => $1, p_saldo => 500000)`, [fita]);
});

afterAll(async () => {
  await s?.fechar();
});

describe('estoque de ferragens', () => {
  it('produção ajusta; vendas não', async () => {
    await s.exigir(rita, `select public.definir_estoque_ferragem($1, 4, 'Contagem')`, [ferragem]);
    expect(await saldo('ferragem_id', ferragem)).toBe(4);
    expect(falhou(await s.como(vera, `select public.definir_estoque_ferragem($1, 10)`, [ferragem])).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await s.como(bruno, `select public.definir_estoque_ferragem($1, 10)`, [ferragem])).code).toBe(PERMISSAO_NEGADA);
  });

  it('ferragem com movimento não pode ser excluída', async () => {
    expect(falhou(await s.como(ana, `delete from public.ferragens where id = $1`, [ferragem])).code).toBe('23503');
  });
});

describe('ordem de produção', () => {
  it('dono cria; número, status e baixa são do banco', async () => {
    const r = await criarOrdem(ana);
    expect(r.ok && r.rows[0]).toMatchObject({ numero: 1, status: 'aguardando' });
    ordem = r.ok ? r.rows[0]!.id : '';
    const o = await um(s.lerDireto<{ baixa_em: string | null }>(`select baixa_em from public.ordens_producao where id = $1`, [ordem]));
    expect(o.baixa_em).toBeNull();
  });

  it('produção e vendas não criam; produção muda o status; vendas não', async () => {
    expect(falhou(await criarOrdem(rita)).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await criarOrdem(vera)).code).toBe(PERMISSAO_NEGADA);
    await s.exigir(rita, `update public.ordens_producao set status = 'em_corte' where id = $1`, [ordem]);
    const v = await s.como(vera, `update public.ordens_producao set status = 'concluida' where id = $1 returning id`, [ordem]);
    expect(v.ok && v.rowCount).toBe(0);
  });

  it('conteúdo e baixa não mudam pela API', async () => {
    expect(falhou(await s.como(ana, `update public.ordens_producao set dados = '{}'::jsonb where id = $1`, [ordem])).code).toBe(PERMISSAO_NEGADA);
    expect(falhou(await s.como(ana, `update public.ordens_producao set baixa_em = now() where id = $1`, [ordem])).code).toBe(PERMISSAO_NEGADA);
  });
});

describe('baixa de estoque', () => {
  it('falta ferragem: não baixa nada e diz o que falta', async () => {
    const r = await baixar(rita, ordem);
    expect(r.ok && r.rows[0]!.r).toEqual({ baixado: false, faltas: [{ tipo: 'ferragem', nome: 'Dobradiça reta', precisa: 6, tem: 4 }] });
    expect(await saldo('chapa_id', chapa)).toBe(5);
    expect(await saldo('fita_id', fita)).toBe(500000);
    expect(await qtdRetalho(retalho)).toBe(1);
  });

  it('com estoque: baixa tudo de uma vez e guarda a sobra como retalho', async () => {
    await s.exigir(ana, `select public.definir_estoque_ferragem($1, 10)`, [ferragem]);
    const r = await baixar(rita, ordem);
    expect(r.ok && r.rows[0]!.r).toEqual({ baixado: true, faltas: [], sobras_guardadas: 1 });
    expect(await saldo('chapa_id', chapa)).toBe(3);
    expect(await saldo('fita_id', fita)).toBe(500000 - 164500);
    expect(await saldo('ferragem_id', ferragem)).toBe(4);
    expect(await qtdRetalho(retalho)).toBe(0);
    const sobras = await s.lerDireto<{ comprimento_dmm: number; observacoes: string }>(`select comprimento_dmm, observacoes from public.retalhos where empresa_id = $1 and comprimento_dmm = 12000`, [empresaA]);
    expect(sobras).toEqual([{ comprimento_dmm: 12000, observacoes: 'Sobra da ordem nº 1' }]);
    const mov = await s.lerDireto<{ tipo: string; motivo: string }>(`select tipo, motivo from public.estoque_movimentos where ordem_id = $1`, [ordem]);
    expect(mov).toHaveLength(3);
    expect(mov.every((m) => m.tipo === 'saida' && m.motivo === 'Ordem de produção nº 1')).toBe(true);
  });

  it('a mesma ordem não baixa duas vezes', async () => {
    expect(falhou(await baixar(ana, ordem)).hint).toBe('ordem_ja_baixada');
    expect(await saldo('chapa_id', chapa)).toBe(3);
  });

  it('ordem com baixa não pode ser cancelada nem excluída sem estorno', async () => {
    expect(falhou(await s.como(ana, `update public.ordens_producao set status = 'cancelada' where id = $1`, [ordem])).hint).toBe('ordem_com_baixa');
    const d = await s.como(ana, `delete from public.ordens_producao where id = $1 returning id`, [ordem]);
    expect(d.ok && d.rowCount).toBe(0);
  });

  it('retalho que não existe mais: recusa, mesmo forçando', async () => {
    const r = await criarOrdem(ana);
    const id = r.ok ? r.rows[0]!.id : '';
    expect(falhou(await baixar(ana, id, true)).hint).toBe('retalho_indisponivel');
    expect(await saldo('chapa_id', chapa)).toBe(3);
  });

  it('forçar: baixa com falta e deixa o saldo negativo à vista', async () => {
    const r = await criarOrdem(ana, empresaA, consumo({ retalhos: [], sobras: [], chapas: [{ id: chapa, quantidade: 4 }] }));
    const id = r.ok ? r.rows[0]!.id : '';
    const semForcar = await baixar(ana, id);
    expect(semForcar.ok && semForcar.rows[0]!.r.baixado).toBe(false);
    const forcado = await baixar(ana, id, true);
    expect(forcado.ok && forcado.rows[0]!.r.baixado).toBe(true);
    expect(await saldo('chapa_id', chapa)).toBe(-1);
    await s.exigir(ana, `select public.estornar_baixa_ordem($1)`, [id]);
    expect(await saldo('chapa_id', chapa)).toBe(3);
  });

  it('erro no meio desfaz tudo: sobra com medida inválida', async () => {
    const r = await criarOrdem(ana, empresaA, consumo({ retalhos: [], ferragens: [], sobras: [{ material_id: material, comprimento_dmm: 10, largura_dmm: 10 }] }));
    const id = r.ok ? r.rows[0]!.id : '';
    expect((await baixar(ana, id)).ok).toBe(false);
    expect(await saldo('chapa_id', chapa)).toBe(3);
    expect(await saldo('fita_id', fita)).toBe(500000 - 164500);
  });
});

describe('estorno', () => {
  it('produção não estorna; dono estorna e tudo volta', async () => {
    expect(falhou(await s.como(rita, `select public.estornar_baixa_ordem($1)`, [ordem])).code).toBe(PERMISSAO_NEGADA);
    await s.exigir(ana, `select public.estornar_baixa_ordem($1)`, [ordem]);
    expect(await saldo('chapa_id', chapa)).toBe(5);
    expect(await saldo('fita_id', fita)).toBe(500000);
    expect(await saldo('ferragem_id', ferragem)).toBe(10);
    expect(await qtdRetalho(retalho)).toBe(1);
    expect(await s.lerDireto(`select 1 from public.retalhos where empresa_id = $1 and comprimento_dmm = 12000`, [empresaA])).toHaveLength(0);
    // Depois do estorno, pode cancelar.
    await s.exigir(ana, `update public.ordens_producao set status = 'cancelada' where id = $1`, [ordem]);
    expect(falhou(await baixar(ana, ordem)).hint).toBe('ordem_cancelada');
  });

  it('estorno sem baixa é recusado', async () => {
    expect(falhou(await s.como(ana, `select public.estornar_baixa_ordem($1)`, [ordem])).hint).toBe('ordem_sem_baixa');
  });
});

describe('isolamento', () => {
  it('outra empresa não vê, não baixa e não usa itens alheios', async () => {
    expect(await s.exigir(bruno, `select id from public.ordens_producao where empresa_id = $1`, [empresaA])).toHaveLength(0);
    expect(falhou(await baixar(bruno, ordem)).code).toBe(PERMISSAO_NEGADA);
    // Ordem da B apontando para chapa da A: a baixa não encontra o item na empresa.
    const r = await criarOrdem(bruno, empresaB, consumo({ retalhos: [], fitas: [], ferragens: [], sobras: [] }));
    const id = r.ok ? r.rows[0]!.id : '';
    expect(falhou(await baixar(bruno, id, true)).hint).toBe('item_inexistente');
    expect(await saldo('chapa_id', chapa)).toBe(5);
  });
});
