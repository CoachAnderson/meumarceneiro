import { describe, expect, it } from 'vitest';
import { cabecalhosServico, chavesSupabase, ehChaveJwt } from '../../../supabase/functions/_shared/chaves';

/** Chaves do Supabase nas funções: novas (publishable/secret) e antigas (anon/service_role). */

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.assinatura_abc-123';
const env = (valores: Record<string, string>) => (nome: string) => valores[nome] ?? '';

describe('chavesSupabase', () => {
  it('usa as chaves novas quando existem (a "default" do JSON)', () => {
    expect(
      chavesSupabase(
        env({
          SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_1"}',
          SUPABASE_SECRET_KEYS: '{"cobranca":"sb_secret_2","default":"sb_secret_1"}',
          SUPABASE_ANON_KEY: 'antiga',
          SUPABASE_SERVICE_ROLE_KEY: JWT,
        }),
      ),
    ).toEqual({ publica: 'sb_publishable_1', servico: 'sb_secret_1' });
  });

  it('sem "default", usa a primeira; JSON quebrado ou vazio cai nas antigas', () => {
    expect(chavesSupabase(env({ SUPABASE_SECRET_KEYS: '{"principal":"sb_secret_9"}' })).servico).toBe('sb_secret_9');
    expect(chavesSupabase(env({ SUPABASE_SECRET_KEYS: '{quebrado', SUPABASE_SERVICE_ROLE_KEY: JWT })).servico).toBe(JWT);
    expect(chavesSupabase(env({ SUPABASE_PUBLISHABLE_KEYS: '[]', SUPABASE_ANON_KEY: 'anon' })).publica).toBe('anon');
    expect(chavesSupabase(env({}))).toEqual({ publica: '', servico: '' });
  });
});

describe('cabecalhosServico', () => {
  it('chave nova vai só em apikey; a antiga (JWT) também em Authorization', () => {
    expect(cabecalhosServico('sb_secret_1')).toEqual({ 'content-type': 'application/json', apikey: 'sb_secret_1' });
    expect(cabecalhosServico(JWT)).toEqual({ 'content-type': 'application/json', apikey: JWT, authorization: `Bearer ${JWT}` });
    expect([ehChaveJwt(JWT), ehChaveJwt('sb_secret_1'), ehChaveJwt('a.b.c')]).toEqual([true, false, false]);
  });
});
