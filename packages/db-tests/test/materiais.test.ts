import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessaoTeste, type Resultado, type Usuario } from '../src/sessao';

/**
 * Fase 2 — materiais, chapas, fitas, fornecedores e estoque.
 * Critério de aceite: validações de espessura e medidas; importação por CSV
 * (aqui, a função de banco que recebe as linhas já lidas pelo app).
 */

let s: SessaoTeste;
let ana: Usuario; // dona da Marcenaria A
let paulo: Usuario; // projetista da A
let rita: Usuario; // produção da A
let vera: Usuario; // vendas da A
let bruno: Usuario; // dono da Marcenaria B
let empresaA: string;
let empresaB: string;
let fornecedorA: string;
let materialA: string;
let chapaA: string;
let fitaA: string;
let materialB: string;

const PERMISSAO_NEGADA = '42501';
const VIOLA_CHECK = '23514';
const VIOLA_FK = '23503';
const DUPLICADO = '23505';

function falhou(r: Resultado<unknown>) {
  if (r.ok) throw new Error('Esperava erro, mas o comando foi aceito.');
  return r.erro;
}

async function um<T>(promessa: Promise<T[]>): Promise<T> {
  const linhas = await promessa;
  if (!linhas[0]) throw new Error('Nenhuma linha retornada.');
  return linhas[0];
}

async function saldo(ator: Usuario, coluna: 'chapa_id' | 'fita_id', id: string): Promise<number | null> {
  const linhas = await s.exigir<{ saldo: string }>(
    ator,
    `select saldo from public.estoque_saldos where ${coluna} = $1`,
    [id],
  );
  return linhas[0] ? Number(linhas[0].saldo) : null;
}

async function membro(email: string, nome: string, papel: string): Promise<Usuario> {
  const u = await s.criarUsuario(email, nome);
  await s.lerDireto(`insert into public.membros_empresa (empresa_id, usuario_id, papel) values ($1, $2, $3)`, [
    empresaA,
    u.id,
    papel,
  ]);
  return u;
}

beforeAll(async () => {
  s = await SessaoTeste.abrir();
  ana = await s.criarUsuario('ana@a.test', 'Ana');
  bruno = await s.criarUsuario('bruno@b.test', 'Bruno');
  ({ id: empresaA } = await um(s.exigir<{ id: string }>(ana, `select public.criar_empresa('Marcenaria A') as id`)));
  ({ id: empresaB } = await um(s.exigir<{ id: string }>(bruno, `select public.criar_empresa('Marcenaria B') as id`)));
  paulo = await membro('paulo@a.test', 'Paulo', 'projetista');
  rita = await membro('rita@a.test', 'Rita', 'producao');
  vera = await membro('vera@a.test', 'Vera', 'vendas');

  ({ id: fornecedorA } = await um(
    s.exigir<{ id: string }>(ana, `insert into public.fornecedores (empresa_id, nome) values ($1, 'Madeireira Tupã') returning id`, [
      empresaA,
    ]),
  ));
  ({ id: materialA } = await um(
    s.exigir<{ id: string }>(
      paulo,
      `insert into public.materiais (empresa_id, tipo, nome, fabricante, cor_padrao, espessura_nominal_dmm, veio, fornecedor_id)
       values ($1, 'mdf', 'MDF Branco TX', 'Fabricante X', 'Branco TX', 180, 'sem_veio', $2) returning id`,
      [empresaA, fornecedorA],
    ),
  ));
  ({ id: chapaA } = await um(
    s.exigir<{ id: string }>(
      paulo,
      `insert into public.chapas (empresa_id, material_id, comprimento_dmm, largura_dmm, preco_centavos)
       values ($1, $2, 27500, 18500, 32990) returning id`,
      [empresaA, materialA],
    ),
  ));
  ({ id: fitaA } = await um(
    s.exigir<{ id: string }>(
      paulo,
      `insert into public.fitas (empresa_id, nome, largura_dmm, espessura_cmm, preco_metro_centavos)
       values ($1, 'Fita Branco TX 22x0,45', 220, 45, 89) returning id`,
      [empresaA],
    ),
  ));
  ({ id: materialB } = await um(
    s.exigir<{ id: string }>(
      bruno,
      `insert into public.materiais (empresa_id, tipo, nome, espessura_nominal_dmm) values ($1, 'mdp', 'MDP Cinza', 150) returning id`,
      [empresaB],
    ),
  ));
});

