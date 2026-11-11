-- =============================================================================
-- Fase 1 — Empresas, usuários, membros, convites e clientes, com isolamento
-- entre empresas por RLS.
--
-- Regras gerais:
--   * Toda tabela de negócio tem empresa_id e só é visível para membros dessa
--     empresa (função minhas_empresas()).
--   * Nenhuma tabela é acessível ao papel anon.
--   * O papel authenticated recebe só os privilégios listados aqui; colunas
--     sensíveis (empresa_id, ids, datas de controle) não são atualizáveis.
--   * Operações que precisam furar a RLS de forma controlada (criar empresa,
--     aceitar convite) são funções SECURITY DEFINER com validação própria.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.papel_membro as enum ('dono', 'projetista', 'vendas', 'producao');

-- -----------------------------------------------------------------------------
-- Utilitário: updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.definir_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Empresas
-- -----------------------------------------------------------------------------
create table public.empresas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (char_length(btrim(nome)) between 2 and 120),
  -- CNPJ numérico ou alfanumérico (formato vigente a partir de julho/2026):
  -- 12 caracteres [0-9A-Z] + 2 dígitos verificadores.
  cnpj          text check (cnpj is null or cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  configuracoes jsonb not null default '{}'::jsonb check (jsonb_typeof(configuracoes) = 'object'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger empresas_updated_at
  before update on public.empresas
  for each row execute function public.definir_updated_at();

-- -----------------------------------------------------------------------------
-- Usuários (perfil público ligado ao auth.users do Supabase)
-- -----------------------------------------------------------------------------
create table public.usuarios (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text not null default '' check (char_length(nome) <= 120),
  email      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger usuarios_updated_at
  before update on public.usuarios
  for each row execute function public.definir_updated_at();

-- Cria o perfil quando o Supabase Auth cria o usuário.
create or replace function public.criar_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, email, nome)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    left(btrim(coalesce(new.raw_user_meta_data ->> 'nome', '')), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger ao_criar_usuario_auth
  after insert on auth.users
  for each row execute function public.criar_perfil_usuario();

-- Mantém o e-mail do perfil igual ao do Auth.
create or replace function public.sincronizar_email_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.usuarios
     set email = lower(coalesce(new.email, ''))
   where id = new.id;
  return new;
end;
$$;

create trigger ao_alterar_email_auth
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sincronizar_email_usuario();

-- -----------------------------------------------------------------------------
-- Membros de empresa
-- -----------------------------------------------------------------------------
create table public.membros_empresa (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  papel      public.papel_membro not null,
  created_at timestamptz not null default now(),
  primary key (empresa_id, usuario_id)
);

create index membros_empresa_usuario_idx on public.membros_empresa (usuario_id);

-- Uma empresa nunca fica sem dono.
create or replace function public.garantir_dono_na_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Exclusão da própria empresa (cascata): nada a garantir.
  if not exists (select 1 from public.empresas where id = old.empresa_id) then
    return coalesce(new, old);
  end if;

  if old.papel = 'dono'
     and (tg_op = 'DELETE' or new.papel <> 'dono')
     and not exists (
       select 1
         from public.membros_empresa
        where empresa_id = old.empresa_id
          and papel = 'dono'
          and usuario_id <> old.usuario_id
     )
  then
    raise exception 'A empresa precisa de pelo menos um dono.'
      using errcode = 'P0001', hint = 'ultimo_dono';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger membros_garantir_dono
  before update or delete on public.membros_empresa
  for each row execute function public.garantir_dono_na_empresa();

-- -----------------------------------------------------------------------------
-- Funções de acesso usadas pelas políticas.
-- SECURITY DEFINER para ler membros_empresa sem recursão de RLS.
-- -----------------------------------------------------------------------------
create or replace function public.minhas_empresas()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select empresa_id
    from public.membros_empresa
   where usuario_id = auth.uid();
$$;

create or replace function public.tem_papel(p_empresa uuid, p_papeis public.papel_membro[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.membros_empresa
     where empresa_id = p_empresa
       and usuario_id = auth.uid()
       and papel = any (p_papeis)
  );
$$;

-- -----------------------------------------------------------------------------
-- Convites
-- -----------------------------------------------------------------------------
create table public.convites (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  email       text not null check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  papel       public.papel_membro not null,
  token       text not null unique
                default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  criado_por  uuid not null references public.usuarios (id) on delete cascade default auth.uid(),
  expira_em   timestamptz not null default now() + interval '7 days',
  aceito_em   timestamptz,
  aceito_por  uuid references public.usuarios (id) on delete set null,
  revogado_em timestamptz,
  created_at  timestamptz not null default now()
);

create index convites_empresa_idx on public.convites (empresa_id);

-- No máximo um convite pendente por e-mail em cada empresa.
create unique index convites_pendente_unico
  on public.convites (empresa_id, email)
  where aceito_em is null and revogado_em is null;

-- -----------------------------------------------------------------------------
-- Clientes (primeira tabela de negócio; base para a gestão nas fases seguintes)
-- -----------------------------------------------------------------------------
create table public.clientes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  nome        text not null check (char_length(btrim(nome)) between 2 and 160),
  -- CPF (11 dígitos) ou CNPJ (numérico ou alfanumérico), sem pontuação.
  documento   text check (documento is null or documento ~ '^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$'),
  email       text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  telefone    text check (telefone is null or char_length(telefone) <= 30),
  endereco    text check (endereco is null or char_length(endereco) <= 300),
  observacoes text check (observacoes is null or char_length(observacoes) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index clientes_empresa_idx on public.clientes (empresa_id);
create index clientes_empresa_nome_idx on public.clientes (empresa_id, lower(nome));

create trigger clientes_updated_at
  before update on public.clientes
  for each row execute function public.definir_updated_at();

-- =============================================================================
-- Privilégios: começa do zero e concede só o necessário.
-- (O Supabase concede ALL por padrão a anon e authenticated em tabelas novas.)
-- =============================================================================
revoke all on table
  public.empresas, public.usuarios, public.membros_empresa, public.convites, public.clientes
  from anon, authenticated;

grant select on public.empresas to authenticated;
grant update (nome, cnpj, configuracoes) on public.empresas to authenticated;

grant select on public.usuarios to authenticated;
grant update (nome) on public.usuarios to authenticated;

grant select, delete on public.membros_empresa to authenticated;
grant update (papel) on public.membros_empresa to authenticated;

grant select on public.convites to authenticated;
grant insert (empresa_id, email, papel) on public.convites to authenticated;
grant update (revogado_em) on public.convites to authenticated;

grant select, delete on public.clientes to authenticated;
grant insert (empresa_id, nome, documento, email, telefone, endereco, observacoes) on public.clientes to authenticated;
grant update (nome, documento, email, telefone, endereco, observacoes) on public.clientes to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.empresas        enable row level security;
alter table public.usuarios        enable row level security;
alter table public.membros_empresa enable row level security;
alter table public.convites        enable row level security;
alter table public.clientes        enable row level security;

-- Empresas: membros leem; só dono altera. Criação só via criar_empresa().
create policy empresas_select on public.empresas
  for select to authenticated
  using (id in (select public.minhas_empresas()));

create policy empresas_update on public.empresas
  for update to authenticated
  using (public.tem_papel(id, array['dono']::public.papel_membro[]))
  with check (public.tem_papel(id, array['dono']::public.papel_membro[]));

-- Usuários: cada um vê o próprio perfil e o de quem está em alguma empresa sua.
create policy usuarios_select on public.usuarios
  for select to authenticated
  using (
    id = auth.uid()
    or id in (
      select m.usuario_id
        from public.membros_empresa m
       where m.empresa_id in (select public.minhas_empresas())
    )
  );

create policy usuarios_update on public.usuarios
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Membros: visíveis dentro da empresa; dono muda papel e remove;
-- qualquer membro pode sair. Entrada só via criar_empresa() ou aceitar_convite().
create policy membros_select on public.membros_empresa
  for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));

create policy membros_update on public.membros_empresa
  for update to authenticated
  using (public.tem_papel(empresa_id, array['dono']::public.papel_membro[]))
  with check (public.tem_papel(empresa_id, array['dono']::public.papel_membro[]));

create policy membros_delete on public.membros_empresa
  for delete to authenticated
  using (
    usuario_id = auth.uid()
    or public.tem_papel(empresa_id, array['dono']::public.papel_membro[])
  );

-- Convites: só o dono vê, cria e revoga (o token é segredo).
create policy convites_select on public.convites
  for select to authenticated
  using (public.tem_papel(empresa_id, array['dono']::public.papel_membro[]));

create policy convites_insert on public.convites
  for insert to authenticated
  with check (
    public.tem_papel(empresa_id, array['dono']::public.papel_membro[])
    and criado_por = auth.uid()
  );

create policy convites_update on public.convites
  for update to authenticated
  using (public.tem_papel(empresa_id, array['dono']::public.papel_membro[]))
  with check (public.tem_papel(empresa_id, array['dono']::public.papel_membro[]));

-- Clientes: todos os membros leem; dono, projetista e vendas criam e editam;
-- só o dono exclui.
create policy clientes_select on public.clientes
  for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));

create policy clientes_insert on public.clientes
  for insert to authenticated
  with check (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]));

