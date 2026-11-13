-- =============================================================================
-- Boleto (Mercado Pago da marcenaria) e nota fiscal (Focus NFe da marcenaria).
--
-- Cada marcenaria contrata o próprio serviço e cola a chave no sistema. A
-- chave vai cifrada pelo servidor (função cobranca, segredo INTEGRACOES_CHAVE)
-- e nunca volta para o navegador: a coluna `segredo` não tem leitura pela
-- API. Quem grava integração, boleto e nota é só a função do servidor.
--
-- Também: endereço completo do cliente (o boleto e a nota exigem).
-- =============================================================================

-- Endereço em partes (o campo `endereco` livre continua para quem já usa).
alter table public.clientes
  add column cep            text check (cep is null or cep ~ '^[0-9]{8}$'),
  add column logradouro     text check (logradouro is null or char_length(logradouro) <= 120),
  add column numero         text check (numero is null or char_length(numero) <= 20),
  add column complemento    text check (complemento is null or char_length(complemento) <= 60),
  add column bairro         text check (bairro is null or char_length(bairro) <= 60),
  add column cidade         text check (cidade is null or char_length(cidade) <= 60),
  add column uf             text check (uf is null or uf ~ '^[A-Z]{2}$'),
  -- Código IBGE do município (7 dígitos): a NFS-e pede.
  add column codigo_municipio text check (codigo_municipio is null or codigo_municipio ~ '^[0-9]{7}$'),
  add column inscricao_estadual text check (inscricao_estadual is null or inscricao_estadual ~ '^([0-9]{2,14}|ISENTO)$');

grant insert (cep, logradouro, numero, complemento, bairro, cidade, uf, codigo_municipio, inscricao_estadual) on public.clientes to authenticated;
grant update (cep, logradouro, numero, complemento, bairro, cidade, uf, codigo_municipio, inscricao_estadual) on public.clientes to authenticated;

create type public.provedor_integracao as enum ('mercado_pago', 'focus_nfe');
create type public.ambiente_integracao as enum ('teste', 'producao');

create table public.integracoes (
  empresa_id   uuid not null references public.empresas (id) on delete cascade,
  provedor     public.provedor_integracao not null,
  ambiente     public.ambiente_integracao not null,
  -- Chave cifrada (AES-GCM) pelo servidor. Sem leitura pela API.
  segredo      text not null check (char_length(segredo) between 20 and 4096),
  -- Só os 4 últimos caracteres, para a tela mostrar qual chave está salva.
  final        text not null check (char_length(final) <= 8),
  -- Configuração sem segredo: conta da baixa automática, dados fiscais padrão.
  dados        jsonb not null default '{}' check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 16384),
  atualizado_por uuid references public.usuarios (id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (empresa_id, provedor)
);

alter table public.integracoes enable row level security;
create policy integracoes_dono on public.integracoes for select to authenticated
  using (public.tem_papel(empresa_id, array['dono']::public.papel_membro[]));
revoke all on public.integracoes from anon, authenticated;
-- A coluna segredo fica de fora.
grant select (empresa_id, provedor, ambiente, final, dados, updated_at) on public.integracoes to authenticated;

create type public.tipo_nota as enum ('nfe', 'nfse');

create table public.notas_fiscais (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas (id) on delete cascade,
  tipo          public.tipo_nota not null,
  ambiente      public.ambiente_integracao not null,
  -- Referência enviada à Focus NFe (única por empresa).
  ref           text not null check (ref ~ '^[A-Za-z0-9_-]{1,50}$'),
  orcamento_id  uuid,
  cliente_id    uuid,
  valor_centavos bigint not null check (valor_centavos between 1 and 10000000000),
  -- processando_autorizacao, autorizado, erro_autorizacao, cancelado, denegado… (como a Focus devolve)
  status        text not null check (char_length(status) between 1 and 40),
  numero        text check (numero is null or char_length(numero) <= 20),
  serie         text check (serie is null or char_length(serie) <= 10),
  chave         text check (chave is null or char_length(chave) <= 60),
  url_pdf       text check (url_pdf is null or url_pdf ~ '^https://'),
  url_xml       text check (url_xml is null or url_xml ~ '^https://'),
  mensagem      text check (mensagem is null or char_length(mensagem) <= 2000),
  -- O que foi enviado (para conferir depois).
  envio         jsonb not null check (jsonb_typeof(envio) = 'object' and pg_column_size(envio) <= 65536),
  criado_por    uuid references public.usuarios (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (empresa_id, ref),
  foreign key (empresa_id, orcamento_id) references public.orcamentos (empresa_id, id) on delete set null (orcamento_id),
  foreign key (empresa_id, cliente_id) references public.clientes (empresa_id, id) on delete set null (cliente_id)
);

create index notas_fiscais_empresa_idx on public.notas_fiscais (empresa_id, created_at desc);
create index notas_fiscais_orcamento_idx on public.notas_fiscais (orcamento_id) where orcamento_id is not null;

create trigger notas_fiscais_updated_at before update on public.notas_fiscais
  for each row execute function public.definir_updated_at();

alter table public.notas_fiscais enable row level security;
create policy notas_fiscais_dono on public.notas_fiscais for select to authenticated
  using (public.tem_papel(empresa_id, array['dono']::public.papel_membro[]));
revoke all on public.notas_fiscais from anon, authenticated;
grant select on public.notas_fiscais to authenticated;

-- A função cobranca pergunta, com o login de quem chama: é o dono e a
-- assinatura está ativa? (Gravações do servidor não passam pela trava.)
create or replace function public.pode_cobrar(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.tem_papel(p_empresa, array['dono']::public.papel_membro[]) and public.empresa_liberada(p_empresa);
$$;

revoke execute on function public.pode_cobrar(uuid) from public, anon;
grant execute on function public.pode_cobrar(uuid) to authenticated;

-- Só o servidor grava nestas tabelas (a trava não age para ele), mas a trava fica
-- aqui também: se um dia alguém liberar escrita pela API, a assinatura vencida já bloqueia.
create trigger exigir_assinatura before insert or update on public.integracoes
  for each row execute function public.exigir_assinatura();
create trigger exigir_assinatura before insert or update on public.notas_fiscais
  for each row execute function public.exigir_assinatura();
