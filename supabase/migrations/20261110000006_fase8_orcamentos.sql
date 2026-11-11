-- =============================================================================
-- Fase 8 — Orçamentos emitidos.
--
-- Um orçamento é uma fotografia: guarda as linhas, os totais e a versão do
-- projeto de onde saiu. Depois de emitido, o conteúdo não muda (se o projeto
-- mudar, emite-se outro). Só o status e a observação interna podem mudar.
-- Numeração sequencial por empresa, dada pelo banco.
--
-- Preço e custo são dados comerciais: produção não vê orçamentos.
-- =============================================================================

create type public.status_orcamento as enum ('emitido', 'aprovado', 'recusado', 'cancelado');

alter table public.empresas add column proximo_orcamento integer not null default 1 check (proximo_orcamento >= 1);

create table public.orcamentos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  numero          integer not null check (numero >= 1),
  projeto_id      uuid,
  projeto_versao  integer not null check (projeto_versao >= 1),
  cliente_id      uuid,
  -- Nomes copiados na emissão: o documento continua legível se o projeto ou o cliente forem apagados.
  projeto_nome    text not null check (char_length(projeto_nome) between 1 and 160),
  cliente_nome    text check (cliente_nome is null or char_length(cliente_nome) <= 160),
  -- Linhas de custo, resumo do móvel, condições. Objeto JSON de até 256 KB.
  dados           jsonb not null check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 262144),
  custo_centavos  bigint not null check (custo_centavos between 0 and 10000000000),
  total_centavos  bigint not null check (total_centavos between 0 and 100000000000),
  validade        date not null,
  status          public.status_orcamento not null default 'emitido',
  observacao      text check (observacao is null or char_length(observacao) <= 1000),
  criado_por      uuid references public.usuarios (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (empresa_id, id),
  unique (empresa_id, numero),
  foreign key (empresa_id, projeto_id) references public.projetos (empresa_id, id) on delete set null (projeto_id),
  foreign key (empresa_id, cliente_id) references public.clientes (empresa_id, id) on delete set null (cliente_id)
);

create index orcamentos_empresa_idx on public.orcamentos (empresa_id, created_at desc);
create index orcamentos_projeto_idx on public.orcamentos (projeto_id);

-- Número, autor e data são do banco. SECURITY DEFINER para avançar o contador
-- da empresa (que só o dono altera); a política de INSERT é conferida depois.
create or replace function public.numerar_orcamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.empresas
     set proximo_orcamento = proximo_orcamento + 1
   where id = new.empresa_id
   returning proximo_orcamento - 1 into new.numero;
  if not found then
    raise exception 'Empresa não encontrada.' using errcode = '23503';
  end if;
  new.criado_por := auth.uid();
  new.created_at := now();
  new.status := 'emitido';
  return new;
end;
$$;

create trigger orcamentos_numerar
  before insert on public.orcamentos
  for each row execute function public.numerar_orcamento();

-- Conteúdo imutável: só status e observação mudam.
create or replace function public.proteger_orcamento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.empresa_id is distinct from old.empresa_id
     or new.numero is distinct from old.numero
     or new.projeto_versao is distinct from old.projeto_versao
     or new.projeto_nome is distinct from old.projeto_nome
     or new.cliente_nome is distinct from old.cliente_nome
     or new.dados is distinct from old.dados
     or new.custo_centavos is distinct from old.custo_centavos
     or new.total_centavos is distinct from old.total_centavos
     or new.validade is distinct from old.validade
     or new.criado_por is distinct from old.criado_por
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Orçamento emitido não pode ser alterado; emita outro.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger orcamentos_proteger
  before update on public.orcamentos
  for each row execute function public.proteger_orcamento();

create trigger orcamentos_updated_at
  before update on public.orcamentos
  for each row execute function public.definir_updated_at();

-- O contador não é editável pela API.
create or replace function public.proteger_contador_orcamento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() <= 1 then
    new.proximo_orcamento := old.proximo_orcamento;
  end if;
  return new;
end;
$$;

create trigger empresas_contador_orcamento
  before update on public.empresas
  for each row execute function public.proteger_contador_orcamento();

alter table public.orcamentos enable row level security;

create policy orcamentos_select on public.orcamentos
  for select to authenticated
  using (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]));

create policy orcamentos_insert on public.orcamentos
  for insert to authenticated
  with check (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]));

create policy orcamentos_update on public.orcamentos
  for update to authenticated
  using (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]))
  with check (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]));

create policy orcamentos_delete on public.orcamentos
  for delete to authenticated
  using (public.tem_papel(empresa_id, array['dono']::public.papel_membro[]));

grant select, insert, update, delete on public.orcamentos to authenticated;
revoke execute on function public.numerar_orcamento(), public.proteger_orcamento(), public.proteger_contador_orcamento() from public, anon, authenticated;
