import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessaoTeste, type Resultado, type Usuario } from '../src/sessao';

/** Etiquetas com QR por peça e a oficina pelo celular. */

let s: SessaoTeste;
let ana: Usuario; // dona da A
let rita: Usuario; // produção da A
let vera: Usuario; // vendas da A
let bruno: Usuario; // dono da B
let empresaA: string;
let empresaB: string;

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

const ETIQUETAS = [
  { componente: 'lateral_esquerda', unidade: 1, codigo: 'P01', nome: 'Lateral esquerda', fita: true, furo: true },
  { componente: 'lateral_direita', unidade: 1, codigo: 'P02', nome: 'Lateral direita', fita: true, furo: true },
  { componente: 'fundo', unidade: 1, codigo: 'P05', nome: 'Fundo', fita: false, furo: false },
  { componente: 'lateral_esquerda', unidade: 2, codigo: 'P01', nome: 'Lateral esquerda', fita: true, furo: true },
];

const criarOrdem = (ator: Usuario, empresa: string, etiquetas: unknown = ETIQUETAS) =>
  s.como<{ id: string; status: string }>(
    ator,
    `insert into public.ordens_producao (empresa_id, numero, projeto_versao, projeto_nome, dados)
     values ($1, 1, 1, 'Roupeiro', $2::jsonb) returning id, status`,
    [empresa, JSON.stringify({ etiquetas, consumo: {} })],
  );
const pecas = (ator: Usuario, ordem: string) =>
  s.exigir<{ id: string; seq: number; componente: string; unidade: number; etapa: string; tem_fita: boolean }>(
    ator,
    `select id, seq, componente, unidade, etapa, tem_fita from public.pecas_ordem where ordem_id = $1 order by seq`,
    [ordem],
  );
const marcar = (ator: Usuario, ids: string[], etapa: string) =>
  s.como<{ n: number }>(ator, `select public.marcar_etapa_pecas($1::uuid[], $2::public.etapa_peca) as n`, [ids, etapa]);

beforeAll(async () => {
  s = await SessaoTeste.abrir();
  ana = await s.criarUsuario('ana@a.test', 'Ana');
  bruno = await s.criarUsuario('bruno@b.test', 'Bruno');
  ({ id: empresaA } = await um(s.exigir<{ id: string }>(ana, `select public.criar_empresa('Marcenaria A') as id`)));
  ({ id: empresaB } = await um(s.exigir<{ id: string }>(bruno, `select public.criar_empresa('Marcenaria B') as id`)));
  rita = await membro('rita@a.test', 'Rita', 'producao');
  vera = await membro('vera@a.test', 'Vera', 'vendas');
});

afterAll(async () => {
  await s?.fechar();
});

