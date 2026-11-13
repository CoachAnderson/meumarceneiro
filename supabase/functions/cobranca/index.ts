// Cobrança da marcenaria (boleto e nota fiscal) — entrada da função no Supabase (Deno).
// A lógica está em tratar.ts e montar.ts; aqui ficam só o servidor, o CORS e os segredos.
//
// Segredos (supabase secrets set ...):
//   INTEGRACOES_CHAVE  32 bytes em base64 (openssl rand -base64 32): cifra as chaves das marcenarias
//   APP_URL            endereço público do site, com https (CORS)
// As chaves do Mercado Pago e da Focus NFe são de cada marcenaria: ficam cifradas no banco.
import { chavesSupabase } from '../_shared/chaves.ts';
import { cabecalhosCors, responder } from '../_shared/http.ts';
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
          chaveCofre: env('INTEGRACOES_CHAVE'),
          agora: () => new Date(),
          novoId: () => crypto.randomUUID(),
        },
      );
    },
    (m) => console.error(`[cobranca] ${m}`),
  );
});