afterAll(async () => {
  await s?.fechar();
});

describe('Validação de espessura e medidas', () => {
  it('espessura de referência para o motor: a real quando informada, senão a nominal', async () => {
    const antes = await um(
      s.exigir<{ espessura_calculo_dmm: number }>(ana, 'select espessura_calculo_dmm from public.materiais where id = $1', [
        materialA,
      ]),
    );
    expect(antes.espessura_calculo_dmm).toBe(180);

    await s.exigir(ana, 'update public.materiais set espessura_real_dmm = 183 where id = $1', [materialA]);
    const depois = await um(
      s.exigir<{ espessura_calculo_dmm: number }>(ana, 'select espessura_calculo_dmm from public.materiais where id = $1', [
        materialA,
      ]),
    );
    expect(depois.espessura_calculo_dmm).toBe(183);
  });

  it('recusa espessura zero, negativa ou acima de 100 mm', async () => {
    for (const espessura of [0, -60, 1001]) {
      const erro = falhou(
        await s.como(
          ana,
          `insert into public.materiais (empresa_id, tipo, nome, espessura_nominal_dmm) values ($1, 'mdf', 'Teste', $2)`,
          [empresaA, espessura],
        ),
      );
      expect(erro.code, String(espessura)).toBe(VIOLA_CHECK);
    }
  });

  it('recusa espessura real fora de ±20% da nominal (erro de digitação, ex.: 183 mm)', async () => {
    const erro = falhou(
      await s.como(ana, 'update public.materiais set espessura_real_dmm = 1830 where id = $1', [materialA]),
    );
    expect(erro.code).toBe(VIOLA_CHECK);
  });

  it('recusa chapa menor que 100 mm, maior que 6 m ou com preço negativo', async () => {
    const casos: Array<[number, number, number | null]> = [
      [999, 18500, null],
      [27500, 60001, null],
      [27500, 18500, -1],
    ];
    for (const [c, l, p] of casos) {
      const erro = falhou(
        await s.como(
          ana,
          `insert into public.chapas (empresa_id, material_id, comprimento_dmm, largura_dmm, preco_centavos)
           values ($1, $2, $3, $4, $5)`,
          [empresaA, materialA, c, l, p],
        ),
      );
      expect(erro.code, `${c}x${l} ${p}`).toBe(VIOLA_CHECK);
    }
  });

  it('aceita formato de chapa personalizado e recusa o mesmo formato duas vezes', async () => {
    const r = await s.como(
      ana,
      `insert into public.chapas (empresa_id, material_id, comprimento_dmm, largura_dmm) values ($1, $2, 18300, 9150)`,
      [empresaA, materialA],
    );
    expect(r.ok).toBe(true);
    const erro = falhou(
      await s.como(
        ana,
        `insert into public.chapas (empresa_id, material_id, comprimento_dmm, largura_dmm) values ($1, $2, 27500, 18500)`,
        [empresaA, materialA],
      ),
    );
    expect(erro.code).toBe(DUPLICADO);
  });

  it('recusa material com mesmo nome e espessura (sem diferenciar maiúsculas)', async () => {
    const erro = falhou(
      await s.como(
        ana,
        `insert into public.materiais (empresa_id, tipo, nome, espessura_nominal_dmm) values ($1, 'mdf', '  mdf branco tx ', 180)`,
        [empresaA],
      ),
    );
    expect(erro.code).toBe(DUPLICADO);

    const outraEspessura = await s.como(
      ana,
      `insert into public.materiais (empresa_id, tipo, nome, espessura_nominal_dmm) values ($1, 'mdf', 'MDF Branco TX', 150)`,
      [empresaA],
    );
    expect(outraEspessura.ok).toBe(true);
  });

  it('fita: espessura em centésimos de mm e largura entre 5 e 100 mm', async () => {
    for (const [largura, espessura] of [
      [49, 45],
      [220, 9],
      [1001, 45],
    ] as const) {
      const erro = falhou(
        await s.como(
          ana,
          `insert into public.fitas (empresa_id, nome, largura_dmm, espessura_cmm) values ($1, 'Fita teste', $2, $3)`,
          [empresaA, largura, espessura],
        ),
      );
      expect(erro.code, `${largura}/${espessura}`).toBe(VIOLA_CHECK);
    }
  });
});

