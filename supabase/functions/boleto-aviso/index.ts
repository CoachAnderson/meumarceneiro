// Aviso de pagamento de boleto, vindo do Mercado Pago da marcenaria (Deno).
//
// Pública (o Mercado Pago não manda login). Não confia no conteúdo do aviso:
// ele só diz "olhe a order X da empresa Y". A função consulta a order no
// Mercado Pago com a chave da própria marcenaria e só dá baixa se a order é
// de uma conta a receber daquela empresa e está paga. Aviso falso não muda nada.
//
// Endereço para colar no Mercado Pago da marcenaria (Suas integrações →
// Webhooks → evento Order):  <SUPABASE_URL>/functions/v1/boleto-aviso?empresa=<id da empresa>
import { chavesSupabase } from '../_shared/chaves.ts';
import { tratarAvisoBoleto } from '../cobranca/aviso.ts';

const env = (nome: string) => Deno.env.get(nome) ?? '';
const chaves = chavesSupabase(env);

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req: Request) => {
  const corpo = await req.json().catch(() => null);
  const saida = tratarAvisoBoleto(
    { metodo: req.method, url: req.url, corpo },
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
  // Responde logo (o Mercado Pago espera até 22 s) e consulta em seguida.
  if (saida.depois) {
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(saida.depois);
    else await saida.depois;
  }
  return new Response(null, { status: saida.status });
});
