-- =============================================================================
-- Medição guiada no local: o que a equipe mede na casa do cliente (paredes,
-- esquadro dos cantos, tomadas, janelas, canos) e as fotos.
--
-- As medidas ficam em dados (jsonb). As fotos ficam num balde PRIVADO do
-- Storage ("medicoes"): são fotos da casa do cliente, só a equipe da
-- marcenaria vê, por link assinado de curta duração.
--
-- Quem mede pode ser qualquer pessoa da equipe (inclusive o montador). Quem
-- apaga: o dono ou quem criou. A medição pode ser criada no celular sem
-- sinal: o aparelho escolhe o id e envia quando voltar.
-- =============================================================================

create type public.status_medicao as enum ('em_andamento', 'concluida');

create table public.medicoes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  cliente_id  uuid,
  titulo      text not null check (char_length(btrim(titulo)) between 1 and 160),
  endereco    text check (endereco is null or char_length(endereco) <= 300),
  status      public.status_medicao not null default 'em_andamento',
  -- Medidas (DadosMedicao do núcleo). Até 512 kB.
  dados       jsonb not null check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 524288),
  -- Sobe a cada gravação: o aparelho só grava por cima da versão que ele viu.
  versao      integer not null default 1,
  criado_por  uuid references public.usuarios (id) on delete set null default auth.uid(),
  alterado_por uuid references public.usuarios (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, cliente_id) references public.clientes (empresa_id, id) on delete set null (cliente_id)
);

create index medicoes_empresa_idx on public.medicoes (empresa_id, updated_at desc);

create or replace function public.proteger_medicao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid();
    new.alterado_por := auth.uid();
    new.versao := 1;
    new.created_at := now();
    return new;
  end if;
  if new.empresa_id is distinct from old.empresa_id
     or new.criado_por is distinct from old.criado_por
     or new.created_at is distinct from old.created_at
  then
    raise exception 'A medição não muda de empresa nem de autor.' using errcode = '42501';
  end if;
  new.versao := old.versao + 1;
  new.alterado_por := auth.uid();
  return new;
end;
$$;

revoke execute on function public.proteger_medicao() from public, anon, authenticated;

create trigger medicoes_proteger
  before insert or update on public.medicoes
  for each row execute function public.proteger_medicao();

create trigger medicoes_updated_at
  before update on public.medicoes
  for each row execute function public.definir_updated_at();

create trigger exigir_assinatura before insert or update on public.medicoes
  for each row execute function public.exigir_assinatura();

alter table public.medicoes enable row level security;

create policy medicoes_select on public.medicoes
  for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));

create policy medicoes_insert on public.medicoes
  for insert to authenticated
  with check (empresa_id in (select public.minhas_empresas()));

create policy medicoes_update on public.medicoes
  for update to authenticated
  using (empresa_id in (select public.minhas_empresas()))
  with check (empresa_id in (select public.minhas_empresas()));

create policy medicoes_delete on public.medicoes
  for delete to authenticated
  using (public.tem_papel(empresa_id, array['dono']::public.papel_membro[]) or (criado_por = auth.uid() and empresa_id in (select public.minhas_empresas())));

revoke all on public.medicoes from anon, authenticated;
grant select, insert, delete on public.medicoes to authenticated;
grant update (cliente_id, titulo, endereco, status, dados) on public.medicoes to authenticated;

-- -----------------------------------------------------------------------------
-- Balde PRIVADO "medicoes": empresa/medição/foto.jpg. Sem leitura pública:
-- a tela pede link assinado, que só sai para quem é da equipe.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Supabase Storage não encontrado: balde "medicoes" não criado (ambiente de teste).';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('medicoes', 'medicoes', false, 5242880, array['image/jpeg'])
  on conflict (id) do update
    set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy medicoes_fotos_select on storage.objects
      for select to authenticated
      using (
        bucket_id = 'medicoes'
        and (storage.foldername(name))[1] in (select e::text from public.minhas_empresas() e)
      )
  $p$;

  execute $p$
    create policy medicoes_fotos_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'medicoes'
        and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
        and (storage.foldername(name))[1] in (select e::text from public.minhas_empresas() e)
      )
  $p$;

  execute $p$
    create policy medicoes_fotos_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'medicoes'
        and (storage.foldername(name))[1] in (select e::text from public.minhas_empresas() e)
      )
  $p$;
end $$;
