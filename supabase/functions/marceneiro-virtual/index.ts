// Marceneiro virtual — entrada da função no Supabase (Deno).
// A lógica está em tratar.ts; as regras da conversa em ficha.ts (cópia gerada do motor).
//
// Esta função aceita chamadas sem login (o cliente abre o link do móvel). Por
// isso o banco controla tudo: validade do link, limite de perguntas, ritmo e
// cota mensal da empresa. Veja supabase/config.toml (verify_jwt = false).
//
// Segredos (supabase secrets set ...):
//   ANTHROPIC_API_KEY   chave da API da IA (a mesma da Visão IA)
//   APP_URL             endereço do site, para o CORS (já usado pela assinatura)
//   MARCENEIRO_MODELO   modelo da conversa (opcional; padrão abaixo)
// SUPABASE_URL e as chaves do projeto (novas ou antigas) já existem em toda função: veja _shared/chaves.ts.
import { chavesSupabase } from '../_shared/chaves.ts';
import { cabecalhosCors, responder } from '../_shared/http.ts';
import * as regras from './ficha.ts';
import { tratar } from './tratar.ts';

const env = (nome: string) => Deno.env.get(nome) ?? '';
const chaves = chavesSupabase(env);

Deno.serve(async (req: Request) => {
  const cors = cabecalhosCors(env('APP_URL'), req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  return responder(
    cors,
    async () => {
      const corpo = await req.json().catch(() => null);
      return tratar(
        { metodo: req.method, autorizacao: req.headers.get('authorization'), corpo },
        {
          buscar: (url, init) => fetch(url, init),
          supabaseUrl: env('SUPABASE_URL'),
          anonKey: chaves.publica,
          chaveServico: chaves.servico,
          chaveIA: env('ANTHROPIC_API_KEY'),
          modelo: env('MARCENEIRO_MODELO') || 'claude-haiku-5-5',
          regras,
        },
      );
    },
    (m) => console.error(`[marceneiro-virtual] ${m}`),
  );
});
