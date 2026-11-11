// Assinatura do sistema — entrada da função no Supabase (Deno).
// A lógica está em tratar.ts; aqui ficam só o servidor, o CORS e os segredos.
//
// Segredos (supabase secrets set ...):
//   MP_ACCESS_TOKEN  credencial privada do Mercado Pago (Access Token da sua aplicação)
//   APP_URL          endereço público do site, com https (para a volta do pagamento e o CORS)
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já existem em toda função.
import ofertas from './oferta.json' with { type: 'json' };
import { tratar } from './tratar.ts';

const env = (nome: string) => Deno.env.get(nome) ?? '';

const cors = {
  'Access-Control-Allow-Origin': env('APP_URL') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const corpo = await req.json().catch(() => null);
  const saida = await tratar(
    { metodo: req.method, autorizacao: req.headers.get('authorization'), corpo },
    {
      buscar: (url, init) => fetch(url, init),
      supabaseUrl: env('SUPABASE_URL'),
      anonKey: env('SUPABASE_ANON_KEY'),
      chaveServico: env('SUPABASE_SERVICE_ROLE_KEY'),
      credencialMP: env('MP_ACCESS_TOKEN'),
      appUrl: env('APP_URL'),
      offerCatalog: ofertas,
    },
  );
  return new Response(JSON.stringify(saida.corpo), { status: saida.status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' } });
});
