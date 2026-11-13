-- =============================================================================
-- Financeiro: contas a receber e a pagar.
--
-- Cada lançamento é uma conta (uma parcela, um boleto, uma despesa). Parcelas
-- de uma mesma venda ou compra têm o mesmo `grupo`. A baixa (pagou/recebeu)
-- e o estorno passam por funções, para a baixa parcial ser uma operação só.
--
-- Dinheiro é assunto do dono: só ele vê e mexe no financeiro.
-- =============================================================================

create type public.tipo_lancamento as enum ('receber', 'pagar');
create type public.status_lancamento as enum ('aberto', 'pago', 'cancelado');
create type public.forma_pagamento as enum ('dinheiro', 'pix', 'boleto', 'cartao_credito', 'cartao_debito', 'transferencia', 'cheque', 'outro');

-- Onde o dinheiro está: caixa, conta no banco, carteira digital.
create table public.contas_financeiras (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references public.empresas (id) on delete cascade,
  nome                  text not null check (char_length(btrim(nome)) between 1 and 80),
  saldo_inicial_centavos bigint not null default 0 check (saldo_inicial_centavos between -10000000000 and 10000000000),
  ativa                 boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (empresa_id, id)
);
create unique index contas_financeiras_nome on public.contas_financeiras (empresa_id, lower(btrim(nome)));

create table public.categorias_financeiras (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  tipo        public.tipo_lancamento not null,
  nome        text not null check (char_length(btrim(nome)) between 1 and 80),
  ativa       boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (empresa_id, id)
);
create unique index categorias_financeiras_nome on public.categorias_financeiras (empresa_id, tipo, lower(btrim(nome)));

create table public.lancamentos (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresas (id) on delete cascade,
  tipo                 public.tipo_lancamento not null,
  descricao            text not null check (char_length(btrim(descricao)) between 1 and 200),
  valor_centavos       bigint not null check (valor_centavos between 1 and 10000000000),
  vencimento           date not null,
  status               public.status_lancamento not null default 'aberto',
  pago_em              date,
  valor_pago_centavos  bigint check (valor_pago_centavos is null or valor_pago_centavos between 1 and 10000000000),
  forma                public.forma_pagamento,
  conta_id             uuid,
  categoria_id         uuid,
  cliente_id           uuid,
  fornecedor_id        uuid,
  orcamento_id         uuid,
  -- Parcelas de uma mesma venda ou compra.
  grupo                uuid,
  parcela              integer check (parcela is null or parcela between 0 and 120),
  parcelas             integer check (parcelas is null or parcelas between 0 and 120),
  documento            text check (documento is null or char_length(documento) <= 60),
  observacao           text check (observacao is null or char_length(observacao) <= 1000),
  -- Boleto emitido pelo Mercado Pago da marcenaria. Só o servidor grava.
  boleto               jsonb check (boleto is null or (jsonb_typeof(boleto) = 'object' and pg_column_size(boleto) <= 8192)),
  criado_por           uuid references public.usuarios (id) on delete set null default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (empresa_id, id),
  -- Pago tem data e valor; aberto e cancelado não.
  check ((status = 'pago') = (pago_em is not null and valor_pago_centavos is not null)),
  check (tipo = 'receber' or cliente_id is null),
  check (tipo = 'pagar' or fornecedor_id is null),
  foreign key (empresa_id, conta_id) references public.contas_financeiras (empresa_id, id) on delete restrict,
  foreign key (empresa_id, categoria_id) references public.categorias_financeiras (empresa_id, id) on delete set null (categoria_id),
  foreign key (empresa_id, cliente_id) references public.clientes (empresa_id, id) on delete set null (cliente_id),
  foreign key (empresa_id, fornecedor_id) references public.fornecedores (empresa_id, id) on delete set null (fornecedor_id),
  foreign key (empresa_id, orcamento_id) references public.orcamentos (empresa_id, id) on delete set null (orcamento_id)
);

create index lancamentos_vencimento_idx on public.lancamentos (empresa_id, tipo, status, vencimento);
create index lancamentos_pago_idx on public.lancamentos (empresa_id, pago_em) where status = 'pago';
create index lancamentos_orcamento_idx on public.lancamentos (orcamento_id) where orcamento_id is not null;
create index lancamentos_grupo_idx on public.lancamentos (grupo) where grupo is not null;

