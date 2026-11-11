-- =============================================================================
-- Painel do dono do sistema: vendas e licenças.
--
-- Administrador da plataforma é quem está na tabela abaixo. Só se entra nela
-- pelo SQL do Supabase (a API não grava). O administrador enxerga os dados
-- COMERCIAIS de cada marcenaria (nome, dono, situação da licença, cobranças),
-- nunca os dados de trabalho dela (clientes, projetos, orçamentos).
-- =============================================================================

create table public.administradores_plataforma (
  usuario_id uuid primary key references public.usuarios (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.administradores_plataforma enable row level security;

-- Cada um só descobre se ele mesmo é administrador (para a tela mostrar o atalho).
create policy administradores_plataforma_select on public.administradores_plataforma
  for select to authenticated
  using (usuario_id = auth.uid());

revoke all on public.administradores_plataforma from anon, authenticated;
grant select on public.administradores_plataforma to authenticated;

create or replace function public.eh_admin_plataforma()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.administradores_plataforma where usuario_id = auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- Histórico de cobranças aprovadas. O Mercado Pago informa a data da última
-- cobrança de cada assinatura; cada data nova vira uma linha aqui.
-- -----------------------------------------------------------------------------
create table public.assinatura_cobrancas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  assinatura_id  uuid not null references public.assinaturas (id) on delete cascade,
  cobrada_em     timestamptz not null,
  valor_centavos integer not null check (valor_centavos > 0),
  created_at     timestamptz not null default now(),
  unique (assinatura_id, cobrada_em)
);

create index assinatura_cobrancas_data_idx on public.assinatura_cobrancas (cobrada_em desc);
create index assinatura_cobrancas_empresa_idx on public.assinatura_cobrancas (empresa_id, cobrada_em desc);

alter table public.assinatura_cobrancas enable row level security;

create policy assinatura_cobrancas_select on public.assinatura_cobrancas
  for select to authenticated
  using (public.tem_papel(empresa_id, array['dono']::public.papel_membro[]));

revoke all on public.assinatura_cobrancas from anon, authenticated;
grant select on public.assinatura_cobrancas to authenticated;

-- A mesma função da migration de assinaturas, agora registrando a cobrança.
create or replace function public.aplicar_assinatura_mp(
  p_id uuid,
  p_mp_id text,
  p_status text,
  p_proxima_cobranca timestamptz default null,
  p_ultima_cobranca timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.status_assinatura;
  v_linha  public.assinaturas;
begin
  v_status := case p_status
    when 'pending' then 'pendente'
    when 'authorized' then 'ativa'
    when 'paused' then 'pausada'
    when 'cancelled' then 'cancelada'
    when 'canceled' then 'cancelada'
  end;
  if v_status is null then
    raise exception 'Situação desconhecida: %', left(p_status, 40) using errcode = '22023';
  end if;
  select * into v_linha from public.assinaturas where id = p_id and mp_preapproval_id = p_mp_id for update;
  if not found then
    return false;
  end if;
  if v_status <> 'cancelada' then
    update public.assinaturas set status = 'cancelada'
     where empresa_id = v_linha.empresa_id and id <> p_id and status = 'pendente';
  end if;
  update public.assinaturas
     set status = v_status,
         proxima_cobranca = case when v_status = 'ativa' then p_proxima_cobranca else null end,
         ultima_cobranca = coalesce(p_ultima_cobranca, ultima_cobranca),
         paga_ate = case
           when p_ultima_cobranca is not null
             then greatest(coalesce(paga_ate, '-infinity'), p_ultima_cobranca + interval '1 month' + interval '5 days')
           when v_status = 'ativa' and paga_ate is null then now() + interval '3 days'
           else paga_ate
         end
   where id = p_id;
  if p_ultima_cobranca is not null and v_linha.valor_centavos is not null then
    insert into public.assinatura_cobrancas (empresa_id, assinatura_id, cobrada_em, valor_centavos)
    values (v_linha.empresa_id, p_id, p_ultima_cobranca, v_linha.valor_centavos)
    on conflict (assinatura_id, cobrada_em) do nothing;
  end if;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Consultas do painel. Todas conferem o administrador antes de qualquer leitura.
-- -----------------------------------------------------------------------------
create or replace function public.exigir_admin_plataforma()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.eh_admin_plataforma() then
    raise exception 'Acesso restrito ao administrador do sistema.' using errcode = '42501';
  end if;
end;
$$;

-- Uma linha por marcenaria, com a situação da licença.
create or replace function public.admin_empresas()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.exigir_admin_plataforma();
  return coalesce((
    select jsonb_agg(l order by l.criada_em desc)
      from (
        select e.id,
               e.nome,
               e.cnpj,
               e.created_at as criada_em,
               e.teste_ate,
               d.nome as dono_nome,
               d.email as dono_email,
               (select count(*) from public.membros_empresa m where m.empresa_id = e.id) as usuarios,
               (select count(*) from public.projetos p where p.empresa_id = e.id) as projetos,
               (select max(p.updated_at) from public.projetos p where p.empresa_id = e.id) as ultima_atividade,
               a.status as assinatura_status,
               a.valor_centavos,
               a.ultima_cobranca,
               a.proxima_cobranca,
               pg.paga_ate,
               (select coalesce(sum(c.valor_centavos), 0) from public.assinatura_cobrancas c where c.empresa_id = e.id) as total_pago_centavos,
               case
                 when pg.paga_ate > now() and a.status = 'ativa' then 'ativa'
                 when pg.paga_ate > now() then 'encerrando'
                 when e.teste_ate > now() then 'teste'
                 else 'bloqueada'
               end as situacao
          from public.empresas e
          left join lateral (
            select u.nome, u.email
              from public.membros_empresa m join public.usuarios u on u.id = m.usuario_id
             where m.empresa_id = e.id and m.papel = 'dono'
             order by m.created_at limit 1
          ) d on true
          left join lateral (
            select s.status, s.valor_centavos, s.ultima_cobranca, s.proxima_cobranca
              from public.assinaturas s
             where s.empresa_id = e.id
             order by (s.status in ('ativa', 'pausada', 'pendente')) desc, s.created_at desc limit 1
          ) a on true
          left join lateral (select max(s.paga_ate) as paga_ate from public.assinaturas s where s.empresa_id = e.id) pg on true
      ) l
  ), '[]'::jsonb);
end;
$$;

-- Números do mês e receita dos últimos 6 meses (horário de Brasília).
create or replace function public.admin_resumo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mes timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  perform public.exigir_admin_plataforma();
  return jsonb_build_object(
    'agora', now(),
    -- Receita mensal recorrente: assinaturas ativas com o período pago em aberto.
    'recorrente_centavos', (select coalesce(sum(valor_centavos), 0) from public.assinaturas where status = 'ativa' and paga_ate > now() and ultima_cobranca is not null),
    'recebido_mes_centavos', (select coalesce(sum(valor_centavos), 0) from public.assinatura_cobrancas where cobrada_em >= v_mes),
    'empresas_novas_30d', (select count(*) from public.empresas where created_at > now() - interval '30 days'),
    'cancelamentos_30d', (select count(*) from public.assinaturas where status = 'cancelada' and ultima_cobranca is not null and updated_at > now() - interval '30 days'),
    'meses', (
      select jsonb_agg(jsonb_build_object('mes', to_char(m.inicio, 'YYYY-MM'), 'centavos', coalesce(r.centavos, 0), 'cobrancas', coalesce(r.n, 0)) order by m.inicio)
        from (select generate_series(date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '5 months', date_trunc('month', now() at time zone 'America/Sao_Paulo'), interval '1 month') as inicio) m
        left join lateral (
          select sum(c.valor_centavos) as centavos, count(*) as n
            from public.assinatura_cobrancas c
           where (c.cobrada_em at time zone 'America/Sao_Paulo') >= m.inicio and (c.cobrada_em at time zone 'America/Sao_Paulo') < m.inicio + interval '1 month'
        ) r on true
    )
  );
end;
$$;

-- Dá mais dias de teste a uma marcenaria (1 a 90), a contar de hoje ou do fim atual, o que for mais tarde.
create or replace function public.admin_estender_teste(p_empresa uuid, p_dias integer)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ate timestamptz;
begin
  perform public.exigir_admin_plataforma();
  if p_dias is null or p_dias < 1 or p_dias > 90 then
    raise exception 'Informe de 1 a 90 dias.' using errcode = '22023';
  end if;
  update public.empresas set teste_ate = greatest(teste_ate, now()) + make_interval(days => p_dias)
   where id = p_empresa returning teste_ate into v_ate;
  if not found then
    raise exception 'Empresa não encontrada.' using errcode = 'P0002';
  end if;
  return v_ate;
end;
$$;

revoke execute on function
  public.eh_admin_plataforma(),
  public.exigir_admin_plataforma(),
  public.admin_empresas(),
  public.admin_resumo(),
  public.admin_estender_teste(uuid, integer),
  public.aplicar_assinatura_mp(uuid, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;

grant execute on function public.admin_empresas() to authenticated;
grant execute on function public.admin_resumo() to authenticated;
grant execute on function public.admin_estender_teste(uuid, integer) to authenticated;
grant execute on function public.aplicar_assinatura_mp(uuid, text, text, timestamptz, timestamptz) to service_role;
