-- =============================================================================
-- Ver em óculos: além do GLB e do USDZ, o link do "ver no ambiente" passa a ter
-- a cena do móvel para óculos de realidade virtual e mista (<id>.json): as
-- peças, o que abre (portas e gavetas) e, se a marcenaria escolher, o cômodo da
-- medição (largura e altura da parede, ângulo dos cantos e posição de janelas,
-- tomadas e outros pontos).
--
-- A cena leva só geometria: nenhum nome de cliente, de ambiente, observação ou
-- foto. Fica no mesmo balde público, com o mesmo endereço sorteado.
-- =============================================================================

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Supabase Storage não encontrado: balde "ar" não alterado (ambiente de teste).';
    return;
  end if;

  update storage.buckets
     set allowed_mime_types = array['model/gltf-binary', 'model/vnd.usdz+zip', 'application/json']
   where id = 'ar';

  execute 'drop policy if exists ar_insert on storage.objects';
  execute $p$
    create policy ar_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'ar'
        and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(glb|usdz|json)$'
        and (storage.foldername(name))[1] in (select e::text from public.minhas_empresas() e)
      )
  $p$;
end $$;
