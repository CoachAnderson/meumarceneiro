-- =============================================================================
-- Ver no ambiente: arquivos 3D do móvel (GLB e USDZ) para abrir na câmera do
-- celular.
--
-- Ficam num balde público do Supabase Storage. O endereço de cada arquivo tem
-- um identificador sorteado (impossível de adivinhar); quem recebe o link vê
-- só aquele móvel, sem login. O arquivo traz apenas a forma do móvel: nenhum
-- dado de cliente, preço ou nome.
--
-- Quem grava: membros da empresa, só na pasta da própria empresa.
-- Quem apaga: o dono. Ninguém lista os arquivos pela API (não há política de
-- leitura); o acesso é só pelo endereço público de cada arquivo.
-- =============================================================================

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Supabase Storage não encontrado: balde "ar" não criado (ambiente de teste).';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('ar', 'ar', true, 5242880, array['model/gltf-binary', 'model/vnd.usdz+zip'])
  on conflict (id) do update
    set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy ar_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'ar'
        and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(glb|usdz)$'
        and (storage.foldername(name))[1] in (select e::text from public.minhas_empresas() e)
      )
  $p$;

  execute $p$
    create policy ar_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'ar'
        and (storage.foldername(name))[1] in (
          select m.empresa_id::text from public.membros_empresa m where m.usuario_id = auth.uid() and m.papel = 'dono'
        )
      )
  $p$;
end $$;