create policy clientes_update on public.clientes
  for update to authenticated
  using (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]))
  with check (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]));

create policy clientes_delete on public.clientes
  for delete to authenticated
  using (public.tem_papel(empresa_id, array['dono']::public.papel_membro[]));

-- =============================================================================
-- Operações controladas (RPC)
-- =============================================================================

-- Cria uma empresa e torna o usuário atual o dono, numa única transação.
create or replace function public.criar_empresa(p_nome text, p_cnpj text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario uuid := auth.uid();
  v_empresa uuid;
  v_cnpj    text := nullif(upper(regexp_replace(coalesce(p_cnpj, ''), '[^0-9A-Za-z]', '', 'g')), '');
begin
  if v_usuario is null then
    raise exception 'É preciso estar autenticado.' using errcode = '28000';
  end if;

  insert into public.empresas (nome, cnpj)
  values (btrim(p_nome), v_cnpj)
  returning id into v_empresa;

  insert into public.membros_empresa (empresa_id, usuario_id, papel)
  values (v_empresa, v_usuario, 'dono');

  return v_empresa;
end;
$$;

-- Dados públicos de um convite, para a tela de aceite (quem tem o link).
create or replace function public.ver_convite(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.convites%rowtype;
  v_empresa text;
begin
  select * into v from public.convites where token = p_token;
  if not found then
    return null;
  end if;

  select nome into v_empresa from public.empresas where id = v.empresa_id;

  return jsonb_build_object(
    'empresa_nome', v_empresa,
    'email', v.email,
    'papel', v.papel,
    'expira_em', v.expira_em,
    'estado', case
      when v.revogado_em is not null then 'revogado'
      when v.aceito_em is not null then 'aceito'
      when v.expira_em < now() then 'expirado'
      else 'pendente'
    end
  );
end;
$$;

-- Aceita um convite: o e-mail do usuário precisa ser o do convite.
create or replace function public.aceitar_convite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario uuid := auth.uid();
  v_email   text;
  v         public.convites%rowtype;
begin
  if v_usuario is null then
    raise exception 'É preciso estar autenticado.' using errcode = '28000';
  end if;

  select * into v from public.convites where token = p_token for update;
  if not found then
    raise exception 'Convite inválido.' using errcode = 'P0001', hint = 'convite_invalido';
  end if;
  if v.revogado_em is not null then
    raise exception 'Este convite foi revogado.' using errcode = 'P0001', hint = 'convite_revogado';
  end if;
  if v.aceito_em is not null then
    raise exception 'Este convite já foi usado.' using errcode = 'P0001', hint = 'convite_usado';
  end if;
  if v.expira_em < now() then
    raise exception 'Este convite expirou.' using errcode = 'P0001', hint = 'convite_expirado';
  end if;

  select email into v_email from public.usuarios where id = v_usuario;
  if v_email is distinct from v.email then
    raise exception 'Este convite foi enviado para outro e-mail.'
      using errcode = 'P0001', hint = 'convite_outro_email';
  end if;

  insert into public.membros_empresa (empresa_id, usuario_id, papel)
  values (v.empresa_id, v_usuario, v.papel)
  on conflict (empresa_id, usuario_id) do nothing;

  update public.convites
     set aceito_em = now(), aceito_por = v_usuario
   where id = v.id;

  return v.empresa_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Execução de funções: tira o EXECUTE padrão de PUBLIC e concede o necessário.
-- -----------------------------------------------------------------------------
revoke execute on function
  public.definir_updated_at(),
  public.criar_perfil_usuario(),
  public.sincronizar_email_usuario(),
  public.garantir_dono_na_empresa(),
  public.minhas_empresas(),
  public.tem_papel(uuid, public.papel_membro[]),
  public.criar_empresa(text, text),
  public.ver_convite(text),
  public.aceitar_convite(text)
  from public, anon, authenticated;

grant execute on function public.minhas_empresas() to authenticated;
grant execute on function public.tem_papel(uuid, public.papel_membro[]) to authenticated;
grant execute on function public.criar_empresa(text, text) to authenticated;
grant execute on function public.aceitar_convite(text) to authenticated;
grant execute on function public.ver_convite(text) to anon, authenticated;