describe('Isolamento entre empresas', () => {
  it('B não vê fornecedores, materiais, chapas, fitas nem estoque de A', async () => {
    await s.exigir(ana, 'select public.definir_estoque(p_chapa => $1, p_saldo => 5)', [chapaA]);
    for (const tabela of ['fornecedores', 'materiais', 'chapas', 'fitas', 'estoque_movimentos', 'estoque_saldos']) {
      const linhas = await s.exigir<{ empresa_id: string }>(bruno, `select empresa_id from public.${tabela}`);
      expect(
        linhas.every((l) => l.empresa_id === empresaB),
        tabela,
      ).toBe(true);
    }
  });

  it('B não cria chapa na própria empresa apontando para material de A', async () => {
    const erro = falhou(
      await s.como(
        bruno,
        `insert into public.chapas (empresa_id, material_id, comprimento_dmm, largura_dmm) values ($1, $2, 27500, 18500)`,
        [empresaB, materialA],
      ),
    );
    expect(erro.code).toBe(VIOLA_FK);
  });

  it('B não liga o próprio material a um fornecedor de A', async () => {
    const erro = falhou(
      await s.como(bruno, 'update public.materiais set fornecedor_id = $1 where id = $2', [fornecedorA, materialB]),
    );
    expect(erro.code).toBe(VIOLA_FK);
  });

  it('B não altera preço nem exclui chapa de A', async () => {
    const r1 = await s.como(bruno, 'update public.chapas set preco_centavos = 1 where id = $1', [chapaA]);
    expect(r1.ok && r1.rowCount).toBe(0);
    const r2 = await s.como(bruno, 'delete from public.materiais where id = $1', [materialA]);
    expect(r2.ok && r2.rowCount).toBe(0);
    const preco = await um(s.lerDireto<{ preco_centavos: string }>('select preco_centavos from public.chapas where id = $1', [chapaA]));
    expect(Number(preco.preco_centavos)).toBe(32990);
  });

  it('B não ajusta estoque de A', async () => {
    const erro = falhou(await s.como(bruno, 'select public.definir_estoque(p_chapa => $1, p_saldo => 0)', [chapaA]));
    expect(erro.code).toBe(PERMISSAO_NEGADA);
    expect(await saldo(ana, 'chapa_id', chapaA)).toBe(5);
  });

  it('B não importa materiais para dentro da empresa A', async () => {
    const erro = falhou(
      await s.como(bruno, 'select public.importar_materiais($1, $2::jsonb)', [
        empresaA,
        JSON.stringify([{ linha: 2, tipo: 'mdf', nome: 'Invasor', espessura_nominal_dmm: 180 }]),
      ]),
    );
    expect(erro.code).toBe(PERMISSAO_NEGADA);
    expect(erro.message).toContain('Linha 2');
  });

  it('ninguém grava movimento de estoque direto na tabela', async () => {
    const erro = falhou(
      await s.como(
        ana,
        `insert into public.estoque_movimentos (empresa_id, chapa_id, tipo, quantidade) values ($1, $2, 'entrada', 100)`,
        [empresaA, chapaA],
      ),
    );
    expect(erro.code).toBe(PERMISSAO_NEGADA);
  });

  it('visitante anônimo não lê o catálogo', async () => {
    for (const tabela of ['fornecedores', 'materiais', 'chapas', 'fitas', 'estoque_movimentos', 'estoque_saldos']) {
      expect(falhou(await s.como('anon', `select * from public.${tabela}`)).code, tabela).toBe(PERMISSAO_NEGADA);
    }
  });
});

