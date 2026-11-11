-- =============================================================================
-- Fase 5 — Projetos e histórico de versões.
--
-- Um projeto guarda a configuração do móvel (entradas do motor: montagem,
-- fundo, medidas, materiais, interior, parâmetros e bordas trocadas). Cada
-- "Salvar" cria uma versão nova e imutável; nada é sobrescrito. O cálculo
-- nunca é guardado: é refeito pelo motor a partir das entradas, então uma
-- versão antiga reabre exatamente como foi salva (as regras têm versão).
-- =============================================================================

-- Clientes passam a ter a chave composta usada pelas FKs entre empresas.
alter table public.clientes add constraint clientes_empresa_id_unique unique (empresa_id, id);

create table public.projetos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  cliente_id  uuid,
  nome        text not null check (char_length(btrim(nome)) between 2 and 160),
  -- Atualizado a cada versão salva.
  versao_atual integer not null default 0 check (versao_atual >= 0),
  arquivado   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (empresa_id, id),
  -- Cliente sempre da mesma empresa. Com cliente nulo a FK não se aplica.
  foreign key (empresa_id, cliente_id) references public.clientes (empresa_id, id) on delete set null (cliente_id)
);

create index projetos_empresa_idx on public.projetos (empresa_id, updated_at desc);
create index projetos_cliente_idx on public.projetos (empresa_id, cliente_id);

-- versao_atual só muda pelo trigger de versões (que roda aninhado).
create or replace function public.proteger_versao_atual()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.versao_atual := 0;
  elsif pg_trigger_depth() <= 1 then
    new.versao_atual := old.versao_atual;
  end if;
  return new;
end;
$$;

create trigger projetos_versao_atual
  before insert or update on public.projetos
  for each row execute function public.proteger_versao_atual();

create trigger projetos_updated_at
  before update on public.projetos
  for each row execute function public.definir_updated_at();

create table public.projeto_versoes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null,
  projeto_id  uuid not null,
  numero      integer not null check (numero >= 1),
  -- Entradas do motor. Objeto JSON de até 256 KB.
  dados       jsonb not null check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 262144),
  -- Regras usadas, por exemplo "tampo_base_entre_laterais@1+fundo_canal@1".
  regras      text not null check (char_length(regras) between 3 and 300),
  -- O motor considerou o módulo válido ao salvar (informativo; a liberação
  -- para fabricação recalcula no servidor, em fase posterior).
  valido      boolean not null,
  observacao  text check (observacao is null or char_length(observacao) <= 500),
  criado_por  uuid references public.usuarios (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  foreign key (empresa_id, projeto_id) references public.projetos (empresa_id, id) on delete cascade,
  unique (projeto_id, numero)
);

create index projeto_versoes_projeto_idx on public.projeto_versoes (projeto_id, numero desc);

-- Número sequencial por projeto. Trava a linha do projeto para que duas
-- gravações simultâneas não peguem o mesmo número.
-- SECURITY DEFINER para poder atualizar versao_atual (que o usuário não
-- altera). Seguro: a política de INSERT da versão é conferida depois deste
-- trigger; se o usuário não puder gravar, tudo é desfeito.
create or replace function public.numerar_versao_projeto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_atual integer;
begin
  select versao_atual into v_atual
    from public.projetos
   where id = new.projeto_id and empresa_id = new.empresa_id
   for update;
  if not found then
    raise exception 'Projeto não encontrado.' using errcode = '23503';
  end if;
  new.numero := v_atual + 1;
  new.criado_por := auth.uid();
  new.created_at := now();
  update public.projetos set versao_atual = new.numero where id = new.projeto_id;
  return new;
end;
$$;

create trigger projeto_versoes_numerar
  before insert on public.projeto_versoes
  for each row execute function public.numerar_versao_projeto();

-- Versões são imutáveis, inclusive para quem ignora a RLS por engano.
create or replace function public.bloquear_alteracao_versao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Versões de projeto não podem ser alteradas nem apagadas; salve uma nova versão.'
    using errcode = '42501';
end;
$$;

create trigger projeto_versoes_imutavel
  before update on public.projeto_versoes
  for each row execute function public.bloquear_alteracao_versao();

-- Apagar só acontece em cascata, junto com o projeto.
create trigger projeto_versoes_sem_delete
  before delete on public.projeto_versoes
  for each row
  when (pg_trigger_depth() = 0)
  execute function public.bloquear_alteracao_versao();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.projetos enable row level security;
alter table public.projeto_versoes enable row level security;

create policy projetos_select on public.projetos
  for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));

create policy projetos_insert on public.projetos
  for insert to authenticated
  with check (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]));

create policy projetos_update on public.projetos
  for update to authenticated
  using (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]))
  with check (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]));

create policy projetos_delete on public.projetos
  for delete to authenticated
  using (public.tem_papel(empresa_id, array['dono']::public.papel_membro[]));

create policy projeto_versoes_select on public.projeto_versoes
  for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));

create policy projeto_versoes_insert on public.projeto_versoes
  for insert to authenticated
  with check (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]));

-- Sem políticas de update/delete: ninguém altera versão pela API.

grant select, insert, update, delete on public.projetos to authenticated;
grant select, insert on public.projeto_versoes to authenticated;

-- -----------------------------------------------------------------------------
-- Criar projeto já com a primeira versão, numa transação só.
-- -----------------------------------------------------------------------------
create or replace function public.criar_projeto(
  p_empresa uuid,
  p_nome text,
  p_cliente uuid,
  p_dados jsonb,
  p_regras text,
  p_valido boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.projetos (empresa_id, nome, cliente_id)
  values (p_empresa, p_nome, p_cliente)
  returning id into v_id;

  insert into public.projeto_versoes (empresa_id, projeto_id, numero, dados, regras, valido, observacao)
  values (p_empresa, v_id, 1, p_dados, p_regras, p_valido, 'Versão inicial');

  return v_id;
end;
$$;

revoke execute on function public.criar_projeto(uuid, text, uuid, jsonb, text, boolean) from public, anon;
grant execute on function public.criar_projeto(uuid, text, uuid, jsonb, text, boolean) to authenticated;
revoke execute on function public.numerar_versao_projeto(), public.bloquear_alteracao_versao(), public.proteger_versao_atual() from public, anon, authenticated;
