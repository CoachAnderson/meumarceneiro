import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessaoTeste } from '../src/sessao';

/**
 * Fase 10 — auditoria do banco. Não testa uma regra de negócio: confere que
 * nenhuma tabela, visão ou função ficou com a porta aberta. Falha quando
 * alguém cria uma tabela nova e esquece RLS ou deixa a permissão padrão.
 */

let s: SessaoTeste;

beforeAll(async () => {
  s = await SessaoTeste.abrir();
});
afterAll(async () => {
  await s?.fechar();
});

const nomes = async (sql: string) => (await s.lerDireto<{ nome: string }>(sql)).map((l) => l.nome).sort();

describe('auditoria de segurança do banco', () => {
  it('toda tabela pública tem RLS ligada', async () => {
    expect(await nomes(`select relname as nome from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)).toEqual([]);
  });

  it('toda tabela pública tem ao menos uma política de leitura', async () => {
    expect(
      await nomes(`select c.relname as nome from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind = 'r'
                      and not exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polcmd in ('r', '*'))`),
    ).toEqual([]);
  });

  it('nenhuma política vale para visitante anônimo', async () => {
    expect(
      await nomes(`select c.relname || '.' || p.polname as nome from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and (p.polroles = '{0}' or exists (select 1 from unnest(p.polroles) r join pg_roles g on g.oid = r where g.rolname = 'anon'))`),
    ).toEqual([]);
  });

  it('visitante anônimo não tem permissão em nenhuma tabela ou visão', async () => {
    expect(
      await nomes(`select distinct table_name::text as nome from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'PUBLIC')
                   union select distinct table_name::text from information_schema.column_privileges where table_schema = 'public' and grantee in ('anon', 'PUBLIC')`),
    ).toEqual([]);
  });

  it('usuário autenticado não tem TRUNCATE, REFERENCES nem TRIGGER em nada', async () => {
    expect(
      await nomes(`select distinct table_name || ':' || privilege_type as nome from information_schema.role_table_grants
                    where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')`),
    ).toEqual([]);
  });

  it('colunas controladas pelo banco não são graváveis pela API', async () => {
    const pode = async (tabela: string, coluna: string, acao: string) =>
      (await s.lerDireto<{ p: boolean }>(`select has_column_privilege('authenticated', $1, $2, $3) as p`, [`public.${tabela}`, coluna, acao]))[0]!.p;
    for (const [tabela, coluna] of [
      ['projetos', 'versao_atual'],
      ['projeto_versoes', 'dados'],
      ['orcamentos', 'total_centavos'],
      ['orcamentos', 'dados'],
      ['ordens_producao', 'dados'],
      ['ordens_producao', 'baixa_em'],
      ['empresas', 'proximo_orcamento'],
      ['empresas', 'proxima_ordem'],
      ['empresas', 'visao_limite_mensal'],
      ['empresas', 'teste_ate'],
      ['assinaturas', 'status'],
      ['assinaturas', 'paga_ate'],
      ['visao_analises', 'status'],
      ['empresas', 'marceneiro_limite_mensal'],
      ['apresentacoes', 'perguntas'],
      ['apresentacoes', 'expira_em'],
      ['apresentacoes', 'limite_perguntas'],
      ['marceneiro_perguntas', 'status'],
      ['estoque_movimentos', 'quantidade'],
    ] as const) {
      expect(await pode(tabela, coluna, 'UPDATE'), `${tabela}.${coluna}`).toBe(false);
    }
    // Movimentos de estoque só entram pelas funções.
    expect((await s.lerDireto<{ p: boolean }>(`select has_table_privilege('authenticated', 'public.estoque_movimentos', 'INSERT') as p`))[0]!.p).toBe(false);
  });

  it('visitante anônimo só executa a consulta de convite', async () => {
    expect(await nomes(`select p.proname as nome from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`)).toEqual(['ver_convite']);
  });

  it('usuário autenticado só executa as funções previstas', async () => {
    expect(await nomes(`select p.proname as nome from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')`)).toEqual([
      'aceitar_convite',
      'admin_empresas',
      'admin_estender_teste',
      'admin_resumo',
      'baixar_estoque_ordem',
      'baixar_lancamento',
      'cancelar_lancamento',
      'concluir_analise_visao',
      'concluir_pergunta_marceneiro',
      'cota_marceneiro',
      'cota_visao',
      'criar_empresa',
      'criar_projeto',
      'definir_estoque',
      'definir_estoque_ferragem',
      'estornar_baixa_ordem',
      'estornar_lancamento',
      'importar_fitas',
      'importar_materiais',
      'iniciar_analise_visao',
      'iniciar_assinatura',
      'iniciar_pergunta_editor',
      'marcar_etapa_pecas',
      'minhas_empresas',
      'pode_cobrar',
      'situacao_assinatura',
      'tem_papel',
      'ver_convite',
    ]);
  });

  it('toda função com privilégio de dono fixa o search_path', async () => {
    expect(
      await nomes(`select p.proname as nome from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`),
    ).toEqual([]);
  });

  it('toda visão respeita a RLS de quem consulta', async () => {
    expect(
      await nomes(`select c.relname as nome from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind = 'v'
                      and not coalesce((select option_value::boolean from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), false)`),
    ).toEqual([]);
  });

  it('a API não grava em assinaturas, cobranças nem na lista de administradores', async () => {
    for (const tabela of ['assinaturas', 'assinatura_cobrancas', 'administradores_plataforma']) {
      for (const acao of ['INSERT', 'UPDATE', 'DELETE']) {
        expect((await s.lerDireto<{ p: boolean }>(`select has_table_privilege('authenticated', $1, $2) as p`, [`public.${tabela}`, acao]))[0]!.p, `${tabela} ${acao}`).toBe(false);
      }
    }
  });

  it('toda tabela de negócio tem a trava de assinatura', async () => {
    expect(
      await nomes(`select c.relname as nome from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('assinaturas', 'assinatura_cobrancas', 'membros_empresa', 'convites')
                      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped)
                      and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'exigir_assinatura')`),
    ).toEqual([]);
  });

  it('toda tabela de negócio tem empresa_id', async () => {
    expect(
      await nomes(`select c.relname as nome from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('empresas', 'usuarios', 'administradores_plataforma')
                      and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped)`),
    ).toEqual([]);
  });
});
