-- =============================================================================
-- Fase 2 — Fornecedores, materiais, formatos de chapa, fitas de borda e
-- estoque inicial.
--
-- Unidades:
--   * Medidas de chapa e espessura de material: inteiros em décimos de mm (_dmm).
--   * Espessura de fita: inteiros em centésimos de mm (_cmm), porque fitas
--     finas têm duas casas (0,45 mm = 45).
--   * Comprimento de fita em estoque: décimos de mm (_dmm); 50 m = 500000.
--   * Dinheiro: centavos (bigint). Preço nulo = ainda não informado.
--
-- Isolamento:
--   * Toda referência entre tabelas de negócio é uma FK composta
--     (empresa_id, id). Assim nenhuma linha pode apontar para dado de outra
--     empresa, mesmo que alguém conheça o UUID (a checagem de FK ignora RLS).
-- =============================================================================

create type public.tipo_material as enum ('mdf', 'mdp', 'compensado', 'hdf', 'outro');

-- Direção do veio em relação ao formato da chapa.
create type public.direcao_veio as enum ('sem_veio', 'comprimento', 'largura');

create type public.tipo_movimento_estoque as enum ('saldo_inicial', 'ajuste', 'entrada', 'saida');

-- -----------------------------------------------------------------------------
-- Fornecedores
-- -----------------------------------------------------------------------------
create table public.fornecedores (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  nome        text not null check (char_length(btrim(nome)) between 2 and 160),
  documento   text check (documento is null or documento ~ '^([0-9]{11}|[0-9A-Z]{12}[0-9]{2})$'),
  contato     text check (contato is null or char_length(contato) <= 120),
  telefone    text check (telefone is null or char_length(telefone) <= 30),
  email       text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  observacoes text check (observacoes is null or char_length(observacoes) <= 2000),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (empresa_id, id)
);

create unique index fornecedores_nome_unico on public.fornecedores (empresa_id, lower(btrim(nome)));

create trigger fornecedores_updated_at
  before update on public.fornecedores
  for each row execute function public.definir_updated_at();

-- -----------------------------------------------------------------------------
-- Materiais (MDF 6/9/15/18/25, MDP, compensado, HDF, personalizados)
-- -----------------------------------------------------------------------------
create table public.materiais (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references public.empresas (id) on delete cascade,
  tipo                  public.tipo_material not null,
  nome                  text not null check (char_length(btrim(nome)) between 2 and 160),
  fabricante            text check (fabricante is null or char_length(fabricante) <= 80),
  cor_padrao            text check (cor_padrao is null or char_length(cor_padrao) <= 80),
  -- Espessura de catálogo (0,1 mm a 100 mm).
  espessura_nominal_dmm integer not null check (espessura_nominal_dmm between 1 and 1000),
  -- Espessura medida na chapa. Limitada a ±20% da nominal para pegar erro de digitação.
  espessura_real_dmm    integer check (
    espessura_real_dmm is null
    or espessura_real_dmm * 10 between espessura_nominal_dmm * 8 and espessura_nominal_dmm * 12
  ),
  -- A que o motor usa: a real quando informada, senão a nominal.
  espessura_calculo_dmm integer generated always as (coalesce(espessura_real_dmm, espessura_nominal_dmm)) stored,
  veio                  public.direcao_veio not null default 'sem_veio',
  fornecedor_id         uuid,
  observacoes           text check (observacoes is null or char_length(observacoes) <= 2000),
  ativo                 boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, fornecedor_id)
    references public.fornecedores (empresa_id, id) on delete set null (fornecedor_id)
);

create unique index materiais_nome_espessura_unico
  on public.materiais (empresa_id, lower(btrim(nome)), espessura_nominal_dmm);
create index materiais_fornecedor_idx on public.materiais (fornecedor_id);

create trigger materiais_updated_at
  before update on public.materiais
  for each row execute function public.definir_updated_at();

