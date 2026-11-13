import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessaoTeste, type Usuario } from '../src/sessao';

/** Arquivos 3D do "ver no ambiente": cada marcenaria só grava na própria pasta; ninguém lista pela API. */

let s: SessaoTeste;
let ana: Usuario; // dona da A
let rita: Usuario; // produção da A
let bruno: Usuario; // dono da B
let empresaA: string;
let empresaB: string;

const gravar = (ator: Usuario | 'anon', nome: string) => s.como(ator, `insert into storage.objects (bucket_id, name) values ('ar', $1)`, [nome]);
const ler = async (ator: Usuario | 'anon') => (await s.como<{ name: string }>(ator, `select name from storage.objects where bucket_id = 'ar' order by name`)).ok;
const nomes = async (ator: Usuario) => (await s.exigir<{ name: string }>(ator, `select name from storage.objects where bucket_id = 'ar' order by name`)).map((l) => l.name);

beforeAll(async () => {
  s = await SessaoTeste.abrir();
  ana = await s.criarUsuario('ana@a.test', 'Ana');
  bruno = await s.criarUsuario('bruno@b.test', 'Bruno');
  empresaA = (await s.exigir<{ id: string }>(ana, `select public.criar_empresa('Marcenaria A') as id`))[0]!.id;
  empresaB = (await s.exigir<{ id: string }>(bruno, `select public.criar_empresa('Marcenaria B') as id`))[0]!.id;
  rita = await s.criarUsuario('rita@a.test', 'Rita');
  await s.lerDireto(`insert into public.membros_empresa (empresa_id, usuario_id, papel) values ($1, $2, 'producao')`, [empresaA, rita.id]);
});
afterAll(async () => {
  await s?.fechar();
});

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

describe('arquivos 3D do ver no ambiente', () => {
  it('balde público (acesso só por endereço), GLB, USDZ e a cena dos óculos (JSON), de até 5 MB', async () => {
    const b = (await s.lerDireto<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'ar'`))[0]!;
    expect(b.public).toBe(true);
    expect(Number(b.file_size_limit)).toBe(5 * 1024 * 1024);
    expect(b.allowed_mime_types).toEqual(['model/gltf-binary', 'model/vnd.usdz+zip', 'application/json']);
  });

  it('membros gravam só na pasta da própria marcenaria, com nome sorteado e extensão certa', async () => {
    expect((await gravar(ana, `${empresaA}/${ID1}.glb`)).ok).toBe(true);
    expect((await gravar(ana, `${empresaA}/${ID1}.usdz`)).ok).toBe(true);
    expect((await gravar(rita, `${empresaA}/${ID2}.glb`)).ok).toBe(true);
    // Cena para os óculos (migration ver_em_oculos).
    expect((await gravar(ana, `${empresaA}/${ID1}.json`)).ok).toBe(true);
    expect((await gravar(ana, `${empresaB}/${ID2}.json`)).ok).toBe(false);
    expect((await gravar(ana, `${empresaA}/${ID2}.js`)).ok).toBe(false);
    // Pasta de outra marcenaria, nome livre, outra extensão, fora de pasta, subpasta.
    expect((await gravar(ana, `${empresaB}/${ID1}.glb`)).ok).toBe(false);
    expect((await gravar(ana, `${empresaA}/qualquer.glb`)).ok).toBe(false);
    expect((await gravar(ana, `${empresaA}/${ID2}.html`)).ok).toBe(false);
    expect((await gravar(ana, `${ID2}.glb`)).ok).toBe(false);
    expect((await gravar(ana, `${empresaA}/sub/${ID2}.glb`)).ok).toBe(false);
    expect((await gravar(bruno, `${empresaA}/${ID2}.usdz`)).ok).toBe(false);
  });

  it('ninguém lista os arquivos pela API, nem a própria equipe', async () => {
    expect(await nomes(ana)).toEqual([]);
    expect(await nomes(bruno)).toEqual([]);
    const anon = await s.como<{ name: string }>('anon', `select name from storage.objects where bucket_id = 'ar'`);
    expect(anon.ok ? anon.rows.length : 0).toBe(0);
    expect(typeof (await ler('anon'))).toBe('boolean');
  });

  it('visitante anônimo não grava; ninguém altera arquivo já enviado', async () => {
    expect((await gravar('anon', `${empresaA}/${ID2}.usdz`)).ok).toBe(false);
    const trocar = await s.como(ana, `update storage.objects set name = $2 where bucket_id = 'ar' and name = $1`, [`${empresaA}/${ID1}.glb`, `${empresaB}/${ID1}.glb`]);
    expect(trocar.ok ? trocar.rowCount : 0).toBe(0);
  });

  it('quem sai da marcenaria não grava mais na pasta', async () => {
    await s.lerDireto(`delete from public.membros_empresa where empresa_id = $1 and usuario_id = $2`, [empresaA, rita.id]);
    expect((await gravar(rita, `${empresaA}/${ID2}.usdz`)).ok).toBe(false);
  });

  it('a migration cria as duas políticas e nenhuma de leitura pública', async () => {
    const p = await s.lerDireto<{ policyname: string; cmd: string }>(`select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname`);
    expect(p).toEqual([
      { policyname: 'ar_delete', cmd: 'DELETE' },
      { policyname: 'ar_insert', cmd: 'INSERT' },
      // Manual de montagem publicado (migration etiquetas_oficina): o mesmo esquema.
      { policyname: 'manuais_delete', cmd: 'DELETE' },
      { policyname: 'manuais_insert', cmd: 'INSERT' },
      // Fotos da medição (migration medicao_local): balde privado, com leitura só para a equipe.
      { policyname: 'medicoes_fotos_delete', cmd: 'DELETE' },
      { policyname: 'medicoes_fotos_insert', cmd: 'INSERT' },
      { policyname: 'medicoes_fotos_select', cmd: 'SELECT' },
    ]);
  });
});
