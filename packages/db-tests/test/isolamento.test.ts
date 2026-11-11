import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessaoTeste, type Resultado, type Usuario } from '../src/sessao';

/**
 * Critério de aceite da Fase 1:
 * a empresa A não lê nem grava dados da empresa B — e vice-versa.
 *
 * Tudo roda numa transação desfeita no final; o banco fica como estava.
 */

let s: SessaoTeste;
let ana: Usuario; // dona da Marcenaria A
let bruno: Usuario; // dono da Marcenaria B
let carla: Usuario; // será convidada para a Marcenaria A
let diego: Usuario; // usado nos convites expirado e revogado
let empresaA: string;
let empresaB: string;
let clienteA: string;
let clienteB: string;

const PERMISSAO_NEGADA = '42501';

function falhou(r: Resultado<unknown>): { code: string; hint?: string; message: string } {
  if (r.ok) throw new Error('Esperava erro, mas o comando foi aceito.');
  return r.erro;
}

beforeAll(async () => {
  s = await SessaoTeste.abrir();

  ana = await s.criarUsuario('ana@marcenaria-a.test', 'Ana');
  bruno = await s.criarUsuario('bruno@marcenaria-b.test', 'Bruno');
  carla = await s.criarUsuario('Carla@Marcenaria-A.test', 'Carla');
  diego = await s.criarUsuario('diego@marcenaria-a.test', 'Diego');

  [{ id: empresaA }] = (await s.exigir<{ id: string }>(
    ana,
    `select public.criar_empresa('Marcenaria A', '11.222.333/0001-81') as id`,
  )) as [{ id: string }];
  [{ id: empresaB }] = (await s.exigir<{ id: string }>(
    bruno,
    `select public.criar_empresa('Marcenaria B') as id`,
  )) as [{ id: string }];

  [{ id: clienteA }] = (await s.exigir<{ id: string }>(
    ana,
    `insert into public.clientes (empresa_id, nome) values ($1, 'Cliente da A') returning id`,
    [empresaA],
  )) as [{ id: string }];
  [{ id: clienteB }] = (await s.exigir<{ id: string }>(
    bruno,
    `insert into public.clientes (empresa_id, nome) values ($1, 'Cliente da B') returning id`,
    [empresaB],
  )) as [{ id: string }];
});

afterAll(async () => {
  await s?.fechar();
});

describe('Cadastro e criação de empresa', () => {
  it('o Auth cria o perfil do usuário com e-mail em minúsculas', async () => {
    const [perfil] = await s.lerDireto<{ nome: string; email: string }>(
      'select nome, email from public.usuarios where id = $1',
      [carla.id],
    );
    expect(perfil).toEqual({ nome: 'Carla', email: 'carla@marcenaria-a.test' });
  });

  it('criar_empresa torna o criador dono e normaliza o CNPJ', async () => {
    const [empresa] = await s.lerDireto<{ cnpj: string }>('select cnpj from public.empresas where id = $1', [
      empresaA,
    ]);
    expect(empresa?.cnpj).toBe('11222333000181');
    const membros = await s.exigir<{ usuario_id: string; papel: string }>(
      ana,
      'select usuario_id, papel from public.membros_empresa where empresa_id = $1',
      [empresaA],
    );
    expect(membros).toEqual([{ usuario_id: ana.id, papel: 'dono' }]);
  });

  it('aceita CNPJ alfanumérico e normaliza para maiúsculas', async () => {
    const eva = await s.criarUsuario('eva@marcenaria-c.test', 'Eva');
    const [{ id }] = (await s.exigir<{ id: string }>(
      eva,
      `select public.criar_empresa('Marcenaria C', '12.abc.345/01de-35') as id`,
    )) as [{ id: string }];
    const [empresa] = await s.lerDireto<{ cnpj: string }>('select cnpj from public.empresas where id = $1', [id]);
    expect(empresa?.cnpj).toBe('12ABC34501DE35');
  });

  it('visitante anônimo não cria empresa', async () => {
    const erro = falhou(await s.como('anon', `select public.criar_empresa('Intrusa')`));
    expect(erro.code).toBe(PERMISSAO_NEGADA);
  });
});