describe('peças da ordem', () => {
  it('nascem com a ordem, numeradas na ordem das etiquetas, todas "a cortar"', async () => {
    const r = await criarOrdem(ana, empresaA);
    if (!r.ok) throw new Error(r.erro.message);
    const l = await pecas(ana, r.rows[0]!.id);
    expect(l.map((p) => [p.seq, p.componente, p.unidade, p.etapa])).toEqual([
      [1, 'lateral_esquerda', 1, 'a_cortar'],
      [2, 'lateral_direita', 1, 'a_cortar'],
      [3, 'fundo', 1, 'a_cortar'],
      [4, 'lateral_esquerda', 2, 'a_cortar'],
    ]);
    expect(l[2]!.tem_fita).toBe(false);
  });

  it('ordem antiga, sem etiquetas: nenhuma peça (e a ordem é criada normalmente)', async () => {
    const r = await s.como<{ id: string }>(ana, `insert into public.ordens_producao (empresa_id, numero, projeto_versao, projeto_nome, dados) values ($1, 1, 1, 'Antiga', '{"consumo":{}}') returning id`, [empresaA]);
    if (!r.ok) throw new Error(r.erro.message);
    expect(await pecas(ana, r.rows[0]!.id)).toEqual([]);
  });

  it('etiqueta inválida ou repetida: a ordem inteira é recusada', async () => {
    expect(falhou(await criarOrdem(ana, empresaA, [{ ...ETIQUETAS[0], codigo: "P01'; drop" }])).code).toBe('23514');
    expect(falhou(await criarOrdem(ana, empresaA, [{ ...ETIQUETAS[0], unidade: 'um' }])).code).toBe('22023');
    expect(falhou(await criarOrdem(ana, empresaA, [ETIQUETAS[0], ETIQUETAS[0]])).code).toBe('23505');
    expect(falhou(await criarOrdem(ana, empresaA, { nao: 'lista' })).code).toBe('22023');
  });

  it('ninguém grava direto pela API: nem inserir, nem mudar a etapa, nem apagar', async () => {
    const r = await criarOrdem(ana, empresaA);
    if (!r.ok) throw new Error(r.erro.message);
    const [p] = await pecas(ana, r.rows[0]!.id);
    expect(falhou(await s.como(ana, `update public.pecas_ordem set etapa = 'montada' where id = $1`, [p!.id])).code).toBe('42501');
    expect(falhou(await s.como(ana, `delete from public.pecas_ordem where id = $1`, [p!.id])).code).toBe('42501');
    expect(falhou(await s.como(ana, `insert into public.pecas_ordem (empresa_id, ordem_id, seq, componente, unidade, codigo, nome, tem_fita, tem_furo) values ($1, $2, 99, 'x', 1, 'P99', 'X', false, false)`, [empresaA, r.rows[0]!.id])).code).toBe('42501');
    expect(falhou(await s.como(ana, `insert into public.pecas_ordem_eventos (empresa_id, peca_id, de, para) values ($1, $2, 'a_cortar', 'montada')`, [empresaA, p!.id])).code).toBe('42501');
    // O conteúdo da ordem (e portanto as etiquetas) não muda.
    expect(falhou(await s.como(ana, `update public.ordens_producao set dados = '{}' where id = $1`, [r.rows[0]!.id])).code).toBe('42501');
  });
});

