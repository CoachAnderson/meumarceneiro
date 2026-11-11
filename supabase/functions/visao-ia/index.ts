// Visão Inteligente IA — entrada da função no Supabase (Deno).
// A lógica está em tratar.ts; aqui ficam só o servidor, o CORS e os segredos.
//
// Segredos (supabase secrets set ...):
//   ANTHROPIC_API_KEY  chave da API da IA (obrigatória)
//   VISAO_MODELO       modelo de visão (opcional; padrão abaixo)
//   VISAO_ORIGEM       endereço do site, para o CORS (opcional; padrão: qualquer origem)
import ferramenta from './ferramenta.json' with { type: 'json' };
import { tratar } from './tratar.ts';

const env = (nome: string) => Deno.env.get(nome) ?? '';

const cors = {
  'Access-Control-Allow-Origin': env('VISAO_ORIGEM') || '*',
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
      chaveIA: env('ANTHROPIC_API_KEY'),
      modelo: env('VISAO_MODELO') || 'claude-sonnet-5-5',
      ferramenta: ferramenta.ferramenta,
      instrucoes: ferramenta.instrucoes,
    },
  );
  return new Response(JSON.stringify(saida.corpo), { status: saida.status, headers: { ...cors, 'content-type': 'application/json' } });
});