describe('Critério de aceite: a empresa B não lê nem grava dados da empresa A', () => {
  it('cada usuário vê só a própria empresa', async () => {
    const vistasPorB = await s.exigir<{ id: string }>(bruno, 'select id from public.empresas');
    expect(vistasPorB.map((e) => e.id)).toEqual([empresaB]);
    const vistasPorA = await s.exigir<{ id: string }>(ana, 'select id from public.empresas');
    expect(vistasPorA.map((e) => e.id)).toEqual([empresaA]);
  });

  it('B não lê clientes de A, nem buscando pelo id', async () => {
    const todos = await s.exigir<{ id: string }>(bruno, 'select id from public.clientes');
    expect(todos.map((c) => c.id)).toEqual([clienteB]);
    const direto = await s.exigir(bruno, 'select * from public.clientes where id = $1', [clienteA]);
    expect(direto).toHaveLength(0);
  });

  it('B não insere cliente na empresa A', async () => {
    const erro = falhou(
      await s.como(bruno, `insert into public.clientes (empresa_id, nome) values ($1, 'Invasor')`, [empresaA]),
    );
    expect(erro.code).toBe(PERMISSAO_NEGADA);
    const [{ total }] = (await s.lerDireto<{ total: number }>(
      `select count(*)::int as total from public.clientes where empresa_id = $1`,
      [empresaA],
    )) as [{ total: number }];
    expect(total).toBe(1);
  });

  it('B não altera cliente de A', async () => {
    const r = await s.como(bruno, `update public.clientes set nome = 'Alterado por B' where id = $1`, [clienteA]);
    expect(r.ok && r.rowCount).toBe(0);
    const [linha] = await s.lerDireto<{ nome: string }>('select nome from public.clientes where id = $1', [
      clienteA,
    ]);
    expect(linha?.nome).toBe('Cliente da A');
  });

  it('B não exclui cliente de A', async () => {
    const r = await s.como(bruno, 'delete from public.clientes where id = $1', [clienteA]);
    expect(r.ok && r.rowCount).toBe(0);
    const linhas = await s.lerDireto('select 1 from public.clientes where id = $1', [clienteA]);
    expect(linhas).toHaveLength(1);
  });

  it('B não transfere o próprio cliente para a empresa A', async () => {
    const erro = falhou(
      await s.como(bruno, 'update public.clientes set empresa_id = $1 where id = $2', [empresaA, clienteB]),
    );
    expect(erro.code).toBe(PERMISSAO_NEGADA);
  });

  it('B não altera os dados da empresa A', async () => {
    const r = await s.como(bruno, `update public.empresas set nome = 'Tomada' where id = $1`, [empresaA]);
    expect(r.ok && r.rowCount).toBe(0);
  });

  it('B não vê membros nem perfis da empresa A', async () => {
    const membros = await s.exigir<{ empresa_id: string }>(bruno, 'select empresa_id from public.membros_empresa');
    expect(new Set(membros.map((m) => m.empresa_id))).toEqual(new Set([empresaB]));
    const perfil = await s.exigir(bruno, 'select * from public.usuarios where id = $1', [ana.id]);
    expect(perfil).toHaveLength(0);
  });

  it('B não se coloca como membro da empresa A', async () => {
    const erro = falhou(
      await s.como(bruno, `insert into public.membros_empresa (empresa_id, usuario_id, papel) values ($1, $2, 'dono')`, [
        empresaA,
        bruno.id,
      ]),
    );
    expect(erro.code).toBe(PERMISSAO_NEGADA);
  });

  it('B não cria convite para entrar na empresa A', async () => {
    const erro = falhou(
      await s.como(bruno, `insert into public.convites (empresa_id, email, papel) values ($1, $2, 'dono')`, [
        empresaA,
        bruno.email,
      ]),
    );
    expect(erro.code).toBe(PERMISSAO_NEGADA);
  });

  it('visitante anônimo não lê nenhuma tabela', async () => {
    for (const tabela of ['empresas', 'usuarios', 'membros_empresa', 'convites', 'clientes']) {
      const erro = falhou(await s.como('anon', `select * from public.${tabela}`));
      expect(erro.code, tabela).toBe(PERMISSAO_NEGADA);
    }
  });
});

