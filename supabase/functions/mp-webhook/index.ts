import { chavesSupabase } from '../_shared/chaves.ts';
// Avisos do Mercado Pago — entrada da função no Supabase (Deno).
// Esta função é pública (o Mercado Pago não manda login): quem garante a
// origem é a assinatura do aviso, conferida em tratar.ts.
//
// Segredos (supabase secrets set ...):
//   MP_ACCESS_TOKEN    credencial privada do Mercado Pago
//   MP_WEBHOOK_SECRET  segredo da assinatura dos avisos (Suas integrações → Webhooks)
import { tratarAviso } from './tratar.ts';

const env = (nome: string) => Deno.env.get(nome) ?? '';
const chaves = chavesSupabase(env);

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req: Request) => {
  const corpo = await req.json().catch(() => null);
  const saida = await tratarAviso(
    { metodo: req.method, url: req.url, assinatura: req.headers.get('x-signature'), requestId: req.headers.get('x-request-id'), corpo },
    {
      buscar: (url, init) => fetch(url, init),
      supabaseUrl: env('SUPABASE_URL'),
      chaveServico: chaves.servico,
      credencialMP: env('MP_ACCESS_TOKEN'),
      segredo: env('MP_WEBHOOK_SECRET'),
      registrar: (mensagem) => console.warn(`[mp-webhook] ${mensagem}`),
    },
  );
  // Mantém a função viva até o processamento terminar, já com o 200 enviado.
  if (saida.depois) {
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(saida.depois);
    else await saida.depois;
  }
  return new Response(null, { status: saida.status });
});
