-- =============================================================================
-- Mesa com pés de MDF: o parafuso que prende a borda engrossada por baixo.
-- (A mesa em si é só um tipo de projeto: os dados ficam em projeto_versoes.dados.)
-- =============================================================================

alter type public.tipo_ferragem add value if not exists 'parafuso_engrosso';