describe('marcar a etapa', () => {
  let ordem: string;
  let ids: string[];

  beforeAll(async () => {
    const r = await criarOrdem(ana, empresaA);
    if (!r.ok) throw new Error(r.erro.message);
    ordem = r.rows[0]!.id;
    ids = (await pecas(ana, ordem)).map((p) => p.id);
  });

  it('a produção marca; guarda quem e quando; a ordem sai de "aguardando" para "em corte"', async () => {
    const r = await marcar(rita, [ids[0]!, ids[1]!], 'cortada');
    if (!r.ok) throw new Error(r.erro.message);
    expect(r.rows[0]!.n).toBe(2);
    const [p] = await s.exigir<{ etapa: string; etapa_por: string; etapa_em: string | null }>(ana, `select etapa, etapa_por, etapa_em from public.pecas_ordem where id = $1`, [ids[0]]);
    expect(p).toMatchObject({ etapa: 'cortada', etapa_por: rita.id });
    expect(p!.etapa_em).not.toBeNull();
    const ev = await s.exigir<{ de: string; para: string; por: string }>(ana, `select de, para, por from public.pecas_ordem_eventos where peca_id = $1`, [ids[0]]);
    expect(ev).toEqual([{ de: 'a_cortar', para: 'cortada', por: rita.id }]);
    const [o] = await s.exigir<{ status: string }>(ana, `select status from public.ordens_producao where id = $1`, [ordem]);
    expect(o!.status).toBe('em_corte');
  });

  it('marcar a mesma etapa de novo não conta nem cria histórico; voltar uma etapa pode', async () => {
    expect((await marcar(rita, [ids[0]!], 'cortada')).ok && (await s.exigir(ana, `select 1 from public.pecas_ordem_eventos where peca_id = $1`, [ids[0]])).length).toBe(1);
    const r = await marcar(ana, [ids[0]!], 'a_cortar');
    if (!r.ok) throw new Error(r.erro.message);
    expect(r.rows[0]!.n).toBe(1);
    const ev = await s.exigir<{ para: string }>(ana, `select para from public.pecas_ordem_eventos where peca_id = $1 order by id`, [ids[0]]);
    expect(ev.map((e) => e.para)).toEqual(['cortada', 'a_cortar']);
  });

  it('andamento da ordem: contagem por etapa, só das peças em que a etapa se aplica', async () => {
    await s.exigir(rita, `select public.marcar_etapa_pecas($1::uuid[], 'fitada')`, [[ids[1]]]);
    await s.exigir(rita, `select public.marcar_etapa_pecas($1::uuid[], 'montada')`, [[ids[2]]]);
    const [a] = await s.exigir<Record<string, number>>(ana, `select total, cortadas, com_fita, fitadas, com_furo, furadas, montadas from public.andamento_ordens where ordem_id = $1`, [ordem]);
    // 4 peças; a 2 fitada (passou do corte), o fundo (sem fita nem furo) montado.
    expect(a).toEqual({ total: 4, cortadas: 2, com_fita: 3, fitadas: 1, com_furo: 3, furadas: 0, montadas: 1 });
    expect(await s.exigir(bruno, `select 1 from public.andamento_ordens where ordem_id = $1`, [ordem])).toEqual([]);
    expect(falhou(await s.como('anon', `select 1 from public.andamento_ordens`)).code).toBe('42501');
  });

  it('vendas vê, mas não marca; outra empresa nem vê', async () => {
    expect((await pecas(vera, ordem)).length).toBe(4);
    expect(falhou(await marcar(vera, [ids[2]!], 'cortada')).code).toBe('42501');
    expect(await pecas(bruno, ordem)).toEqual([]);
    expect(falhou(await marcar(bruno, [ids[2]!], 'cortada')).code).toBe('42501');
    expect((await s.exigir(bruno, `select 1 from public.pecas_ordem_eventos where empresa_id = $1`, [empresaA])).length).toBe(0);
  });

  it('lote misturando peça de outra empresa: nada muda', async () => {
    const rb = await criarOrdem(bruno, empresaB);
    if (!rb.ok) throw new Error(rb.erro.message);
    const deB = (await pecas(bruno, rb.rows[0]!.id))[0]!.id;
    expect(falhou(await marcar(ana, [ids[3]!, deB], 'cortada')).code).toBe('42501');
    const [p] = await s.exigir<{ etapa: string }>(ana, `select etapa from public.pecas_ordem where id = $1`, [ids[3]]);
    expect(p!.etapa).toBe('a_cortar');
  });

  it('peça que não existe, lista vazia ou sem login: recusado', async () => {
    expect(falhou(await marcar(ana, ['00000000-0000-4000-8000-000000000000'], 'cortada')).code).toBe('42501');
    expect(falhou(await marcar(ana, [], 'cortada')).code).toBe('22023');
    expect(falhou(await s.como('anon', `select public.marcar_etapa_pecas($1::uuid[], 'cortada')`, [[ids[0]]])).code).toBe('42501');
  });

  it('sem assinatura ativa: vê, mas não marca', async () => {
    await s.lerDireto(`update public.empresas set teste_ate = now() - interval '1 hour' where id = $1`, [empresaA]);
    const e = falhou(await marcar(rita, [ids[3]!], 'cortada'));
    expect(e.hint).toBe('assinatura');
    expect((await pecas(rita, ordem)).length).toBe(4);
    await s.lerDireto(`update public.empresas set teste_ate = now() + interval '14 days' where id = $1`, [empresaA]);
  });

  it('ordem cancelada: não marca mais', async () => {
    await s.exigir(ana, `update public.ordens_producao set status = 'cancelada' where id = $1`, [ordem]);
    const e = falhou(await marcar(rita, [ids[2]!], 'cortada'));
    expect(e.hint).toBe('ordem_cancelada');
  });

  it('apagar a ordem leva as peças e o histórico junto', async () => {
    const r = await criarOrdem(ana, empresaA);
    if (!r.ok) throw new Error(r.erro.message);
    const id = r.rows[0]!.id;
    const [p] = await pecas(ana, id);
    await s.exigir(rita, `select public.marcar_etapa_pecas($1::uuid[], 'cortada')`, [[p!.id]]);
    await s.exigir(ana, `delete from public.ordens_producao where id = $1`, [id]);
    expect(await s.lerDireto(`select 1 from public.pecas_ordem where ordem_id = $1`, [id])).toEqual([]);
    expect(await s.lerDireto(`select 1 from public.pecas_ordem_eventos where peca_id = $1`, [p!.id])).toEqual([]);
  });
});