-- -----------------------------------------------------------------------------
-- Formatos de chapa: um material pode ter vários tamanhos, cada um com preço
-- e estoque próprios. Se o material tem veio, ele segue o eixo indicado em
-- materiais.veio (comprimento ou largura desta chapa).
-- -----------------------------------------------------------------------------
create table public.chapas (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  material_id     uuid not null,
  comprimento_dmm integer not null check (comprimento_dmm between 1000 and 60000), -- 100 mm a 6 m
  largura_dmm     integer not null check (largura_dmm between 1000 and 60000),
  preco_centavos  bigint check (preco_centavos is null or preco_centavos between 0 and 100000000),
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (empresa_id, id),
  -- empresa_id na chave: uma empresa não descobre, por erro de duplicidade, dados de outra.
  unique (empresa_id, material_id, comprimento_dmm, largura_dmm),
  foreign key (empresa_id, material_id)
    references public.materiais (empresa_id, id) on delete cascade
);

create index chapas_material_idx on public.chapas (material_id);

create trigger chapas_updated_at
  before update on public.chapas
  for each row execute function public.definir_updated_at();

-- -----------------------------------------------------------------------------
-- Fitas de borda
-- -----------------------------------------------------------------------------
create table public.fitas (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresas (id) on delete cascade,
  nome                 text not null check (char_length(btrim(nome)) between 2 and 160),
  fabricante           text check (fabricante is null or char_length(fabricante) <= 80),
  cor_padrao           text check (cor_padrao is null or char_length(cor_padrao) <= 80),
  largura_dmm          integer not null check (largura_dmm between 50 and 1000),     -- 5 a 100 mm
  espessura_cmm        integer not null check (espessura_cmm between 10 and 1000),   -- 0,10 a 10 mm
  comprimento_rolo_dmm integer check (comprimento_rolo_dmm is null or comprimento_rolo_dmm between 10000 and 10000000), -- 1 a 1000 m
  preco_metro_centavos bigint check (preco_metro_centavos is null or preco_metro_centavos between 0 and 10000000),
  fornecedor_id        uuid,
  observacoes          text check (observacoes is null or char_length(observacoes) <= 2000),
  ativo                boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, fornecedor_id)
    references public.fornecedores (empresa_id, id) on delete set null (fornecedor_id)
);

create unique index fitas_identidade_unica
  on public.fitas (empresa_id, lower(btrim(nome)), largura_dmm, espessura_cmm);
create index fitas_fornecedor_idx on public.fitas (fornecedor_id);

create trigger fitas_updated_at
  before update on public.fitas
  for each row execute function public.definir_updated_at();

-- -----------------------------------------------------------------------------
-- Estoque: o saldo é sempre a soma dos movimentos.
-- Chapa: quantidade em unidades. Fita: quantidade em décimos de mm.
-- Movimentos não são apagados nem editados; a chapa/fita com histórico não
-- pode ser excluída (desative-a).
-- -----------------------------------------------------------------------------
create table public.estoque_movimentos (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  chapa_id   uuid,
  fita_id    uuid,
  tipo       public.tipo_movimento_estoque not null,
  quantidade bigint not null check (quantidade <> 0),
  motivo     text check (motivo is null or char_length(motivo) <= 300),
  criado_por uuid references public.usuarios (id) on delete set null default auth.uid(),
  -- clock_timestamp: ordem real mesmo com vários movimentos na mesma transação.
  created_at timestamptz not null default clock_timestamp(),
  check ((chapa_id is null) <> (fita_id is null)),
  foreign key (empresa_id, chapa_id) references public.chapas (empresa_id, id),
  foreign key (empresa_id, fita_id) references public.fitas (empresa_id, id)
);

create index estoque_movimentos_chapa_idx on public.estoque_movimentos (chapa_id) where chapa_id is not null;
create index estoque_movimentos_fita_idx on public.estoque_movimentos (fita_id) where fita_id is not null;
create index estoque_movimentos_empresa_idx on public.estoque_movimentos (empresa_id, created_at desc);

-- Saldo por item. security_invoker: a RLS de estoque_movimentos vale aqui.
create view public.estoque_saldos
with (security_invoker = true) as
select
  empresa_id,
  chapa_id,
  fita_id,
  sum(quantidade)::bigint as saldo,
  max(created_at)         as atualizado_em
from public.estoque_movimentos
group by empresa_id, chapa_id, fita_id;

