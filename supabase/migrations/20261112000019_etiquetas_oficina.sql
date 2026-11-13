-- =============================================================================
-- Etiquetas com QR por peça e a oficina pelo celular.
--
-- Cada peça de uma ordem de produção vira uma linha com identificador próprio
-- (o que vai no QR da etiqueta) e a etapa em que está: a cortar, cortada,
-- fitada, furada, montada. Quem é da produção escaneia a etiqueta no celular
-- e marca a etapa; o dono acompanha cada pedido sem ir até a oficina.
--
-- As linhas nascem junto com a ordem, a partir de dados.etiquetas (que não
-- muda depois: veja proteger_ordem). A etapa só muda pela função
-- marcar_etapa_pecas, que guarda o histórico (quem e quando).
--
-- Também: balde público "manuais", com o manual de montagem publicado para o
-- montador ou para o cliente (só a forma do móvel e os passos, sem preço nem
-- dado de cliente), no mesmo esquema do balde "ar".
-- =============================================================================

create type public.etapa_peca as enum ('a_cortar', 'cortada', 'fitada', 'furada', 'montada');

create table public.pecas_ordem (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  ordem_id    uuid not null,
  -- Número da etiqueta dentro da ordem (1, 2, 3…).
  seq         integer not null check (seq between 1 and 5000),
  -- Peça no projeto (id do componente) e qual unidade, quando a ordem tem vários módulos iguais.
  componente  text not null check (componente ~ '^[a-z0-9_]{1,80}$'),
  unidade     integer not null check (unidade between 1 and 999),
  codigo      text not null check (codigo ~ '^[A-Z0-9-]{1,12}$'),
  nome        text not null check (char_length(nome) between 1 and 160),
  -- Etapas que se aplicam a esta peça (peça sem fita pula "fitada").
  tem_fita    boolean not null,
  tem_furo    boolean not null,
  etapa       public.etapa_peca not null default 'a_cortar',
  etapa_em    timestamptz,
  etapa_por   uuid references public.usuarios (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (empresa_id, id),
  unique (ordem_id, seq),
  unique (ordem_id, componente, unidade),
  foreign key (empresa_id, ordem_id) references public.ordens_producao (empresa_id, id) on delete cascade
);

create index pecas_ordem_ordem_idx on public.pecas_ordem (empresa_id, ordem_id, seq);

create table public.pecas_ordem_eventos (
  id          bigint generated always as identity primary key,
  empresa_id  uuid not null,
  peca_id     uuid not null,
  de          public.etapa_peca not null,
  para        public.etapa_peca not null,
  por         uuid references public.usuarios (id) on delete set null,
  em          timestamptz not null default now(),
  foreign key (empresa_id, peca_id) references public.pecas_ordem (empresa_id, id) on delete cascade
);

create index pecas_ordem_eventos_peca_idx on public.pecas_ordem_eventos (peca_id, em desc);

alter table public.pecas_ordem enable row level security;
alter table public.pecas_ordem_eventos enable row level security;

-- Toda a equipe da empresa vê (inclusive vendas: "em que pé está o pedido?").
create policy pecas_ordem_select on public.pecas_ordem
  for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));

create policy pecas_ordem_eventos_select on public.pecas_ordem_eventos
  for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));

-- Ninguém grava direto pela API: as linhas nascem com a ordem e mudam pela função.
revoke all on public.pecas_ordem, public.pecas_ordem_eventos from anon, authenticated;
grant select on public.pecas_ordem, public.pecas_ordem_eventos to authenticated;

-- Andamento de cada ordem, para a lista da produção. Respeita a RLS de quem consulta.
create view public.andamento_ordens with (security_invoker = true) as
select empresa_id,
       ordem_id,
       count(*)::integer                                                 as total,
       count(*) filter (where etapa >= 'cortada')::integer               as cortadas,
       count(*) filter (where tem_fita)::integer                         as com_fita,
       count(*) filter (where tem_fita and etapa >= 'fitada')::integer   as fitadas,
       count(*) filter (where tem_furo)::integer                         as com_furo,
       count(*) filter (where tem_furo and etapa >= 'furada')::integer   as furadas,
       count(*) filter (where etapa = 'montada')::integer                as montadas
  from public.pecas_ordem
 group by empresa_id, ordem_id;

revoke all on public.andamento_ordens from anon, authenticated;
grant select on public.andamento_ordens to authenticated;

-- -----------------------------------------------------------------------------
-- As peças nascem com a ordem.
--
-- dados.etiquetas: [{ "componente": "lateral_esquerda", "unidade": 1,
--   "codigo": "P01", "nome": "Lateral esquerda", "fita": true, "furo": true }]
-- Ordem sem dados.etiquetas (criada antes desta versão) fica sem etiquetas.
-- -----------------------------------------------------------------------------
create or replace function public.criar_pecas_da_ordem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lista jsonb := new.dados -> 'etiquetas';
  v_n     integer;