describe('Papéis', () => {
  it('produção e vendas leem o catálogo, mas não cadastram', async () => {
    for (const quem of [rita, vera]) {
      const lidos = await s.exigir(quem, 'select id from public.materiais');
      expect(lidos.length).toBeGreaterThan(0);
      const erro = falhou(
        await s.como(
          quem,
          `insert into public.materiais (empresa_id, tipo, nome, espessura_nominal_dmm) values ($1, 'mdf', 'Novo', 90)`,
          [empresaA],
        ),
      );
      expect(erro.code, quem.email).toBe(PERMISSAO_NEGADA);
    }
  });

  it('projetista cadastra, mas não exclui', async () => {
    const r = await s.como(paulo, 'delete from public.fitas where id = $1', [fitaA]);
    expect(r.ok && r.rowCount).toBe(0);
  });

  it('produção ajusta estoque; vendas não', async () => {
    await s.exigir(rita, 'select public.definir_estoque(p_chapa => $1, p_saldo => 12, p_motivo => $2)', [
      chapaA,
      'Contagem de sexta',
    ]);
    expect(await saldo(rita, 'chapa_id', chapaA)).toBe(12);
    const erro = falhou(await s.como(vera, 'select public.definir_estoque(p_chapa => $1, p_saldo => 0)', [chapaA]));
    expect(erro.code).toBe(PERMISSAO_NEGADA);
  });
});

describe('Estoque por movimentos', () => {
  it('o primeiro registro é saldo inicial; depois, ajustes com a diferença', async () => {
    const movs = await s.exigir<{ tipo: string; quantidade: string; motivo: string | null }>(
      ana,
      'select tipo, quantidade, motivo from public.estoque_movimentos where chapa_id = $1 order by created_at',
      [chapaA],
    );
    // 0 → 5 (inicial, dona) e 5 → 12 (ajuste +7, produção)
    expect(movs.map((m) => [m.tipo, Number(m.quantidade)])).toEqual([
      ['saldo_inicial', 5],
      ['ajuste', 7],
    ]);
    expect(movs[1]?.motivo).toBe('Contagem de sexta');
  });

  it('informar o mesmo saldo não cria movimento', async () => {
    await s.exigir(ana, 'select public.definir_estoque(p_chapa => $1, p_saldo => 12)', [chapaA]);
    const movs = await s.exigir(ana, 'select 1 from public.estoque_movimentos where chapa_id = $1', [chapaA]);
    expect(movs).toHaveLength(2);
  });

  it('recusa saldo negativo e item ambíguo', async () => {
    expect(falhou(await s.como(ana, 'select public.definir_estoque(p_chapa => $1, p_saldo => -1)', [chapaA])).hint).toBe(
      'estoque_negativo',
    );
    expect(
      falhou(await s.como(ana, 'select public.definir_estoque(p_chapa => $1, p_fita => $2, p_saldo => 1)', [chapaA, fitaA])).hint,
    ).toBe('estoque_item');
  });

  it('fita guarda o estoque em décimos de mm (50 m = 500000)', async () => {
    await s.exigir(ana, 'select public.definir_estoque(p_fita => $1, p_saldo => 500000)', [fitaA]);
    expect(await saldo(ana, 'fita_id', fitaA)).toBe(500000);
  });

  it('item com histórico de estoque não pode ser excluído; pode ser desativado', async () => {
    const erro = falhou(await s.como(ana, 'delete from public.materiais where id = $1', [materialA]));
    expect(erro.code).toBe(VIOLA_FK);
    const r = await s.como(ana, 'update public.materiais set ativo = false where id = $1', [materialA]);
    expect(r.ok && r.rowCount).toBe(1);
    await s.exigir(ana, 'update public.materiais set ativo = true where id = $1', [materialA]);
  });

  it('excluir um fornecedor só desliga o vínculo dos materiais', async () => {
    const { id: f } = await um(
      s.exigir<{ id: string }>(ana, `insert into public.fornecedores (empresa_id, nome) values ($1, 'Temporário') returning id`, [
        empresaA,
      ]),
    );
    const { id: m } = await um(
      s.exigir<{ id: string }>(
        ana,
        `insert into public.materiais (empresa_id, tipo, nome, espessura_nominal_dmm, fornecedor_id) values ($1, 'mdf', 'Ligado', 60, $2) returning id`,
        [empresaA, f],
      ),
    );
    await s.exigir(ana, 'delete from public.fornecedores where id = $1', [f]);
    const mat = await um(s.exigir<{ fornecedor_id: string | null }>(ana, 'select fornecedor_id from public.materiais where id = $1', [m]));
    expect(mat.fornecedor_id).toBeNull();
  });
});

