-- =============================================================================
-- Fase 9 — Produção e estoque.
--
--   * Ferragens passam a ter estoque (mesmo livro de movimentos).
--   * Ordem de produção: fotografia de uma versão do projeto (peças, plano de
--     corte e o que ela consome). Não guarda preço: a produção enxerga a ordem.
--   * Baixa de estoque: uma função só, atômica. Ou baixa tudo (chapas, fita,
--     ferragens, retalhos usados; e guarda as sobras como retalho), ou nada.
--     Cada ordem baixa uma vez; o estorno desfaz.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Estoque de ferragens e ligação do movimento com a ordem
-- -----------------------------------------------------------------------------
alter table public.estoque_movimentos
  add column ferragem_id uuid,
  add column ordem_id uuid,
  add foreign key (empresa_id, ferragem_id) references public.ferragens (empresa_id, id);

alter table public.estoque_movimentos drop constraint estoque_movimentos_check;
alter table public.estoque_movimentos
  add constraint estoque_movimentos_um_item check (num_nonnulls(chapa_id, fita_id, ferragem_id) = 1);

create index estoque_movimentos_ferragem_idx on public.estoque_movimentos (ferragem_id) where ferragem_id is not null;
create index estoque_movimentos_ordem_idx on public.estoque_movimentos (ordem_id) where ordem_id is not null;

drop view public.estoque_saldos;
create view public.estoque_saldos
with (security_invoker = true) as
select
  empresa_id,
  chapa_id,
  fita_id,
  ferragem_id,
  sum(quantidade)::bigint as saldo,
  max(created_at)         as atualizado_em
from public.estoque_movimentos
group by empresa_id, chapa_id, fita_id, ferragem_id;

revoke all on public.estoque_saldos from anon, authenticated;
grant select on public.estoque_saldos to authenticated;

-- Ferragem com movimento não pode ser excluída (desative-a), como chapas e fitas.