-- =============================================================================
-- Privilégios
-- =============================================================================
revoke all on table
  public.fornecedores, public.materiais, public.chapas, public.fitas,
  public.estoque_movimentos, public.estoque_saldos
  from anon, authenticated;

grant select, delete on public.fornecedores to authenticated;
grant insert (empresa_id, nome, documento, contato, telefone, email, observacoes, ativo)
  on public.fornecedores to authenticated;
grant update (nome, documento, contato, telefone, email, observacoes, ativo)
  on public.fornecedores to authenticated;

grant select, delete on public.materiais to authenticated;
grant insert (empresa_id, tipo, nome, fabricante, cor_padrao, espessura_nominal_dmm, espessura_real_dmm,
              veio, fornecedor_id, observacoes, ativo)
  on public.materiais to authenticated;
grant update (tipo, nome, fabricante, cor_padrao, espessura_nominal_dmm, espessura_real_dmm,
              veio, fornecedor_id, observacoes, ativo)
  on public.materiais to authenticated;

grant select, delete on public.chapas to authenticated;
grant insert (empresa_id, material_id, comprimento_dmm, largura_dmm, preco_centavos, ativo)
  on public.chapas to authenticated;
grant update (comprimento_dmm, largura_dmm, preco_centavos, ativo)
  on public.chapas to authenticated;

grant select, delete on public.fitas to authenticated;
grant insert (empresa_id, nome, fabricante, cor_padrao, largura_dmm, espessura_cmm, comprimento_rolo_dmm,
              preco_metro_centavos, fornecedor_id, observacoes, ativo)
  on public.fitas to authenticated;
grant update (nome, fabricante, cor_padrao, largura_dmm, espessura_cmm, comprimento_rolo_dmm,
              preco_metro_centavos, fornecedor_id, observacoes, ativo)
  on public.fitas to authenticated;

-- Movimentos só entram pelas funções de estoque.
grant select on public.estoque_movimentos to authenticated;
grant select on public.estoque_saldos to authenticated;

-- =============================================================================
-- RLS: todos os membros leem; dono e projetista cadastram e editam;
-- só o dono exclui.
-- =============================================================================
alter table public.fornecedores       enable row level security;
alter table public.materiais          enable row level security;
alter table public.chapas             enable row level security;
alter table public.fitas              enable row level security;
alter table public.estoque_movimentos enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['fornecedores', 'materiais', 'chapas', 'fitas'] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using (empresa_id in (select public.minhas_empresas()))', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated
         with check (public.tem_papel(empresa_id, array[''dono'', ''projetista'']::public.papel_membro[]))', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated
         using (public.tem_papel(empresa_id, array[''dono'', ''projetista'']::public.papel_membro[]))
         with check (public.tem_papel(empresa_id, array[''dono'', ''projetista'']::public.papel_membro[]))', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated
         using (public.tem_papel(empresa_id, array[''dono'']::public.papel_membro[]))', t);
  end loop;
end;
$$;

create policy estoque_movimentos_select on public.estoque_movimentos
  for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));

