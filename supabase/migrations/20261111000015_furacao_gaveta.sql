-- =============================================================================
-- Furação da gaveta: parafusos que o motor passa a contar separadamente
-- (cada um costuma ser um produto diferente no estoque).
-- =============================================================================

alter type public.tipo_ferragem add value if not exists 'parafuso_gaveta';
alter type public.tipo_ferragem add value if not exists 'parafuso_corredica';
alter type public.tipo_ferragem add value if not exists 'parafuso_frente';
