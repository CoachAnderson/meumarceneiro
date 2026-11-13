-- =============================================================================
-- Marceneiro virtual: assistente de IA que conversa com o cliente sobre o
-- móvel, no link do "ver no ambiente" (sem login) e no editor.
--
-- Apresentação: o que a marcenaria publica junto com o link do móvel. Guarda
-- a FICHA (fatos calculados pelo sistema + preço, prazo e observações que a
-- marcenaria digitou). A IA só fala do que está na ficha. O identificador é o
-- mesmo do arquivo 3D (sorteado, impossível de adivinhar) e só vale junto com
-- o identificador da empresa que está no link.
--
-- Custo: cada pergunta é uma chamada paga à IA. O banco controla:
--   - cota mensal por empresa (perguntas concluídas no mês);
--   - limite de perguntas por link (o link é público);
--   - ritmo: no máximo 6 perguntas por minuto por link, 10 por usuário no editor;
--   - validade do link (30 dias) e assinatura da empresa em dia.
--
-- O texto da conversa NÃO é gravado: só que houve pergunta, quando e tokens.
-- =============================================================================

-- Perguntas por mês. Só o suporte altera (a API não grava nesta coluna).
alter table public.empresas add column marceneiro_limite_mensal integer not null default 300
  check (marceneiro_limite_mensal between 0 and 100000);

create table public.apresentacoes (
  id               uuid primary key,
  empresa_id       uuid not null references public.empresas (id) on delete cascade,
  nome_assistente  text not null check (char_length(btrim(nome_assistente)) between 1 and 40),
  ficha            jsonb not null check (jsonb_typeof(ficha) = 'object' and octet_length(ficha::text) <= 12000),
  limite_perguntas integer not null default 40 check (limite_perguntas between 1 and 200),
  perguntas        integer not null default 0 check (perguntas >= 0),
  ativa            boolean not null default true,
  expira_em        timestamptz not null default now() + interval '30 days',
  criado_por       uuid default auth.uid() references public.usuarios (id) on delete set null,
  created_at       timestamptz not null default now(),
  check (expira_em <= created_at + interval '180 days')
);

create index apresentacoes_empresa_idx on public.apresentacoes (empresa_id, created_at desc);

alter table public.apresentacoes enable row level security;

create policy apresentacoes_select on public.apresentacoes
  for select to authenticated
  using (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]));
create policy apresentacoes_insert on public.apresentacoes
  for insert to authenticated
  with check (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]));
create policy apresentacoes_update on public.apresentacoes
  for update to authenticated
  using (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]))
  with check (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]));
create policy apresentacoes_delete on public.apresentacoes
  for delete to authenticated
  using (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]));

revoke all on public.apresentacoes from anon, authenticated;
grant select, delete on public.apresentacoes to authenticated;
grant insert (id, empresa_id, nome_assistente, ficha, limite_perguntas) on public.apresentacoes to authenticated;
-- A marcenaria só pode desligar ou religar o link; contador e validade são do banco.
grant update (ativa) on public.apresentacoes to authenticated;

create trigger exigir_assinatura before insert or update on public.apresentacoes
  for each row execute function public.exigir_assinatura();

create type public.status_pergunta_marceneiro as enum ('iniciada', 'concluida', 'falhou');

create table public.marceneiro_perguntas (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas (id) on delete cascade,
  apresentacao_id  uuid references public.apresentacoes (id) on delete set null,
  status           public.status_pergunta_marceneiro not null default 'iniciada',
  modelo           text check (modelo is null or char_length(modelo) <= 80),
  tokens_entrada   integer check (tokens_entrada is null or tokens_entrada >= 0),
  tokens_saida     integer check (tokens_saida is null or tokens_saida >= 0),
  -- Vazio quando a pergunta veio do link público (cliente sem login).
  criado_por       uuid references public.usuarios (id) on delete set null,
  created_at       timestamptz not null default now(),
  concluida_em     timestamptz
);

create index marceneiro_perguntas_empresa_idx on public.marceneiro_perguntas (empresa_id, created_at desc);
create index marceneiro_perguntas_apresentacao_idx on public.marceneiro_perguntas (apresentacao_id, created_at desc);

alter table public.marceneiro_perguntas enable row level security;

create policy marceneiro_perguntas_select on public.marceneiro_perguntas
  for select to authenticated
  using (public.tem_papel(empresa_id, array['dono', 'projetista', 'vendas']::public.papel_membro[]));

revoke all on public.marceneiro_perguntas from anon, authenticated;
grant select on public.marceneiro_perguntas to authenticated;

create trigger exigir_assinatura before insert or update on public.marceneiro_perguntas
  for each row execute function public.exigir_assinatura();

