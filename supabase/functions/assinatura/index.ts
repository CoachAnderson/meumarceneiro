// Assinatura do sistema — entrada da função no Supabase (Deno).
// A lógica está em tratar.ts; aqui ficam só o servidor, o CORS e os segredos.
//
// Segredos (supabase secrets set ...):
//   MP_ACCESS_TOKEN  credencial privada do Mercado Pago (Access Token da sua aplicação)
//   APP_URL          endereço público do site, com https (para a volta do pagamento e o CORS)
// SUPABASE_URL e as chaves do projeto (novas ou antigas) já existem em toda função: veja _shared/chaves.ts.
import { chavesSupabase } from '../_shared/chaves.ts';
import { cabecalhosCors, responder } from '../_shared/http.ts';
import ofertas from './oferta.ts';
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
          credencialMP: env('MP_ACCESS_TOKEN'),
          appUrl: env('APP_URL'),
          offerCatalog: ofertas,
        },
      );
    },
    (m) => console.error(`[assinatura] ${m}`),
  );
});