-- A categoria tem o mesmo tipo do lançamento; o que já foi pago não muda sem estornar.
create or replace function public.proteger_lancamento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo public.tipo_lancamento;
begin
  if new.categoria_id is not null then
    select tipo into v_tipo from public.categorias_financeiras where id = new.categoria_id;
    if v_tipo is distinct from new.tipo then
      raise exception 'A categoria é de outro tipo (receber ou pagar).' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid();
    new.created_at := now();
    return new;
  end if;
  if new.tipo is distinct from old.tipo or new.empresa_id is distinct from old.empresa_id
     or new.criado_por is distinct from old.criado_por or new.created_at is distinct from old.created_at then
    raise exception 'O lançamento não muda de tipo, de empresa nem de autor.' using errcode = '42501';
  end if;
  -- Pago só muda pelo estorno (que volta para aberto) ou na observação e no documento.
  if old.status = 'pago' and new.status = 'pago'
     and (new.valor_centavos is distinct from old.valor_centavos or new.vencimento is distinct from old.vencimento
          or new.pago_em is distinct from old.pago_em or new.valor_pago_centavos is distinct from old.valor_pago_centavos
          or new.conta_id is distinct from old.conta_id or new.forma is distinct from old.forma) then
    raise exception 'Lançamento pago: estorne antes de alterar valor, datas ou conta.' using errcode = '42501', hint = 'lancamento_pago';
  end if;
  return new;
end;
$$;

revoke execute on function public.proteger_lancamento() from public, anon, authenticated;

create trigger lancamentos_proteger before insert or update on public.lancamentos
  for each row execute function public.proteger_lancamento();
create trigger lancamentos_updated_at before update on public.lancamentos
  for each row execute function public.definir_updated_at();
create trigger contas_financeiras_updated_at before update on public.contas_financeiras
  for each row execute function public.definir_updated_at();

create trigger exigir_assinatura before insert or update on public.lancamentos
  for each row execute function public.exigir_assinatura();
create trigger exigir_assinatura before insert or update on public.contas_financeiras
  for each row execute function public.exigir_assinatura();
create trigger exigir_assinatura before insert or update on public.categorias_financeiras
  for each row execute function public.exigir_assinatura();

alter table public.contas_financeiras enable row level security;
alter table public.categorias_financeiras enable row level security;
alter table public.lancamentos enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['contas_financeiras', 'categorias_financeiras', 'lancamentos'] loop
    execute format($p$create policy %1$s_dono on public.%1$s for all to authenticated
      using (public.tem_papel(empresa_id, array['dono']::public.papel_membro[]))
      with check (public.tem_papel(empresa_id, array['dono']::public.papel_membro[]))$p$, t);
  end loop;
end $$;

revoke all on public.contas_financeiras, public.categorias_financeiras, public.lancamentos from anon, authenticated;
grant select, delete on public.contas_financeiras, public.categorias_financeiras, public.lancamentos to authenticated;
grant insert (empresa_id, nome, saldo_inicial_centavos, ativa) on public.contas_financeiras to authenticated;
grant update (nome, saldo_inicial_centavos, ativa) on public.contas_financeiras to authenticated;
grant insert (empresa_id, tipo, nome, ativa) on public.categorias_financeiras to authenticated;
grant update (nome, ativa) on public.categorias_financeiras to authenticated;
grant insert (id, empresa_id, tipo, descricao, valor_centavos, vencimento, categoria_id, cliente_id, fornecedor_id, orcamento_id, grupo, parcela, parcelas, documento, observacao, forma, conta_id)
  on public.lancamentos to authenticated;
-- Status, pagamento e cancelamento só pelas funções abaixo.
grant update (descricao, valor_centavos, vencimento, categoria_id, cliente_id, fornecedor_id, documento, observacao, forma, conta_id)
  on public.lancamentos to authenticated;

-- Saldo de cada conta: inicial + recebido − pago por ela. Respeita a RLS de quem consulta.
create view public.saldos_contas with (security_invoker = true) as
select c.empresa_id,
       c.id as conta_id,
       c.saldo_inicial_centavos
       + coalesce(sum(case when l.tipo = 'receber' then l.valor_pago_centavos else -l.valor_pago_centavos end) filter (where l.status = 'pago'), 0)::bigint as saldo_centavos
  from public.contas_financeiras c
  left join public.lancamentos l on l.conta_id = c.id and l.empresa_id = c.empresa_id
 group by c.empresa_id, c.id, c.saldo_inicial_centavos;

revoke all on public.saldos_contas from anon, authenticated;
grant select on public.saldos_contas to authenticated;

-- -----------------------------------------------------------------------------
-- Baixa: pagou ou recebeu. Parcial: esta parte fica paga e o resto vira um
-- lançamento novo em aberto, com o mesmo vencimento. Estorno: volta para
-- aberto. Cancelar: não vai mais ser pago. As funções rodam com a permissão
-- de quem chama (a RLS vale: só o dono).
-- -----------------------------------------------------------------------------