-- Conta para a cota: perguntas concluídas no mês (horário de Brasília) e as
-- iniciadas nos últimos 5 minutos (em andamento). Falhas não gastam cota.
create or replace function public.marceneiro_usadas_no_mes(p_empresa uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.marceneiro_perguntas
   where empresa_id = p_empresa
     and created_at >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
     and (status = 'concluida' or (status = 'iniciada' and created_at > now() - interval '5 minutes'));
$$;

create or replace function public.cota_marceneiro(p_empresa uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.tem_papel(p_empresa, array['dono', 'projetista', 'vendas']::public.papel_membro[]) then
    raise exception 'Sem permissão para usar o marceneiro virtual nesta empresa.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'usadas', public.marceneiro_usadas_no_mes(p_empresa),
    'limite', (select marceneiro_limite_mensal from public.empresas where id = p_empresa)
  );
end;
$$;

-- Saudação do link: nome e ficha, se o link vale. Não gasta cota. Só o servidor chama.
create or replace function public.abrir_apresentacao(p_empresa uuid, p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'nome', a.nome_assistente,
           'ficha', a.ficha,
           'restantes', greatest(0, a.limite_perguntas - a.perguntas)
         )
    from public.apresentacoes a
   where a.id = p_id
     and a.empresa_id = p_empresa
     and a.ativa
     and a.expira_em > now()
     and public.empresa_liberada(a.empresa_id);
$$;

-- Verifica a cota da empresa (com a empresa travada, para duas perguntas
-- simultâneas não passarem juntas do limite).
create or replace function public.conferir_cota_marceneiro(p_empresa uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite integer;
begin
  select marceneiro_limite_mensal into v_limite from public.empresas where id = p_empresa for update;
  if public.marceneiro_usadas_no_mes(p_empresa) >= v_limite then
    raise exception 'O marceneiro virtual atingiu o limite deste mês (% perguntas).', v_limite
      using errcode = 'P0001', hint = 'cota_marceneiro';
  end if;
end;
$$;

-- Pergunta do link público. Só o servidor chama (com a chave de serviço).
create or replace function public.iniciar_pergunta_link(p_empresa uuid, p_apresentacao uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a    public.apresentacoes;
  v_id uuid;
begin
  select * into a from public.apresentacoes where id = p_apresentacao and empresa_id = p_empresa for update;
  if not found or not a.ativa or a.expira_em <= now() then
    raise exception 'Marceneiro virtual indisponível neste link.' using errcode = 'P0001', hint = 'marceneiro_indisponivel';
  end if;
  if not public.empresa_liberada(a.empresa_id) then
    raise exception 'Assinatura da empresa inativa.' using errcode = 'P0001', hint = 'assinatura';
  end if;
  if a.perguntas >= a.limite_perguntas then
    raise exception 'Limite de perguntas deste link atingido.' using errcode = 'P0001', hint = 'limite_link';
  end if;
  if (select count(*) from public.marceneiro_perguntas
       where apresentacao_id = a.id and created_at > now() - interval '1 minute') >= 6 then
    raise exception 'Perguntas demais em pouco tempo.' using errcode = 'P0001', hint = 'devagar';
  end if;
  perform public.conferir_cota_marceneiro(a.empresa_id);

  insert into public.marceneiro_perguntas (empresa_id, apresentacao_id) values (a.empresa_id, a.id) returning id into v_id;
  update public.apresentacoes set perguntas = perguntas + 1 where id = a.id;
  return jsonb_build_object(
    'pergunta_id', v_id,
    'nome', a.nome_assistente,
    'ficha', a.ficha,
    'restantes', a.limite_perguntas - a.perguntas - 1
  );
end;
$$;

-- Pergunta feita no editor, por um membro da marcenaria.
create or replace function public.iniciar_pergunta_editor(p_empresa uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar autenticado.' using errcode = '28000';
  end if;
  if not public.tem_papel(p_empresa, array['dono', 'projetista', 'vendas']::public.papel_membro[]) then
    raise exception 'Sem permissão para usar o marceneiro virtual nesta empresa.' using errcode = '42501';
  end if;
  if not public.empresa_liberada(p_empresa) then
    raise exception 'A assinatura desta empresa não está ativa.' using errcode = 'P0001', hint = 'assinatura';
  end if;
  if (select count(*) from public.marceneiro_perguntas
       where criado_por = auth.uid() and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Perguntas demais em pouco tempo.' using errcode = 'P0001', hint = 'devagar';
  end if;
  perform public.conferir_cota_marceneiro(p_empresa);

  insert into public.marceneiro_perguntas (empresa_id, criado_por) values (p_empresa, auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

-- Fecha a pergunta, uma vez. Pergunta do editor: só quem fez. Pergunta do
-- link: só o servidor (sem usuário). Falha devolve a pergunta ao link.
create or replace function public.concluir_pergunta_marceneiro(
  p_id uuid,
  p_status public.status_pergunta_marceneiro,
  p_modelo text default null,
  p_tokens_entrada integer default null,
  p_tokens_saida integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_apresentacao uuid;
begin
  if p_status = 'iniciada' then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  update public.marceneiro_perguntas
     set status = p_status,
         modelo = left(p_modelo, 80),
         tokens_entrada = greatest(0, p_tokens_entrada),
         tokens_saida = greatest(0, p_tokens_saida),
         concluida_em = now()
   where id = p_id
     and status = 'iniciada'
     and ((auth.uid() is null and criado_por is null) or criado_por = auth.uid())
  returning apresentacao_id into v_apresentacao;
  if not found then
    raise exception 'Pergunta não encontrada ou já encerrada.' using errcode = '42501';
  end if;
  if p_status = 'falhou' and v_apresentacao is not null then
    update public.apresentacoes set perguntas = greatest(0, perguntas - 1) where id = v_apresentacao;
  end if;
end;
$$;

revoke execute on function
  public.marceneiro_usadas_no_mes(uuid),
  public.cota_marceneiro(uuid),
  public.abrir_apresentacao(uuid, uuid),
  public.conferir_cota_marceneiro(uuid),
  public.iniciar_pergunta_link(uuid, uuid),
  public.iniciar_pergunta_editor(uuid),
  public.concluir_pergunta_marceneiro(uuid, public.status_pergunta_marceneiro, text, integer, integer)
  from public, anon, authenticated;

grant execute on function public.cota_marceneiro(uuid) to authenticated;
grant execute on function public.iniciar_pergunta_editor(uuid) to authenticated;
grant execute on function public.concluir_pergunta_marceneiro(uuid, public.status_pergunta_marceneiro, text, integer, integer) to authenticated, service_role;
grant execute on function public.abrir_apresentacao(uuid, uuid) to service_role;
grant execute on function public.iniciar_pergunta_link(uuid, uuid) to service_role;
