-- =============================================================================
-- Aceite dos Termos de Uso e da Política de Privacidade.
--
-- A tela de cadastro envia a versão dos documentos que a pessoa aceitou; o
-- banco grava a versão e a hora (do servidor). A API não altera estas colunas.
-- =============================================================================

alter table public.usuarios
  add column termos_versao text check (termos_versao is null or termos_versao ~ '^\d{4}-\d{2}-\d{2}$'),
  add column termos_aceitos_em timestamptz;

create or replace function public.criar_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_versao text := new.raw_user_meta_data ->> 'termos_versao';
begin
  if v_versao is null or v_versao !~ '^\d{4}-\d{2}-\d{2}$' then
    v_versao := null;
  end if;
  insert into public.usuarios (id, email, nome, termos_versao, termos_aceitos_em)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    left(btrim(coalesce(new.raw_user_meta_data ->> 'nome', '')), 120),
    v_versao,
    case when v_versao is not null then now() end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.criar_perfil_usuario() from public, anon, authenticated;
