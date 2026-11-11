-- =============================================================================
-- Fase 6 — Retalhos (sobras de chapa guardadas para reaproveitar).
--
-- Cada linha é um tamanho de retalho de um material, com quantas peças
-- iguais existem. O plano de corte usa os retalhos antes de abrir chapa
-- nova. Dar baixa do retalho usado acontece na produção (Fase 9).
-- =============================================================================

create table public.retalhos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  material_id     uuid not null,
  comprimento_dmm integer not null check (comprimento_dmm between 500 and 60000), -- 50 mm a 6 m
  largura_dmm     integer not null check (largura_dmm between 500 and 60000),
  quantidade      integer not null default 1 check (quantidade between 0 and 10000),
  local           text check (local is null or char_length(local) <= 120),
  observacoes     text check (observacoes is null or char_length(observacoes) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, material_id) references public.materiais (empresa_id, id) on delete cascade
);

create index retalhos_material_idx on public.retalhos (empresa_id, material_id);

create trigger retalhos_updated_at
  before update on public.retalhos
  for each row execute function public.definir_updated_at();

alter table public.retalhos enable row level security;

create policy retalhos_select on public.retalhos
  for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));

-- Quem mexe na oficina: dono, projetista e produção. Vendas só consulta.
create policy retalhos_insert on public.retalhos
  for insert to authenticated
  with check (public.tem_papel(empresa_id, array['dono', 'projetista', 'producao']::public.papel_membro[]));

create policy retalhos_update on public.retalhos
  for update to authenticated
  using (public.tem_papel(empresa_id, array['dono', 'projetista', 'producao']::public.papel_membro[]))
  with check (public.tem_papel(empresa_id, array['dono', 'projetista', 'producao']::public.papel_membro[]));

create policy retalhos_delete on public.retalhos
  for delete to authenticated
  using (public.tem_papel(empresa_id, array['dono', 'projetista', 'producao']::public.papel_membro[]));

grant select, insert, update, delete on public.retalhos to authenticated;
