-- =============================================================================
-- Mesas e bancadas: pés comprados, sapatas, suportes de parede e fixação do
-- tampo sobre gabinetes entram na lista de ferragens.
-- =============================================================================

alter type public.tipo_ferragem add value if not exists 'pe_mesa';
alter type public.tipo_ferragem add value if not exists 'parafuso_pe';
alter type public.tipo_ferragem add value if not exists 'sapata_niveladora';
alter type public.tipo_ferragem add value if not exists 'mao_francesa';
alter type public.tipo_ferragem add value if not exists 'suporte_invisivel';
alter type public.tipo_ferragem add value if not exists 'cantoneira';
alter type public.tipo_ferragem add value if not exists 'parafuso_suporte';
alter type public.tipo_ferragem add value if not exists 'parafuso_tampo';