create or replace function public.definir_estoque_ferragem(p_ferragem uuid, p_saldo bigint, p_motivo text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_atual   bigint;
  v_tem     boolean;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar autenticado.' using errcode = '28000';
  end if;
  if p_saldo is null or p_saldo < 0 then
    raise exception 'O estoque não pode ser negativo.' using errcode = 'P0001', hint = 'estoque_negativo';
  end if;
  select empresa_id into v_empresa from public.ferragens where id = p_ferragem for update;
  if v_empresa is null
     or not public.tem_papel(v_empresa, array['dono', 'projetista', 'producao']::public.papel_membro[]) then
    raise exception 'Item não encontrado ou sem permissão para ajustar o estoque.' using errcode = '42501';
  end if;
  select coalesce(sum(quantidade), 0), count(*) > 0 into v_atual, v_tem
    from public.estoque_movimentos where ferragem_id = p_ferragem;
  if p_saldo <> v_atual then
    insert into public.estoque_movimentos (empresa_id, ferragem_id, tipo, quantidade, motivo, criado_por)
    values (v_empresa, p_ferragem,
            case when v_tem then 'ajuste' else 'saldo_inicial' end::public.tipo_movimento_estoque,
            p_saldo - v_atual, nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid());
  end if;
  return p_saldo;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ordens de produção
-- -----------------------------------------------------------------------------
create type public.status_ordem as enum ('aguardando', 'em_corte', 'em_montagem', 'concluida', 'cancelada');

alter table public.empresas add column proxima_ordem integer not null default 1 check (proxima_ordem >= 1);

create table public.ordens_producao (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas (id) on delete cascade,
  numero          integer not null check (numero >= 1),
  projeto_id      uuid,
  projeto_versao  integer not null check (projeto_versao >= 1),
  projeto_nome    text not null check (char_length(projeto_nome) between 1 and 160),
  cliente_nome    text check (cliente_nome is null or char_length(cliente_nome) <= 160),
  -- Peças, plano de corte e consumo. Sem preços. Até 1 MB.
  dados           jsonb not null check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 1048576),
  status          public.status_ordem not null default 'aguardando',
  prazo           date,
  observacao      text check (observacao is null or char_length(observacao) <= 1000),
  -- Quando o estoque foi baixado (null = ainda não).
  baixa_em        timestamptz,
  baixa_por       uuid references public.usuarios (id) on delete set null,
  -- Retalhos criados pela baixa (para o estorno saber o que desfazer).
  sobras_criadas  jsonb not null default '[]'::jsonb,
  criado_por      uuid references public.usuarios (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (empresa_id, id),
  unique (empresa_id, numero),
  foreign key (empresa_id, projeto_id) references public.projetos (empresa_id, id) on delete set null (projeto_id)
);

create index ordens_empresa_idx on public.ordens_producao (empresa_id, status, created_at desc);

alter table public.estoque_movimentos
  add foreign key (empresa_id, ordem_id) references public.ordens_producao (empresa_id, id) on delete set null (ordem_id);

create or replace function public.numerar_ordem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.empresas set proxima_ordem = proxima_ordem + 1
   where id = new.empresa_id
   returning proxima_ordem - 1 into new.numero;
  if not found then
    raise exception 'Empresa não encontrada.' using errcode = '23503';
  end if;
  new.criado_por := auth.uid();
  new.created_at := now();
  new.status := 'aguardando';
  new.baixa_em := null;
  new.baixa_por := null;
  new.sobras_criadas := '[]'::jsonb;
  return new;
end;
$$;

create trigger ordens_numerar
  before insert on public.ordens_producao
  for each row execute function public.numerar_ordem();

-- Pela API só mudam status, prazo e observação. A baixa só muda pelas funções
-- (que rodam aninhadas, com profundidade de trigger zero e papel de dono da função).
create or replace function public.proteger_ordem()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.empresa_id is distinct from old.empresa_id
     or new.numero is distinct from old.numero
     or new.projeto_versao is distinct from old.projeto_versao
     or new.projeto_nome is distinct from old.projeto_nome
     or new.cliente_nome is distinct from old.cliente_nome
     or new.dados is distinct from old.dados
     or new.criado_por is distinct from old.criado_por
     or new.created_at is distinct from old.created_at
  then
    raise exception 'O conteúdo da ordem não pode ser alterado; crie outra a partir do projeto.' using errcode = '42501';
  end if;
  if (new.baixa_em is distinct from old.baixa_em
      or new.baixa_por is distinct from old.baixa_por
      or new.sobras_criadas is distinct from old.sobras_criadas)
     and coalesce(current_setting('marcenaria.baixa', true), '') <> 'sim'
  then
    raise exception 'A baixa de estoque só muda pelas funções de baixa e estorno.' using errcode = '42501';
  end if;
  if new.status = 'cancelada' and new.baixa_em is not null then
    raise exception 'Estorne a baixa de estoque antes de cancelar a ordem.' using errcode = 'P0001', hint = 'ordem_com_baixa';
  end if;
  return new;
end;
$$;

create trigger ordens_proteger
  before update on public.ordens_producao
  for each row execute function public.proteger_ordem();

create trigger ordens_updated_at
  before update on public.ordens_producao
  for each row execute function public.definir_updated_at();

alter table public.ordens_producao enable row level security;

create policy ordens_select on public.ordens_producao
  for select to authenticated
  using (empresa_id in (select public.minhas_empresas()));

create policy ordens_insert on public.ordens_producao
  for insert to authenticated
  with check (public.tem_papel(empresa_id, array['dono', 'projetista']::public.papel_membro[]));

create policy ordens_update on public.ordens_producao
  for update to authenticated
  using (public.tem_papel(empresa_id, array['dono', 'projetista', 'producao']::public.papel_membro[]))
  with check (public.tem_papel(empresa_id, array['dono', 'projetista', 'producao']::public.papel_membro[]));

create policy ordens_delete on public.ordens_producao
  for delete to authenticated
  using (public.tem_papel(empresa_id, array['dono']::public.papel_membro[]) and baixa_em is null);

grant select, insert, delete on public.ordens_producao to authenticated;
grant update (status, prazo, observacao) on public.ordens_producao to authenticated;

-- -----------------------------------------------------------------------------
-- Baixa de estoque de uma ordem
--
-- dados.consumo:
--   chapas    [{ "id": uuid, "quantidade": int }]
--   retalhos  [{ "id": uuid, "quantidade": int }]
--   fitas     [{ "id": uuid, "dmm": int }]
--   ferragens [{ "id": uuid, "quantidade": int }]
--   sobras    [{ "material_id": uuid, "comprimento_dmm": int, "largura_dmm": int, "quantidade": int }]
--
-- Devolve { "faltas": [...] } sem baixar nada quando falta estoque e
-- p_forcar é falso; com p_forcar, baixa mesmo assim (o saldo fica negativo e
-- visível). Retalho que não existe mais nunca é forçado: o plano precisa ser refeito.
-- -----------------------------------------------------------------------------
create or replace function public.baixar_estoque_ordem(p_ordem uuid, p_forcar boolean default false, p_guardar_sobras boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o        public.ordens_producao;
  c        jsonb;
  item     jsonb;
  v_saldo  bigint;
  v_qtd    bigint;
  v_nome   text;
  v_id     uuid;
  faltas   jsonb := '[]'::jsonb;
  sobras   jsonb := '[]'::jsonb;
  v_motivo text;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar autenticado.' using errcode = '28000';
  end if;
  select * into o from public.ordens_producao where id = p_ordem for update;
  if o.id is null or not public.tem_papel(o.empresa_id, array['dono', 'projetista', 'producao']::public.papel_membro[]) then
    raise exception 'Ordem não encontrada ou sem permissão.' using errcode = '42501';
  end if;
  if o.baixa_em is not null then
    raise exception 'O estoque desta ordem já foi baixado.' using errcode = 'P0001', hint = 'ordem_ja_baixada';
  end if;
  if o.status = 'cancelada' then
    raise exception 'Ordem cancelada não baixa estoque.' using errcode = 'P0001', hint = 'ordem_cancelada';
  end if;
  c := coalesce(o.dados -> 'consumo', '{}'::jsonb);
  v_motivo := 'Ordem de produção nº ' || o.numero;

  -- 1) Confere tudo antes de mexer (travando os itens, na ordem dos ids, para não haver impasse).
  for item in select * from jsonb_array_elements(coalesce(c -> 'chapas', '[]'::jsonb)) x order by x ->> 'id' loop
    v_qtd := (item ->> 'quantidade')::bigint;
    if v_qtd is null or v_qtd <= 0 then raise exception 'Consumo de chapa inválido.' using errcode = '22023'; end if;
    select m.nome || ' ' || (ch.comprimento_dmm / 10) || ' × ' || (ch.largura_dmm / 10) into v_nome
      from public.chapas ch join public.materiais m on m.id = ch.material_id
     where ch.id = (item ->> 'id')::uuid and ch.empresa_id = o.empresa_id for update of ch;
    if not found then raise exception 'Chapa do plano não existe mais; refaça a ordem.' using errcode = 'P0001', hint = 'item_inexistente'; end if;
    select coalesce(sum(quantidade), 0) into v_saldo from public.estoque_movimentos where chapa_id = (item ->> 'id')::uuid;
    if v_saldo < v_qtd then
      faltas := faltas || jsonb_build_object('tipo', 'chapa', 'nome', v_nome, 'precisa', v_qtd, 'tem', v_saldo);
    end if;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(c -> 'fitas', '[]'::jsonb)) x order by x ->> 'id' loop
    v_qtd := (item ->> 'dmm')::bigint;
    if v_qtd is null or v_qtd <= 0 then raise exception 'Consumo de fita inválido.' using errcode = '22023'; end if;
    select nome into v_nome from public.fitas where id = (item ->> 'id')::uuid and empresa_id = o.empresa_id for update;
    if not found then raise exception 'Fita do plano não existe mais; refaça a ordem.' using errcode = 'P0001', hint = 'item_inexistente'; end if;
    select coalesce(sum(quantidade), 0) into v_saldo from public.estoque_movimentos where fita_id = (item ->> 'id')::uuid;
    if v_saldo < v_qtd then
      faltas := faltas || jsonb_build_object('tipo', 'fita', 'nome', v_nome, 'precisa', v_qtd, 'tem', v_saldo);
    end if;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(c -> 'ferragens', '[]'::jsonb)) x order by x ->> 'id' loop
    v_qtd := (item ->> 'quantidade')::bigint;
    if v_qtd is null or v_qtd <= 0 then raise exception 'Consumo de ferragem inválido.' using errcode = '22023'; end if;
    select nome into v_nome from public.ferragens where id = (item ->> 'id')::uuid and empresa_id = o.empresa_id for update;
    if not found then raise exception 'Ferragem da ordem não existe mais; refaça a ordem.' using errcode = 'P0001', hint = 'item_inexistente'; end if;
    select coalesce(sum(quantidade), 0) into v_saldo from public.estoque_movimentos where ferragem_id = (item ->> 'id')::uuid;
    if v_saldo < v_qtd then
      faltas := faltas || jsonb_build_object('tipo', 'ferragem', 'nome', v_nome, 'precisa', v_qtd, 'tem', v_saldo);
    end if;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(c -> 'retalhos', '[]'::jsonb)) x order by x ->> 'id' loop
    v_qtd := (item ->> 'quantidade')::bigint;
    if v_qtd is null or v_qtd <= 0 then raise exception 'Consumo de retalho inválido.' using errcode = '22023'; end if;
    select quantidade into v_saldo from public.retalhos where id = (item ->> 'id')::uuid and empresa_id = o.empresa_id for update;
    if not found or v_saldo < v_qtd then
      raise exception 'Um retalho usado no plano de corte não está mais no estoque; refaça a ordem a partir do projeto.'
        using errcode = 'P0001', hint = 'retalho_indisponivel';
    end if;
  end loop;

  if jsonb_array_length(faltas) > 0 and not p_forcar then
    return jsonb_build_object('baixado', false, 'faltas', faltas);
  end if;

  -- 2) Baixa.
  for item in select * from jsonb_array_elements(coalesce(c -> 'chapas', '[]'::jsonb)) loop
    insert into public.estoque_movimentos (empresa_id, chapa_id, ordem_id, tipo, quantidade, motivo, criado_por)
    values (o.empresa_id, (item ->> 'id')::uuid, o.id, 'saida', -(item ->> 'quantidade')::bigint, v_motivo, auth.uid());
  end loop;
  for item in select * from jsonb_array_elements(coalesce(c -> 'fitas', '[]'::jsonb)) loop
    insert into public.estoque_movimentos (empresa_id, fita_id, ordem_id, tipo, quantidade, motivo, criado_por)
    values (o.empresa_id, (item ->> 'id')::uuid, o.id, 'saida', -(item ->> 'dmm')::bigint, v_motivo, auth.uid());
  end loop;
  for item in select * from jsonb_array_elements(coalesce(c -> 'ferragens', '[]'::jsonb)) loop
    insert into public.estoque_movimentos (empresa_id, ferragem_id, ordem_id, tipo, quantidade, motivo, criado_por)
    values (o.empresa_id, (item ->> 'id')::uuid, o.id, 'saida', -(item ->> 'quantidade')::bigint, v_motivo, auth.uid());
  end loop;
  for item in select * from jsonb_array_elements(coalesce(c -> 'retalhos', '[]'::jsonb)) loop
    update public.retalhos set quantidade = quantidade - (item ->> 'quantidade')::int where id = (item ->> 'id')::uuid;
  end loop;

  if p_guardar_sobras then
    for item in select * from jsonb_array_elements(coalesce(c -> 'sobras', '[]'::jsonb)) loop
      insert into public.retalhos (empresa_id, material_id, comprimento_dmm, largura_dmm, quantidade, observacoes)
      values (o.empresa_id, (item ->> 'material_id')::uuid, (item ->> 'comprimento_dmm')::int, (item ->> 'largura_dmm')::int,
              coalesce((item ->> 'quantidade')::int, 1), 'Sobra da ordem nº ' || o.numero)
      returning id into v_id;
      sobras := sobras || jsonb_build_object('id', v_id, 'quantidade', coalesce((item ->> 'quantidade')::int, 1));
    end loop;
  end if;

  perform set_config('marcenaria.baixa', 'sim', true);
  update public.ordens_producao set baixa_em = now(), baixa_por = auth.uid(), sobras_criadas = sobras where id = o.id;
  perform set_config('marcenaria.baixa', '', true);

  return jsonb_build_object('baixado', true, 'faltas', faltas, 'sobras_guardadas', jsonb_array_length(sobras));