begin
  if v_lista is null or v_lista = 'null'::jsonb then
    return new;
  end if;
  if jsonb_typeof(v_lista) <> 'array' then
    raise exception 'Etiquetas da ordem em formato inválido.' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(v_lista);
  if v_n > 5000 then
    raise exception 'A ordem passa de 5000 peças; divida em mais de uma ordem.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_lista) x
     where jsonb_typeof(x) <> 'object'
        or jsonb_typeof(x -> 'componente') <> 'string'
        or jsonb_typeof(x -> 'codigo') <> 'string'
        or jsonb_typeof(x -> 'nome') <> 'string'
        or jsonb_typeof(x -> 'unidade') <> 'number'
        or jsonb_typeof(x -> 'fita') <> 'boolean'
        or jsonb_typeof(x -> 'furo') <> 'boolean'
        or (x ->> 'unidade') !~ '^[0-9]{1,3}$'
  ) then
    raise exception 'Etiquetas da ordem em formato inválido.' using errcode = '22023';
  end if;
  -- As restrições da tabela conferem o resto (código, nome, repetição).
  insert into public.pecas_ordem (empresa_id, ordem_id, seq, componente, unidade, codigo, nome, tem_fita, tem_furo)
  select new.empresa_id, new.id, x.n::integer, x.e ->> 'componente', (x.e ->> 'unidade')::integer, x.e ->> 'codigo', x.e ->> 'nome', (x.e ->> 'fita')::boolean, (x.e ->> 'furo')::boolean
    from jsonb_array_elements(v_lista) with ordinality as x (e, n);
  return new;
end;
$$;

create trigger ordens_criar_pecas
  after insert on public.ordens_producao
  for each row execute function public.criar_pecas_da_ordem();

-- -----------------------------------------------------------------------------
-- Marca a etapa de uma ou mais peças (escaneando a etiqueta, ou em lote na ordem).
-- Pode voltar uma etapa (marcou errado). Guarda quem e quando. A primeira peça
-- que sai de "a cortar" leva a ordem de "aguardando" para "em corte".
-- Devolve quantas peças mudaram.
-- -----------------------------------------------------------------------------
create or replace function public.marcar_etapa_pecas(p_pecas uuid[], p_etapa public.etapa_peca)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qtd      integer := coalesce(array_length(p_pecas, 1), 0);
  v_achadas  integer;
  v_empresas uuid[];
  v_mudou    integer;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar autenticado.' using errcode = '28000';
  end if;
  if v_qtd = 0 or v_qtd > 2000 then
    raise exception 'Marque de 1 a 2000 peças por vez.' using errcode = '22023';
  end if;
  if p_etapa is null then
    raise exception 'Informe a etapa.' using errcode = '22023';
  end if;

  -- Trava as peças (na ordem dos ids) e confere a permissão em todas.
  perform 1 from public.pecas_ordem where id = any (p_pecas) order by id for update;
  select count(*), array_agg(distinct empresa_id) into v_achadas, v_empresas
    from public.pecas_ordem where id = any (p_pecas);
  if v_achadas <> (select count(distinct x) from unnest(p_pecas) x)
     or exists (
       select 1 from unnest(v_empresas) e
        where not public.tem_papel(e, array['dono', 'projetista', 'producao']::public.papel_membro[])
     )
  then
    raise exception 'Peça não encontrada ou sem permissão.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.pecas_ordem p join public.ordens_producao o on o.id = p.ordem_id
     where p.id = any (p_pecas) and o.status = 'cancelada'
  ) then
    raise exception 'A ordem foi cancelada.' using errcode = 'P0001', hint = 'ordem_cancelada';
  end if;

  with mudadas as (
    update public.pecas_ordem p
       set etapa = p_etapa, etapa_em = now(), etapa_por = auth.uid()
      from (select id, etapa as antes from public.pecas_ordem where id = any (p_pecas)) a
     where p.id = a.id and a.antes <> p_etapa
    returning p.empresa_id, p.id, a.antes, p.ordem_id
  ), eventos as (
    insert into public.pecas_ordem_eventos (empresa_id, peca_id, de, para, por)
    select empresa_id, id, antes, p_etapa, auth.uid() from mudadas
    returning 1
  )
  select count(*) into v_mudou from eventos;

  if p_etapa <> 'a_cortar' then
    update public.ordens_producao o set status = 'em_corte'
     where o.status = 'aguardando'
       and o.id in (select ordem_id from public.pecas_ordem where id = any (p_pecas));
  end if;
  return v_mudou;
end;
$$;

revoke execute on function public.criar_pecas_da_ordem() from public, anon, authenticated;
revoke execute on function public.marcar_etapa_pecas(uuid[], public.etapa_peca) from public, anon;
grant execute on function public.marcar_etapa_pecas(uuid[], public.etapa_peca) to authenticated;

-- -----------------------------------------------------------------------------
-- Balde "manuais": manual de montagem publicado (JSON), aberto por link.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Supabase Storage não encontrado: balde "manuais" não criado (ambiente de teste).';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('manuais', 'manuais', true, 2097152, array['application/json'])
  on conflict (id) do update
    set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy manuais_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'manuais'
        and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.json$'
        and (storage.foldername(name))[1] in (select e::text from public.minhas_empresas() e)
      )
  $p$;

  execute $p$
    create policy manuais_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'manuais'
        and (storage.foldername(name))[1] in (
          select m.empresa_id::text from public.membros_empresa m where m.usuario_id = auth.uid() and m.papel = 'dono'
        )
      )
  $p$;
end $$;

-- Trava de assinatura, como em toda tabela de negócio: sem assinatura ativa,
-- a ordem continua visível, mas a etapa não muda.
create trigger exigir_assinatura before insert or update on public.pecas_ordem
  for each row execute function public.exigir_assinatura();
create trigger exigir_assinatura before insert or update on public.pecas_ordem_eventos
  for each row execute function public.exigir_assinatura();
