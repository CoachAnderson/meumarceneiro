-- =============================================================================
-- Furação de montagem: novas ferragens que o motor passa a contar.
--
-- O padrão de furação da marcenaria (tipo de junção e medidas do gabarito)
-- fica em empresas.configuracoes.furacao, que o dono já pode gravar.
-- =============================================================================

alter type public.tipo_ferragem add value if not exists 'minifix';
alter type public.tipo_ferragem add value if not exists 'cavilha';
alter type public.tipo_ferragem add value if not exists 'parafuso_montagem';