end;
$$;

-- Estorno: devolve o que a baixa tirou e retira as sobras que ela guardou
-- (as que ainda existirem; sobra já usada em outro corte fica como está).
create or replace function public.estornar_baixa_ordem(p_ordem uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o    public.ordens_producao;
  item jsonb;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar autenticado.' using errcode = '28000';
  end if;
  select * into o from public.ordens_producao where id = p_ordem for update;
  if o.id is null or not public.tem_papel(o.empresa_id, array['dono', 'projetista']::public.papel_membro[]) then
    raise exception 'Ordem não encontrada ou sem permissão.' using errcode = '42501';
  end if;
  if o.baixa_em is null then
    raise exception 'Esta ordem não tem baixa de estoque para estornar.' using errcode = 'P0001', hint = 'ordem_sem_baixa';
  end if;

  insert into public.estoque_movimentos (empresa_id, chapa_id, fita_id, ferragem_id, ordem_id, tipo, quantidade, motivo, criado_por)
  select empresa_id, chapa_id, fita_id, ferragem_id, ordem_id, 'entrada', -sum(quantidade), 'Estorno da ordem de produção nº ' || o.numero, auth.uid()
    from public.estoque_movimentos
   where ordem_id = o.id
   group by empresa_id, chapa_id, fita_id, ferragem_id, ordem_id
  having sum(quantidade) <> 0;

  for item in select * from jsonb_array_elements(coalesce(o.dados -> 'consumo' -> 'retalhos', '[]'::jsonb)) loop
    update public.retalhos set quantidade = quantidade + (item ->> 'quantidade')::int
     where id = (item ->> 'id')::uuid and empresa_id = o.empresa_id;
  end loop;
  for item in select * from jsonb_array_elements(o.sobras_criadas) loop
    update public.retalhos set quantidade = greatest(0, quantidade - (item ->> 'quantidade')::int)
     where id = (item ->> 'id')::uuid and empresa_id = o.empresa_id;
  end loop;
  delete from public.retalhos r
   where r.empresa_id = o.empresa_id and r.quantidade = 0
     and r.id in (select (x ->> 'id')::uuid from jsonb_array_elements(o.sobras_criadas) x);

  perform set_config('marcenaria.baixa', 'sim', true);
  update public.ordens_producao set baixa_em = null, baixa_por = null, sobras_criadas = '[]'::jsonb where id = o.id;
  perform set_config('marcenaria.baixa', '', true);
end;
$$;

revoke execute on function
  public.definir_estoque_ferragem(uuid, bigint, text),
  public.baixar_estoque_ordem(uuid, boolean, boolean),
  public.estornar_baixa_ordem(uuid),
  public.numerar_ordem(),
  public.proteger_ordem()
  from public, anon, authenticated;

grant execute on function public.definir_estoque_ferragem(uuid, bigint, text) to authenticated;
grant execute on function public.baixar_estoque_ordem(uuid, boolean, boolean) to authenticated;
grant execute on function public.estornar_baixa_ordem(uuid) to authenticated;