-- As funções atualizam status e campos de pagamento: para isso precisam de
-- UPDATE nessas colunas, que a API não concede direto. Elas rodam como quem
-- chama; o privilégio vem do dono da função via esta concessão limitada.
grant update (status, pago_em, valor_pago_centavos, grupo) on public.lancamentos to authenticated;

-- Mas pela API, status e pagamento só mudam pelas funções.
create or replace function public.lancamento_so_por_funcao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.status is distinct from old.status or new.pago_em is distinct from old.pago_em
      or new.valor_pago_centavos is distinct from old.valor_pago_centavos or new.grupo is distinct from old.grupo)
     and coalesce(current_setting('marcenaria.funcao_financeiro', true), '') <> 'sim' then
    raise exception 'Use baixar, estornar ou cancelar.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.lancamento_so_por_funcao() from public, anon, authenticated;

create trigger lancamentos_so_por_funcao before update on public.lancamentos
  for each row execute function public.lancamento_so_por_funcao();

create or replace function public.baixar_lancamento(
  p_id uuid, p_pago_em date, p_valor_centavos bigint, p_conta uuid, p_forma public.forma_pagamento, p_parcial boolean default false
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  l       public.lancamentos;
  v_resto uuid;
begin
  perform set_config('marcenaria.funcao_financeiro', 'sim', true);
  select * into l from public.lancamentos where id = p_id for update;
  if not found then
    raise exception 'Lançamento não encontrado.' using errcode = '42501';
  end if;
  if l.status <> 'aberto' then
    raise exception 'Só um lançamento em aberto recebe baixa.' using errcode = 'P0001', hint = 'nao_aberto';
  end if;
  if p_valor_centavos is null or p_valor_centavos < 1 or p_valor_centavos > 10000000000 then
    raise exception 'Valor pago inválido.' using errcode = '22023';
  end if;
  if p_pago_em is null or p_pago_em > (now() at time zone 'America/Sao_Paulo')::date + 1 then
    raise exception 'A data do pagamento não pode ser no futuro.' using errcode = '22023';
  end if;
  if p_parcial and p_valor_centavos < l.valor_centavos then
    insert into public.lancamentos (empresa_id, tipo, descricao, valor_centavos, vencimento, categoria_id, cliente_id, fornecedor_id, orcamento_id, grupo, parcela, parcelas, documento, observacao)
    values (l.empresa_id, l.tipo, l.descricao, l.valor_centavos - p_valor_centavos, l.vencimento, l.categoria_id, l.cliente_id, l.fornecedor_id, l.orcamento_id,
            coalesce(l.grupo, l.id), l.parcela, l.parcelas, l.documento, left(concat_ws(' · ', 'Saldo da baixa parcial', l.observacao), 1000))
    returning id into v_resto;
    update public.lancamentos set grupo = coalesce(grupo, id), valor_centavos = p_valor_centavos where id = p_id;
  end if;
  update public.lancamentos
     set status = 'pago', pago_em = p_pago_em, valor_pago_centavos = p_valor_centavos, conta_id = p_conta, forma = p_forma
   where id = p_id;
  perform set_config('marcenaria.funcao_financeiro', '', true);
  return v_resto;
end;
$$;

create or replace function public.estornar_lancamento(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('marcenaria.funcao_financeiro', 'sim', true);
  update public.lancamentos set status = 'aberto', pago_em = null, valor_pago_centavos = null where id = p_id and status = 'pago';
  if not found then
    raise exception 'Só um lançamento pago pode ser estornado.' using errcode = 'P0001', hint = 'nao_pago';
  end if;
  perform set_config('marcenaria.funcao_financeiro', '', true);
end;
$$;

create or replace function public.cancelar_lancamento(p_id uuid, p_cancelar boolean default true)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('marcenaria.funcao_financeiro', 'sim', true);
  update public.lancamentos set status = case when p_cancelar then 'cancelado' else 'aberto' end::public.status_lancamento
   where id = p_id and status = case when p_cancelar then 'aberto' else 'cancelado' end::public.status_lancamento;
  if not found then
    raise exception 'Só se cancela o que está em aberto (e só se reabre o que foi cancelado).' using errcode = 'P0001', hint = 'status';
  end if;
  perform set_config('marcenaria.funcao_financeiro', '', true);
end;
$$;

revoke execute on function public.baixar_lancamento(uuid, date, bigint, uuid, public.forma_pagamento, boolean) from public, anon;
revoke execute on function public.estornar_lancamento(uuid) from public, anon;
revoke execute on function public.cancelar_lancamento(uuid, boolean) from public, anon;
grant execute on function public.baixar_lancamento(uuid, date, bigint, uuid, public.forma_pagamento, boolean) to authenticated;
grant execute on function public.estornar_lancamento(uuid) to authenticated;
grant execute on function public.cancelar_lancamento(uuid, boolean) to authenticated;
