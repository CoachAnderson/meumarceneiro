-- =============================================================================
-- Visão Inteligente IA — registro de análises e cota mensal.
--
-- Cada análise de foto custa uma chamada paga à IA. O banco controla a cota
-- por empresa e guarda o registro de uso (quem, quando, quantos tokens).
-- A imagem NÃO é guardada: vai do navegador à função de servidor e de lá à
-- IA, e não fica em tabela nem em arquivo.
--
-- Só as funções abaixo gravam nesta tabela; a API não insere nem altera.
-- =============================================================================

create type public.status_analise_visao as enum ('iniciada', 'concluida', 'falhou', 'recusada');

-- Análises por mês. Só o suporte altera (a API não grava nesta coluna).
alter table public.empresas add column visao_limite_mensal integer not null default 30 check (visao_limite_mensal between 0 and 100000);

create table public.visao_analises (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  status          public.status_analise_visao not null default 'iniciada',
  modelo          text check (modelo is null or char_length(modelo) <= 80),
  tokens_entrada  integer check (tokens_entrada is null or tokens_entrada >= 0),
  tokens_saida    integer check (tokens_saida is null or tokens_saida >= 0),
  -- Por que falhou ou foi recusada (texto curto, sem dados da imagem).
  motivo          text check (motivo is null or char_length(motivo) <= 300),
  criado_por      uuid references public.usuarios (id) on delete set null,
  created_at      timestamptz not null default now(),
  concluida_em    timestamptz
);

create index visao_analises_empresa_idx on public.visao_analises (empresa_id, created_at desc);

alter table public.visao_analises enable row level security;

create policy visao_analises_select on public.visao_analises
  for select to authenticated
  using (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]));

revoke all on public.visao_analises from anon, authenticated;
grant select on public.visao_analises to authenticated;

-- Conta para a cota: análises concluídas no mês (horário de Brasília) e as
-- iniciadas nos últimos 5 minutos (em andamento). Falhas não gastam cota.
create or replace function public.visao_usadas_no_mes(p_empresa uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.visao_analises
   where empresa_id = p_empresa
     and created_at >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
     and (status = 'concluida' or (status = 'iniciada' and created_at > now() - interval '5 minutes'));
$$;

create or replace function public.cota_visao(p_empresa uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.tem_papel(p_empresa, array['dono', 'projetista', 'vendas']::public.papel_membro[]) then
    raise exception 'Sem permissão para usar a Visão IA nesta empresa.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'usadas', public.visao_usadas_no_mes(p_empresa),
    'limite', (select visao_limite_mensal from public.empresas where id = p_empresa)
  );
end;
$$;

-- Reserva uma análise. Trava a empresa para duas reservas simultâneas não
-- passarem juntas da cota.
create or replace function public.iniciar_analise_visao(p_empresa uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite integer;
  v_id     uuid;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar autenticado.' using errcode = '28000';
  end if;
  if not public.tem_papel(p_empresa, array['dono', 'projetista', 'vendas']::public.papel_membro[]) then
    raise exception 'Sem permissão para usar a Visão IA nesta empresa.' using errcode = '42501';
  end if;
  select visao_limite_mensal into v_limite from public.empresas where id = p_empresa for update;
  if public.visao_usadas_no_mes(p_empresa) >= v_limite then
    raise exception 'A cota de análises de imagem deste mês acabou (% por mês).', v_limite
      using errcode = 'P0001', hint = 'cota_visao';
  end if;
  insert into public.visao_analises (empresa_id, criado_por) values (p_empresa, auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

-- Fecha a análise. Só quem iniciou, só uma vez.
create or replace function public.concluir_analise_visao(
  p_id uuid,
  p_status public.status_analise_visao,
  p_modelo text default null,
  p_tokens_entrada integer default null,
  p_tokens_saida integer default null,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status = 'iniciada' then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  update public.visao_analises
     set status = p_status,
         modelo = left(p_modelo, 80),
         tokens_entrada = greatest(0, p_tokens_entrada),
         tokens_saida = greatest(0, p_tokens_saida),
         motivo = left(p_motivo, 300),
         concluida_em = now()
   where id = p_id and criado_por = auth.uid() and status = 'iniciada';
  if not found then
    raise exception 'Análise não encontrada ou já encerrada.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function
  public.visao_usadas_no_mes(uuid),
  public.cota_visao(uuid),
  public.iniciar_analise_visao(uuid),
  public.concluir_analise_visao(uuid, public.status_analise_visao, text, integer, integer, text)
  from public, anon, authenticated;

grant execute on function public.cota_visao(uuid) to authenticated;
grant execute on function public.iniciar_analise_visao(uuid) to authenticated;
grant execute on function public.concluir_analise_visao(uuid, public.status_analise_visao, text, integer, integer, text) to authenticated;
