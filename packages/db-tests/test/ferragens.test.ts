import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessaoTeste, type Resultado, type Usuario } from '../src/sessao';

/** Fase 7 — catálogo de ferragens. */

let s: SessaoTeste;
let ana: Usuario; // dona da A
let paulo: Usuario; // projetista da A
let vera: Usuario; // vendas da A
let bruno: Usuario; // dono da B
let empresaA: string;
let empresaB: string;
let fornecedorB: string;
let dobradica: string;

const PERMISSAO_NEGADA = '42501';
const VIOLA_CHECK = '23514';
const VIOLA_FK = '23503';
const DUPLICADO = '23505';

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

const inserir = (ator: Usuario, empresa: string, tipo: string, nome: string, comprimento: number | null = null, fornecedor: string | null = null) =>
  s.como<{ id: string }>(
    ator,
    `insert into public.ferragens (empresa_id, tipo, nome, comprimento_dmm, preco_centavos, fornecedor_id) values ($1, $2, $3, $4, 1290, $5) returning id`,
    [empresa, tipo, nome, comprimento, fornecedor],
  );

beforeAll(async () => {
  s = await SessaoTeste.abrir();
  ana = await s.criarUsuario('ana@a.test', 'Ana');
  bruno = await s.criarUsuario('bruno@b.test', 'Bruno');
  ({ id: empresaA } = await um(s.exigir<{ id: string }>(ana, `select public.criar_empresa('Marcenaria A') as id`)));
  ({ id: empresaB } = await um(s.exigir<{ id: string }>(bruno, `select public.criar_empresa('Marcenaria B') as id`)));
  paulo = await membro('paulo@a.test', 'Paulo', 'projetista');
  vera = await membro('vera@a.test', 'Vera', 'vendas');
  ({ id: fornecedorB } = await um(s.exigir<{ id: string }>(bruno, `insert into public.fornecedores (empresa_id, nome) values ($1, 'Fornecedor B') returning id`, [empresaB])));
});

afterAll(async () => {
  await s?.fechar();
});

describe('ferragens', () => {
  it('projetista cadastra dobradiça e corrediça', async () => {
    const d = await inserir(paulo, empresaA, 'dobradica_reta', 'Dobradiça reta 35 mm com amortecedor');
    expect(d.ok).toBe(true);
    dobradica = d.ok ? d.rows[0]!.id : '';
    expect((await inserir(paulo, empresaA, 'corredica', 'Corrediça telescópica 45 mm', 5000)).ok).toBe(true);
    // Mesmo nome, outro comprimento: outro item.
    expect((await inserir(paulo, empresaA, 'corredica', 'Corrediça telescópica 45 mm', 4500)).ok).toBe(true);
  });

  it('corrediça sem comprimento e dobradiça com comprimento são recusadas', async () => {
    expect(falhou(await inserir(ana, empresaA, 'corredica', 'Corrediça sem medida')).code).toBe(VIOLA_CHECK);
    expect(falhou(await inserir(ana, empresaA, 'dobradica_curva', 'Dobradiça com medida', 5000)).code).toBe(VIOLA_CHECK);
  });

  it('nome repetido no mesmo tipo e medida é recusado', async () => {
    expect(falhou(await inserir(ana, empresaA, 'corredica', 'corrediça telescópica 45 MM', 5000)).code).toBe(DUPLICADO);
  });

  it('vendas só consulta', async () => {
    expect(falhou(await inserir(vera, empresaA, 'puxador', 'Puxador alça 128 mm')).code).toBe(PERMISSAO_NEGADA);
    expect(await s.exigir(vera, `select id from public.ferragens`)).toHaveLength(3);
  });

  it('só o dono exclui', async () => {
    const r = await s.como(paulo, `delete from public.ferragens where id = $1 returning id`, [dobradica]);
    expect(r.ok && r.rowCount).toBe(0);
    await s.exigir(ana, `delete from public.ferragens where id = $1`, [dobradica]);
  });

  it('isolamento: outra empresa não vê, e fornecedor de outra empresa é recusado', async () => {
    expect(await s.exigir(bruno, `select id from public.ferragens`)).toHaveLength(0);
    expect(falhou(await inserir(ana, empresaA, 'puxador', 'Puxador cava', null, fornecedorB)).code).toBe(VIOLA_FK);
    expect(falhou(await inserir(bruno, empresaA, 'puxador', 'Puxador cava')).code).toBe(PERMISSAO_NEGADA);
  });
});