-- =============================================================================
-- Estoque: define o saldo contado. Grava a diferença como movimento.
-- Dono, projetista e produção podem ajustar.
-- =============================================================================
create or replace function public.definir_estoque(
  p_chapa  uuid default null,
  p_fita   uuid default null,
  p_saldo  bigint default null,
  p_motivo text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_atual   bigint;
  v_tem     boolean;
  v_delta   bigint;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar autenticado.' using errcode = '28000';
  end if;
  if (p_chapa is null) = (p_fita is null) then
    raise exception 'Informe uma chapa ou uma fita.' using errcode = 'P0001', hint = 'estoque_item';
  end if;
  if p_saldo is null or p_saldo < 0 then
    raise exception 'O estoque não pode ser negativo.' using errcode = 'P0001', hint = 'estoque_negativo';
  end if;

  -- Trava o item: dois ajustes simultâneos não podem calcular a mesma diferença.
  if p_chapa is not null then
    select empresa_id into v_empresa from public.chapas where id = p_chapa for update;
  else
    select empresa_id into v_empresa from public.fitas where id = p_fita for update;
  end if;

  if v_empresa is null
     or not public.tem_papel(v_empresa, array['dono', 'projetista', 'producao']::public.papel_membro[]) then
    raise exception 'Item não encontrado ou sem permissão para ajustar o estoque.' using errcode = '42501';
  end if;

  select coalesce(sum(quantidade), 0), count(*) > 0
    into v_atual, v_tem
    from public.estoque_movimentos
   where (p_chapa is not null and chapa_id = p_chapa)
      or (p_fita is not null and fita_id = p_fita);

  v_delta := p_saldo - v_atual;
  if v_delta <> 0 then
    insert into public.estoque_movimentos (empresa_id, chapa_id, fita_id, tipo, quantidade, motivo, criado_por)
    values (
      v_empresa, p_chapa, p_fita,
      case when v_tem then 'ajuste' else 'saldo_inicial' end::public.tipo_movimento_estoque,
      v_delta, nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid()
    );
  end if;

  return p_saldo;
end;
$$;

-- =============================================================================
-- Importação de materiais e formatos de chapa (CSV já lido e validado no app).
-- SECURITY INVOKER: cada insert/update passa pela RLS do usuário.
-- Tudo ou nada: um erro em qualquer linha desfaz a importação inteira.
-- Campos vazios não apagam valores já cadastrados.
--
-- Cada elemento de p_linhas:
--   linha, tipo, nome, fabricante, cor_padrao, espessura_nominal_dmm,
--   espessura_real_dmm, veio, observacoes, comprimento_dmm, largura_dmm,
--   preco_centavos, fornecedor (nome), estoque (unidades)
-- =============================================================================
create or replace function public.importar_materiais(p_empresa uuid, p_linhas jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  l                jsonb;
  i                integer := 0;
  v_forn           uuid;
  v_mat            uuid;
  v_chapa          uuid;
  v_mat_criados    uuid[] := '{}';
  v_mat_atualiz    uuid[] := '{}';
  n_chapas_criadas integer := 0;
  n_chapas_atualiz integer := 0;
  n_forn_criados   integer := 0;
  n_estoques       integer := 0;
begin
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'Formato de importação inválido.' using errcode = 'P0001', hint = 'importacao_formato';
  end if;
  if jsonb_array_length(p_linhas) = 0 then
    raise exception 'Nenhuma linha para importar.' using errcode = 'P0001', hint = 'importacao_vazia';
  end if;
  if jsonb_array_length(p_linhas) > 2000 then
    raise exception 'Máximo de 2000 linhas por importação.' using errcode = 'P0001', hint = 'importacao_limite';
  end if;

  for l in select value from jsonb_array_elements(p_linhas) loop
    i := i + 1;
    begin
      -- Fornecedor por nome (cria se não existir).
      v_forn := null;
      if nullif(btrim(coalesce(l ->> 'fornecedor', '')), '') is not null then
        select id into v_forn
          from public.fornecedores
         where empresa_id = p_empresa and lower(btrim(nome)) = lower(btrim(l ->> 'fornecedor'));
        if v_forn is null then
          insert into public.fornecedores (empresa_id, nome)
          values (p_empresa, btrim(l ->> 'fornecedor'))
          returning id into v_forn;
          n_forn_criados := n_forn_criados + 1;
        end if;
      end if;

      -- Material por nome + espessura nominal.
      select id into v_mat
        from public.materiais
       where empresa_id = p_empresa
         and lower(btrim(nome)) = lower(btrim(l ->> 'nome'))
         and espessura_nominal_dmm = (l ->> 'espessura_nominal_dmm')::integer;

      if v_mat is null then
        insert into public.materiais (
          empresa_id, tipo, nome, fabricante, cor_padrao,
          espessura_nominal_dmm, espessura_real_dmm, veio, fornecedor_id, observacoes
        ) values (
          p_empresa,
          (l ->> 'tipo')::public.tipo_material,
          btrim(l ->> 'nome'),
          nullif(btrim(coalesce(l ->> 'fabricante', '')), ''),
          nullif(btrim(coalesce(l ->> 'cor_padrao', '')), ''),
          (l ->> 'espessura_nominal_dmm')::integer,
          (l ->> 'espessura_real_dmm')::integer,
          coalesce((l ->> 'veio')::public.direcao_veio, 'sem_veio'),
          v_forn,
          nullif(btrim(coalesce(l ->> 'observacoes', '')), '')
        )
        returning id into v_mat;
        v_mat_criados := v_mat_criados || v_mat;
      elsif not (v_mat = any (v_mat_criados) or v_mat = any (v_mat_atualiz)) then
        update public.materiais
           set tipo               = coalesce((l ->> 'tipo')::public.tipo_material, tipo),
               fabricante         = coalesce(nullif(btrim(coalesce(l ->> 'fabricante', '')), ''), fabricante),
               cor_padrao         = coalesce(nullif(btrim(coalesce(l ->> 'cor_padrao', '')), ''), cor_padrao),
               espessura_real_dmm = coalesce((l ->> 'espessura_real_dmm')::integer, espessura_real_dmm),
               veio               = coalesce((l ->> 'veio')::public.direcao_veio, veio),
               fornecedor_id      = coalesce(v_forn, fornecedor_id),
               observacoes        = coalesce(nullif(btrim(coalesce(l ->> 'observacoes', '')), ''), observacoes),
               ativo              = true
         where id = v_mat;
        v_mat_atualiz := v_mat_atualiz || v_mat;
      end if;

      -- Formato de chapa (opcional na linha).
      if l ->> 'comprimento_dmm' is not null then
        select id into v_chapa
          from public.chapas
         where material_id = v_mat
           and comprimento_dmm = (l ->> 'comprimento_dmm')::integer
           and largura_dmm = (l ->> 'largura_dmm')::integer;

        if v_chapa is null then
          insert into public.chapas (empresa_id, material_id, comprimento_dmm, largura_dmm, preco_centavos)
          values (
            p_empresa, v_mat,
            (l ->> 'comprimento_dmm')::integer,
            (l ->> 'largura_dmm')::integer,
            (l ->> 'preco_centavos')::bigint
          )
          returning id into v_chapa;
          n_chapas_criadas := n_chapas_criadas + 1;
        else
          update public.chapas
             set preco_centavos = coalesce((l ->> 'preco_centavos')::bigint, preco_centavos),
                 ativo = true
           where id = v_chapa;
          n_chapas_atualiz := n_chapas_atualiz + 1;
        end if;

        if l ->> 'estoque' is not null then
          perform public.definir_estoque(
            p_chapa  => v_chapa,
            p_saldo  => (l ->> 'estoque')::bigint,
            p_motivo => 'Importação de planilha'
          );
          n_estoques := n_estoques + 1;
        end if;
      elsif l ->> 'preco_centavos' is not null or l ->> 'estoque' is not null then
        raise exception 'preço e estoque exigem o tamanho da chapa (comprimento e largura).'
          using errcode = 'P0001';
      end if;

    exception when others then
      raise exception 'Linha %: %', coalesce(l ->> 'linha', i::text), sqlerrm
        using errcode = sqlstate, hint = 'importacao_linha';
    end;
  end loop;

  return jsonb_build_object(
    'materiais_criados', cardinality(v_mat_criados),
    'materiais_atualizados', cardinality(v_mat_atualiz),
    'chapas_criadas', n_chapas_criadas,
    'chapas_atualizadas', n_chapas_atualiz,
    'fornecedores_criados', n_forn_criados,
    'estoques_definidos', n_estoques
  );
end;
$$;

-- =============================================================================
-- Importação de fitas de borda. Mesmas regras de importar_materiais.
--
-- Cada elemento de p_linhas:
--   linha, nome, fabricante, cor_padrao, largura_dmm, espessura_cmm,
--   comprimento_rolo_dmm, preco_metro_centavos, fornecedor (nome),
--   estoque_dmm
-- =============================================================================
create or replace function public.importar_fitas(p_empresa uuid, p_linhas jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  l              jsonb;
  i              integer := 0;
  v_forn         uuid;
  v_fita         uuid;
  n_criadas      integer := 0;
  n_atualizadas  integer := 0;
  n_forn_criados integer := 0;
  n_estoques     integer := 0;
begin
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'Formato de importação inválido.' using errcode = 'P0001', hint = 'importacao_formato';
  end if;
  if jsonb_array_length(p_linhas) = 0 then
    raise exception 'Nenhuma linha para importar.' using errcode = 'P0001', hint = 'importacao_vazia';
  end if;
  if jsonb_array_length(p_linhas) > 2000 then
    raise exception 'Máximo de 2000 linhas por importação.' using errcode = 'P0001', hint = 'importacao_limite';
  end if;

  for l in select value from jsonb_array_elements(p_linhas) loop
    i := i + 1;
    begin
      v_forn := null;
      if nullif(btrim(coalesce(l ->> 'fornecedor', '')), '') is not null then
        select id into v_forn
          from public.fornecedores
         where empresa_id = p_empresa and lower(btrim(nome)) = lower(btrim(l ->> 'fornecedor'));
        if v_forn is null then
          insert into public.fornecedores (empresa_id, nome)
          values (p_empresa, btrim(l ->> 'fornecedor'))
          returning id into v_forn;
          n_forn_criados := n_forn_criados + 1;
        end if;
      end if;

      select id into v_fita
        from public.fitas
       where empresa_id = p_empresa
         and lower(btrim(nome)) = lower(btrim(l ->> 'nome'))
         and largura_dmm = (l ->> 'largura_dmm')::integer
         and espessura_cmm = (l ->> 'espessura_cmm')::integer;

      if v_fita is null then
        insert into public.fitas (
          empresa_id, nome, fabricante, cor_padrao, largura_dmm, espessura_cmm,
          comprimento_rolo_dmm, preco_metro_centavos, fornecedor_id
        ) values (
          p_empresa,
          btrim(l ->> 'nome'),
          nullif(btrim(coalesce(l ->> 'fabricante', '')), ''),
          nullif(btrim(coalesce(l ->> 'cor_padrao', '')), ''),
          (l ->> 'largura_dmm')::integer,
          (l ->> 'espessura_cmm')::integer,
          (l ->> 'comprimento_rolo_dmm')::integer,
          (l ->> 'preco_metro_centavos')::bigint,
          v_forn
        )
        returning id into v_fita;
        n_criadas := n_criadas + 1;
      else
        update public.fitas
           set fabricante           = coalesce(nullif(btrim(coalesce(l ->> 'fabricante', '')), ''), fabricante),
               cor_padrao           = coalesce(nullif(btrim(coalesce(l ->> 'cor_padrao', '')), ''), cor_padrao),
               comprimento_rolo_dmm = coalesce((l ->> 'comprimento_rolo_dmm')::integer, comprimento_rolo_dmm),
               preco_metro_centavos = coalesce((l ->> 'preco_metro_centavos')::bigint, preco_metro_centavos),
               fornecedor_id        = coalesce(v_forn, fornecedor_id),
               ativo                = true
         where id = v_fita;
        n_atualizadas := n_atualizadas + 1;
      end if;

      if l ->> 'estoque_dmm' is not null then
        perform public.definir_estoque(
          p_fita   => v_fita,
          p_saldo  => (l ->> 'estoque_dmm')::bigint,
          p_motivo => 'Importação de planilha'
        );
        n_estoques := n_estoques + 1;
      end if;

    exception when others then
      raise exception 'Linha %: %', coalesce(l ->> 'linha', i::text), sqlerrm
        using errcode = sqlstate, hint = 'importacao_linha';
    end;
  end loop;

  return jsonb_build_object(
    'fitas_criadas', n_criadas,
    'fitas_atualizadas', n_atualizadas,
    'fornecedores_criados', n_forn_criados,
    'estoques_definidos', n_estoques
  );
end;
$$;

revoke execute on function
  public.definir_estoque(uuid, uuid, bigint, text),
  public.importar_materiais(uuid, jsonb),
  public.importar_fitas(uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.definir_estoque(uuid, uuid, bigint, text) to authenticated;
grant execute on function public.importar_materiais(uuid, jsonb) to authenticated;
grant execute on function public.importar_fitas(uuid, jsonb) to authenticated;