describe('Convites e papéis', () => {
  let tokenCarla: string;

  it('a dona convida um membro e só ela enxerga o token', async () => {
    const [convite] = await s.exigir<{ token: string }>(
      ana,
      `insert into public.convites (empresa_id, email, papel) values ($1, 'carla@marcenaria-a.test', 'producao')
       returning token`,
      [empresaA],
    );
    tokenCarla = convite!.token;
    expect(tokenCarla).toMatch(/^[0-9a-f]{64}$/);

    const vistosPorB = await s.exigir(bruno, 'select * from public.convites');
    expect(vistosPorB).toHaveLength(0);
  });

  it('quem tem o link vê os dados públicos do convite, mesmo sem login', async () => {
    const [linha] = await s.exigir<{ c: { empresa_nome: string; estado: string; papel: string } }>(
      'anon',
      'select public.ver_convite($1) as c',
      [tokenCarla],
    );
    expect(linha?.c).toMatchObject({ empresa_nome: 'Marcenaria A', estado: 'pendente', papel: 'producao' });
  });

  it('o convite não pode ser aceito por outro e-mail', async () => {
    const erro = falhou(await s.como(bruno, 'select public.aceitar_convite($1)', [tokenCarla]));
    expect(erro.hint).toBe('convite_outro_email');
  });

  it('a convidada aceita e passa a ver só os dados da empresa A', async () => {
    const [aceite] = await s.exigir<{ empresa: string }>(carla, 'select public.aceitar_convite($1) as empresa', [
      tokenCarla,
    ]);
    expect(aceite?.empresa).toBe(empresaA);

    const clientes = await s.exigir<{ id: string }>(carla, 'select id from public.clientes');
    expect(clientes.map((c) => c.id)).toEqual([clienteA]);
    const empresas = await s.exigir<{ id: string }>(carla, 'select id from public.empresas');
    expect(empresas.map((e) => e.id)).toEqual([empresaA]);
  });

  it('o mesmo convite não pode ser usado de novo', async () => {
    const erro = falhou(await s.como(carla, 'select public.aceitar_convite($1)', [tokenCarla]));
    expect(erro.hint).toBe('convite_usado');
  });

  it('produção lê clientes, mas não cria, edita nem exclui', async () => {
    const inserir = falhou(
      await s.como(carla, `insert into public.clientes (empresa_id, nome) values ($1, 'Novo')`, [empresaA]),
    );
    expect(inserir.code).toBe(PERMISSAO_NEGADA);

    const editar = await s.como(carla, `update public.clientes set nome = 'X' where id = $1`, [clienteA]);
    expect(editar.ok && editar.rowCount).toBe(0);

    const excluir = await s.como(carla, 'delete from public.clientes where id = $1', [clienteA]);
    expect(excluir.ok && excluir.rowCount).toBe(0);
  });

  it('um membro não se promove a dono', async () => {
    const r = await s.como(carla, `update public.membros_empresa set papel = 'dono' where usuario_id = $1`, [
      carla.id,
    ]);
    expect(r.ok && r.rowCount).toBe(0);
  });

  it('a dona muda o papel e a permissão muda junto', async () => {
    const r = await s.como(
      ana,
      `update public.membros_empresa set papel = 'vendas' where empresa_id = $1 and usuario_id = $2`,
      [empresaA, carla.id],
    );
    expect(r.ok && r.rowCount).toBe(1);

    const novo = await s.exigir(
      carla,
      `insert into public.clientes (empresa_id, nome) values ($1, 'Cliente cadastrado por vendas') returning id`,
      [empresaA],
    );
    expect(novo).toHaveLength(1);
  });

  it('a única dona não pode sair nem deixar de ser dona', async () => {
    const sair = falhou(
      await s.como(ana, 'delete from public.membros_empresa where empresa_id = $1 and usuario_id = $2', [
        empresaA,
        ana.id,
      ]),
    );
    expect(sair.hint).toBe('ultimo_dono');

    const rebaixar = falhou(
      await s.como(
        ana,
        `update public.membros_empresa set papel = 'vendas' where empresa_id = $1 and usuario_id = $2`,
        [empresaA, ana.id],
      ),
    );
    expect(rebaixar.hint).toBe('ultimo_dono');
  });

  it('um membro pode sair e deixa de ver os dados', async () => {
    const r = await s.como(carla, 'delete from public.membros_empresa where empresa_id = $1 and usuario_id = $2', [
      empresaA,
      carla.id,
    ]);
    expect(r.ok && r.rowCount).toBe(1);
    const clientes = await s.exigir(carla, 'select * from public.clientes');
    expect(clientes).toHaveLength(0);
  });

  it('convite expirado ou revogado é recusado', async () => {
    const [expirado] = await s.exigir<{ id: string; token: string }>(
      ana,
      `insert into public.convites (empresa_id, email, papel) values ($1, $2, 'projetista') returning id, token`,
      [empresaA, diego.email],
    );
    await s.lerDireto(`update public.convites set expira_em = now() - interval '1 day' where id = $1`, [
      expirado!.id,
    ]);
    expect(falhou(await s.como(diego, 'select public.aceitar_convite($1)', [expirado!.token])).hint).toBe(
      'convite_expirado',
    );

    const revogar = await s.como(ana, 'update public.convites set revogado_em = now() where id = $1', [expirado!.id]);
    expect(revogar.ok && revogar.rowCount).toBe(1);
    expect(falhou(await s.como(diego, 'select public.aceitar_convite($1)', [expirado!.token])).hint).toBe(
      'convite_revogado',
    );
  });

  it('token desconhecido é recusado', async () => {
    const erro = falhou(await s.como(diego, 'select public.aceitar_convite($1)', ['naoexiste']));
    expect(erro.hint).toBe('convite_invalido');
  });

  it('e-mail de convite precisa estar em minúsculas e ser válido', async () => {
    for (const email of ['Diego@Marcenaria-A.test', 'sem-arroba']) {
      const erro = falhou(
        await s.como(ana, `insert into public.convites (empresa_id, email, papel) values ($1, $2, 'vendas')`, [
          empresaA,
          email,
        ]),
      );
      expect(erro.code, email).toBe('23514');
    }
  });
});

describe('Manutenção automática', () => {
  it('updated_at muda quando um membro edita o cliente', async () => {
    // Volta a data uma hora sem disparar triggers, para ver o trigger agir depois.
    await s.lerDireto('set local session_replication_role = replica');
    const [antes] = await s.lerDireto<{ updated_at: Date }>(
      `update public.clientes set updated_at = now() - interval '1 hour' where id = $1 returning updated_at`,
      [clienteA],
    );
    await s.lerDireto('set local session_replication_role = origin');
    await s.exigir(ana, `update public.clientes set telefone = '(14) 3333-0000' where id = $1`, [clienteA]);
    const [depois] = await s.lerDireto<{ updated_at: Date }>('select updated_at from public.clientes where id = $1', [
      clienteA,
    ]);
    expect(depois!.updated_at.getTime()).toBeGreaterThan(antes!.updated_at.getTime());
  });
});
