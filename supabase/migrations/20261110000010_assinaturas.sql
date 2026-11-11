-- =============================================================================
-- Assinatura do sistema (cobrança pelo Mercado Pago).
--
-- Regra de acesso de cada empresa:
--   - período de teste: 14 dias a partir da criação (empresas.teste_ate);
--   - depois: precisa de assinatura com período pago em aberto (paga_ate).
-- Sem uma das duas, a empresa fica SOMENTE LEITURA: consulta, imprime e
-- exporta tudo, mas não cria nem altera. Apagar continua permitido (os dados
-- são do cliente).
--
-- Quem grava a situação da assinatura é só o servidor (funções com a chave de
-- serviço), a partir do que o Mercado Pago informa. A API do navegador não
-- altera nada aqui: só lê e pede para iniciar.
-- =============================================================================

create type public.status_assinatura as enum ('pendente', 'ativa', 'pausada', 'cancelada');

-- Fim do período de teste. Só o suporte altera (a API não grava nesta coluna).
alter table public.empresas add column teste_ate timestamptz not null default (now() + interval '14 days');

create table public.assinaturas (
  -- O id também é a referência enviada ao Mercado Pago (external_reference).
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresas (id) on delete cascade,
  plano             text not null check (plano in ('mensal')),
  status            public.status_assinatura not null default 'pendente',
  valor_centavos    integer check (valor_centavos is null or valor_centavos > 0),
  pagador_email     text check (pagador_email is null or char_length(pagador_email) <= 254),
  -- Identificador da assinatura no Mercado Pago (preapproval).
  mp_preapproval_id text unique check (mp_preapproval_id is null or char_length(mp_preapproval_id) between 8 and 64),
  proxima_cobranca  timestamptz,
  ultima_cobranca   timestamptz,
  -- Até quando o acesso está pago (última cobrança aprovada + 1 mês + tolerância).
  paga_ate          timestamptz,
  criado_por        uuid references public.usuarios (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- No máximo uma assinatura "viva" por empresa.
create unique index assinaturas_viva_idx on public.assinaturas (empresa_id) where status in ('pendente', 'ativa', 'pausada');
create index assinaturas_empresa_idx on public.assinaturas (empresa_id, created_at desc);

create trigger assinaturas_updated_at
  before update on public.assinaturas
  for each row execute function public.definir_updated_at();

alter table public.assinaturas enable row level security;

-- Só o dono vê os dados de cobrança. Os outros papéis sabem apenas se a
-- empresa está liberada (situacao_assinatura).
create policy assinaturas_select on public.assinaturas
  for select to authenticated
  using (public.tem_papel(empresa_id, array['dono']::public.papel_membro[]));

revoke all on public.assinaturas from anon, authenticated;
grant select on public.assinaturas to authenticated;

-- -----------------------------------------------------------------------------
-- A empresa pode gravar?
-- -----------------------------------------------------------------------------
create or replace function public.empresa_liberada(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.empresas where id = p_empresa and teste_ate > now())
      or exists (select 1 from public.assinaturas where empresa_id = p_empresa and paga_ate > now());
$$;

-- Para a tela: qualquer membro da empresa consulta.
create or replace function public.situacao_assinatura(p_empresa uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_empresa not in (select public.minhas_empresas()) then
    raise exception 'Empresa não encontrada.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'liberada', public.empresa_liberada(p_empresa),
    'teste_ate', (select teste_ate from public.empresas where id = p_empresa),
    'paga_ate', (select max(paga_ate) from public.assinaturas where empresa_id = p_empresa),
    'status', (select status from public.assinaturas where empresa_id = p_empresa
                order by (status in ('ativa', 'pausada', 'pendente')) desc, created_at desc limit 1),
    'agora', now()
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Trava de gravação. Vale para a API e para as funções chamadas por usuários
-- (auth.uid() preenchido). Servidor, suporte e migrations não passam por ela.
-- -----------------------------------------------------------------------------
create or replace function public.exigir_assinatura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.empresa_liberada(new.empresa_id) then
    raise exception 'A assinatura desta empresa não está ativa. Os dados continuam disponíveis para consulta; para criar ou alterar, o dono precisa assinar o plano.'
      using errcode = 'P0001', hint = 'assinatura';
  end if;
  return new;
end;
$$;

-- Liga a trava em toda tabela de negócio. Ficam de fora a equipe (o dono
-- precisa conseguir ajustar acessos) e a própria tabela de assinaturas.
do $$
declare
  t text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname not in ('assinaturas', 'membros_empresa', 'convites')
  loop
    execute format('create trigger exigir_assinatura before insert or update on public.%I for each row execute function public.exigir_assinatura()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Iniciar uma assinatura (dono). Devolve o id novo e os identificadores das
-- tentativas anteriores que ficaram pendentes, para o servidor cancelá-las no
-- Mercado Pago: assim nunca sobram dois links de pagamento válidos.
-- -----------------------------------------------------------------------------
create or replace function public.iniciar_assinatura(p_empresa uuid, p_plano text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anteriores jsonb;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar autenticado.' using errcode = '28000';
  end if;
  if not public.tem_papel(p_empresa, array['dono']::public.papel_membro[]) then
    raise exception 'Só o dono da empresa pode assinar o plano.' using errcode = '42501';
  end if;
  if p_plano is distinct from 'mensal' then
    raise exception 'Plano desconhecido.' using errcode = '22023';
  end if;
  perform 1 from public.empresas where id = p_empresa for update;
  if exists (select 1 from public.assinaturas where empresa_id = p_empresa and status in ('ativa', 'pausada')) then
    raise exception 'Esta empresa já tem uma assinatura.' using errcode = 'P0001', hint = 'ja_assinante';
  end if;
  with fechadas as (
    update public.assinaturas set status = 'cancelada'
     where empresa_id = p_empresa and status = 'pendente'
    returning mp_preapproval_id
  )
  select coalesce(jsonb_agg(mp_preapproval_id) filter (where mp_preapproval_id is not null), '[]'::jsonb) into v_anteriores from fechadas;
  insert into public.assinaturas (empresa_id, plano, criado_por) values (p_empresa, p_plano, auth.uid()) returning id into v_id;
  return jsonb_build_object('id', v_id, 'anteriores', v_anteriores);
end;
$$;

-- -----------------------------------------------------------------------------
-- Só o servidor (chave de serviço) executa as duas funções abaixo.
-- -----------------------------------------------------------------------------

-- Liga a assinatura recém-criada ao identificador do Mercado Pago.
create or replace function public.vincular_assinatura_mp(p_id uuid, p_mp_id text, p_valor_centavos integer, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.assinaturas
     set mp_preapproval_id = p_mp_id, valor_centavos = p_valor_centavos, pagador_email = left(p_email, 254)
   where id = p_id and status = 'pendente' and mp_preapproval_id is null;
  if not found then
    raise exception 'Assinatura não encontrada ou já vinculada.' using errcode = 'P0002';
  end if;
end;
$$;

-- Aplica a situação informada pelo Mercado Pago. Pode ser chamada várias vezes
-- com os mesmos dados (avisos repetidos): o resultado é o mesmo.
--   p_status: pending | authorized | paused | cancelled (ou canceled)
--   p_ultima_cobranca: data da última cobrança APROVADA (summarized.last_charged_date)
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
  -- Uma tentativa pendente mais nova não impede a que foi paga de valer.
  if v_status <> 'cancelada' then
    update public.assinaturas set status = 'cancelada'
     where empresa_id = v_linha.empresa_id and id <> p_id and status = 'pendente';
  end if;
  update public.assinaturas
     set status = v_status,
         proxima_cobranca = case when v_status = 'ativa' then p_proxima_cobranca else null end,
         ultima_cobranca = coalesce(p_ultima_cobranca, ultima_cobranca),
         paga_ate = case
           -- Cobrança aprovada: vale um mês, mais 5 dias de tolerância para a renovação.
           when p_ultima_cobranca is not null
             then greatest(coalesce(paga_ate, '-infinity'), p_ultima_cobranca + interval '1 month' + interval '5 days')
           -- Autorizada, primeira cobrança ainda em processamento: 3 dias provisórios.
           when v_status = 'ativa' and paga_ate is null then now() + interval '3 days'
           else paga_ate
         end
   where id = p_id;
  return true;
end;
$$;

revoke execute on function
  public.empresa_liberada(uuid),
  public.situacao_assinatura(uuid),
  public.exigir_assinatura(),
  public.iniciar_assinatura(uuid, text),
  public.vincular_assinatura_mp(uuid, text, integer, text),
  public.aplicar_assinatura_mp(uuid, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;

grant execute on function public.situacao_assinatura(uuid) to authenticated;
grant execute on function public.iniciar_assinatura(uuid, text) to authenticated;
grant execute on function public.vincular_assinatura_mp(uuid, text, integer, text) to service_role;
grant execute on function public.aplicar_assinatura_mp(uuid, text, text, timestamptz, timestamptz) to service_role;
