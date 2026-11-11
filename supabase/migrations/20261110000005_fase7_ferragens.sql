-- =============================================================================
-- Fase 7 — Catálogo de ferragens (dobradiças, corrediças, puxadores, suportes).
--
-- `tipo` usa os mesmos códigos que o motor gera na lista de ferragens, para
-- ligar a necessidade do projeto ao item do catálogo. Corrediça tem
-- comprimento (a medida decide qual item serve). Preço em centavos.
-- O estoque de ferragens entra na produção (Fase 9).
-- =============================================================================

create type public.tipo_ferragem as enum (
  'dobradica_reta',
  'dobradica_curva',
  'dobradica_supercurva',
  'corredica',
  'puxador',
  'suporte_prateleira',
  'outro'
);

create table public.ferragens (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  tipo            public.tipo_ferragem not null,
  nome            text not null check (char_length(btrim(nome)) between 2 and 160),
  fabricante      text check (fabricante is null or char_length(fabricante) <= 80),
  -- Só corrediça tem comprimento, e ela precisa dele.
  comprimento_dmm integer check (comprimento_dmm is null or comprimento_dmm between 1000 and 15000),
  -- Preço por unidade (corrediça: por par).
  preco_centavos  bigint check (preco_centavos is null or preco_centavos between 0 and 100000000),
  fornecedor_id   uuid,
  observacoes     text check (observacoes is null or char_length(observacoes) <= 2000),
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (empresa_id, id),
  constraint ferragens_comprimento_corredica check ((tipo = 'corredica') = (comprimento_dmm is not null)),
  foreign key (empresa_id, fornecedor_id) references public.fornecedores (empresa_id, id) on delete set null (fornecedor_id)
);

create unique index ferragens_nome_unico on public.ferragens (empresa_id, tipo, lower(btrim(nome)), coalesce(comprimento_dmm, 0));

create trigger ferragens_updated_at
  before update on public.ferragens
  for each row execute function public.definir_updated_at();

alter table public.ferragens enable row level security;

-- Mesmo regime do catálogo de materiais: todos leem; dono e projetista
-- cadastram e editam; só o dono exclui.
create policy ferragens_select on public.ferragens
  for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));

create policy ferragens_insert on public.ferragens
  for insert to authenticated
  with check (public.tem_papel(empresa_id, array['dono', 'projetista']::public.papel_membro[]));

create policy ferragens_update on public.ferragens
  for update to authenticated
  using (public.tem_papel(empresa_id, array['dono', 'projetista']::public.papel_membro[]))
  with check (public.tem_papel(empresa_id, array['dono', 'projetista']::public.papel_membro[]));

create policy ferragens_delete on public.ferragens
  for delete to authenticated
  using (public.tem_papel(empresa_id, array['dono']::public.papel_membro[]));

grant select, insert, update, delete on public.ferragens to authenticated;
