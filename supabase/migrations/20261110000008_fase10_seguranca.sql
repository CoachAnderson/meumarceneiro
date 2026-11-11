-- =============================================================================
-- Fase 10 — Endurecimento de permissões.
--
-- No Supabase, toda tabela nova em "public" nasce com permissão total para
-- anon e authenticated (privilégios padrão do projeto). A RLS já barrava o
-- acesso às linhas, mas a defesa tem duas camadas: aqui as tabelas das fases
-- 5 a 9 passam a ter só as permissões que o aplicativo usa, como as das
-- fases 1 e 2. O teste packages/db-tests/test/seguranca.test.ts falha se uma
-- tabela nova ficar com permissão sobrando.
-- =============================================================================

revoke all on table
  public.projetos, public.projeto_versoes, public.retalhos,
  public.ferragens, public.orcamentos, public.ordens_producao
  from anon, authenticated;

-- Projetos: versao_atual é do banco.
grant select, delete on public.projetos to authenticated;
grant insert (empresa_id, nome, cliente_id) on public.projetos to authenticated;
grant update (nome, cliente_id, arquivado) on public.projetos to authenticated;

-- Versões: só leitura e criação.
grant select on public.projeto_versoes to authenticated;
grant insert (empresa_id, projeto_id, numero, dados, regras, valido, observacao) on public.projeto_versoes to authenticated;

grant select, delete on public.retalhos to authenticated;
grant insert (empresa_id, material_id, comprimento_dmm, largura_dmm, quantidade, local, observacoes) on public.retalhos to authenticated;
grant update (comprimento_dmm, largura_dmm, quantidade, local, observacoes) on public.retalhos to authenticated;

grant select, delete on public.ferragens to authenticated;
grant insert (empresa_id, tipo, nome, fabricante, comprimento_dmm, preco_centavos, fornecedor_id, observacoes, ativo) on public.ferragens to authenticated;
grant update (tipo, nome, fabricante, comprimento_dmm, preco_centavos, fornecedor_id, observacoes, ativo) on public.ferragens to authenticated;

-- Orçamentos: depois de emitido, só situação e observação.
grant select, delete on public.orcamentos to authenticated;
grant insert (empresa_id, numero, projeto_id, projeto_versao, cliente_id, projeto_nome, cliente_nome, dados, custo_centavos, total_centavos, validade, status)
  on public.orcamentos to authenticated;
grant update (status, observacao) on public.orcamentos to authenticated;

-- Ordens: depois de criada, só etapa, prazo e observação.
grant select, delete on public.ordens_producao to authenticated;
grant insert (empresa_id, numero, projeto_id, projeto_versao, projeto_nome, cliente_nome, dados, status, prazo, observacao, baixa_em)
  on public.ordens_producao to authenticated;
grant update (status, prazo, observacao) on public.ordens_producao to authenticated;