describe('Importação de planilha (critério de aceite)', () => {
  const linhas = [
    {
      linha: 2,
      tipo: 'mdf',
      nome: 'MDF Carvalho Hanover',
      fabricante: 'Fabricante Y',
      cor_padrao: 'Carvalho Hanover',
      espessura_nominal_dmm: 180,
      espessura_real_dmm: 182,
      veio: 'comprimento',
      comprimento_dmm: 27500,
      largura_dmm: 18500,
      preco_centavos: 41990,
      fornecedor: 'Distribuidora Nova',
      estoque: 8,
    },
    {
      linha: 3,
      tipo: 'mdf',
      nome: 'MDF Carvalho Hanover',
      espessura_nominal_dmm: 180,
      comprimento_dmm: 18300,
      largura_dmm: 27500,
      preco_centavos: 29990,
    },
    { linha: 4, tipo: 'mdf', nome: 'MDF Carvalho Hanover', espessura_nominal_dmm: 60, veio: 'comprimento' },
    // Já existe: atualiza preço da chapa e não duplica o material.
    { linha: 5, tipo: 'mdf', nome: 'mdf branco tx', espessura_nominal_dmm: 180, comprimento_dmm: 27500, largura_dmm: 18500, preco_centavos: 33990 },
  ];

  it('cria materiais, formatos, fornecedor e estoque numa única chamada', async () => {
    const r = await um(
      s.exigir<{ r: Record<string, number> }>(paulo, 'select public.importar_materiais($1, $2::jsonb) as r', [
        empresaA,
        JSON.stringify(linhas),
      ]),
    );
    expect(r.r).toEqual({
      materiais_criados: 2,
      materiais_atualizados: 1,
      chapas_criadas: 2,
      chapas_atualizadas: 1,
      fornecedores_criados: 1,
      estoques_definidos: 1,
    });

    const hanover = await s.exigir<{ espessura_nominal_dmm: number; espessura_calculo_dmm: number; veio: string; formatos: number }>(
      ana,
      `select m.espessura_nominal_dmm, m.espessura_calculo_dmm, m.veio, count(c.id)::int as formatos
         from public.materiais m left join public.chapas c on c.material_id = m.id
        where m.empresa_id = $1 and m.nome = 'MDF Carvalho Hanover'
        group by m.id order by m.espessura_nominal_dmm`,
      [empresaA],
    );
    expect(hanover).toEqual([
      { espessura_nominal_dmm: 60, espessura_calculo_dmm: 60, veio: 'comprimento', formatos: 0 },
      { espessura_nominal_dmm: 180, espessura_calculo_dmm: 182, veio: 'comprimento', formatos: 2 },
    ]);

    const preco = await um(s.lerDireto<{ preco_centavos: string }>('select preco_centavos from public.chapas where id = $1', [chapaA]));
    expect(Number(preco.preco_centavos)).toBe(33990);
  });

  it('importar de novo a mesma planilha não duplica nada e não apaga campos vazios', async () => {
    const r = await um(
      s.exigir<{ r: Record<string, number> }>(paulo, 'select public.importar_materiais($1, $2::jsonb) as r', [
        empresaA,
        JSON.stringify(linhas),
      ]),
    );
    expect(r.r.materiais_criados).toBe(0);
    expect(r.r.chapas_criadas).toBe(0);
    expect(r.r.fornecedores_criados).toBe(0);

    const m = await um(
      s.exigir<{ fabricante: string; total: number }>(
        ana,
        `select max(fabricante) as fabricante, count(*)::int as total from public.materiais
          where empresa_id = $1 and nome = 'MDF Carvalho Hanover' and espessura_nominal_dmm = 180`,
        [empresaA],
      ),
    );
    expect(m).toEqual({ fabricante: 'Fabricante Y', total: 1 });
  });

  it('uma linha inválida desfaz a importação inteira e aponta o número da linha', async () => {
    const antes = await um(s.lerDireto<{ n: number }>('select count(*)::int as n from public.materiais where empresa_id = $1', [empresaA]));
    const erro = falhou(
      await s.como(paulo, 'select public.importar_materiais($1, $2::jsonb)', [
        empresaA,
        JSON.stringify([
          { linha: 2, tipo: 'mdf', nome: 'Válido 1', espessura_nominal_dmm: 150 },
          { linha: 7, tipo: 'mdf', nome: 'Grossa demais', espessura_nominal_dmm: 2500 },
        ]),
      ]),
    );
    expect(erro.message).toMatch(/^Linha 7:/);
    expect(erro.code).toBe(VIOLA_CHECK);
    const depois = await um(s.lerDireto<{ n: number }>('select count(*)::int as n from public.materiais where empresa_id = $1', [empresaA]));
    expect(depois.n).toBe(antes.n);
  });

  it('preço ou estoque sem tamanho de chapa é recusado', async () => {
    const erro = falhou(
      await s.como(paulo, 'select public.importar_materiais($1, $2::jsonb)', [
        empresaA,
        JSON.stringify([{ linha: 3, tipo: 'mdf', nome: 'Sem formato', espessura_nominal_dmm: 150, preco_centavos: 100 }]),
      ]),
    );
    expect(erro.message).toContain('Linha 3');
  });

  it('produção não importa materiais', async () => {
    const erro = falhou(
      await s.como(rita, 'select public.importar_materiais($1, $2::jsonb)', [
        empresaA,
        JSON.stringify([{ linha: 2, tipo: 'mdf', nome: 'Qualquer', espessura_nominal_dmm: 150 }]),
      ]),
    );
    expect(erro.code).toBe(PERMISSAO_NEGADA);
  });

  it('importa fitas com estoque em metros convertido para décimos de mm', async () => {
    const r = await um(
      s.exigir<{ r: Record<string, number> }>(paulo, 'select public.importar_fitas($1, $2::jsonb) as r', [
        empresaA,
        JSON.stringify([
          {
            linha: 2,
            nome: 'Fita Carvalho Hanover 22x0,45',
            cor_padrao: 'Carvalho Hanover',
            largura_dmm: 220,
            espessura_cmm: 45,
            comprimento_rolo_dmm: 500000,
            preco_metro_centavos: 95,
            fornecedor: 'Distribuidora Nova',
            estoque_dmm: 1500000,
          },
          { linha: 3, nome: 'Fita Branco TX 22x0,45', largura_dmm: 220, espessura_cmm: 45, preco_metro_centavos: 79 },
        ]),
      ]),
    );
    expect(r.r).toEqual({ fitas_criadas: 1, fitas_atualizadas: 1, fornecedores_criados: 0, estoques_definidos: 1 });
    const preco = await um(s.exigir<{ preco_metro_centavos: string }>(ana, 'select preco_metro_centavos from public.fitas where id = $1', [fitaA]));
    expect(Number(preco.preco_metro_centavos)).toBe(79);
  });
});
