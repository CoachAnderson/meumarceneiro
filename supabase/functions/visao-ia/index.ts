// Visão Inteligente IA — entrada da função no Supabase (Deno).
// A lógica está em tratar.ts; aqui ficam só o servidor, o CORS e os segredos.
//
// Segredos (supabase secrets set ...):
//   ANTHROPIC_API_KEY  chave da API da IA (obrigatória)
//   VISAO_MODELO       modelo de visão (opcional; padrão abaixo)
//   VISAO_ORIGEM       endereço do site, para o CORS (opcional; vários separados por vírgula)
import { chavesSupabase } from '../_shared/chaves.ts';
import { cabecalhosCors, responder } from '../_shared/http.ts';
import ferramenta from './ferramenta.ts';
import { tratar } from './tratar.ts';

const env = (nome: string) => Deno.env.get(nome) ?? '';
const chaves = chavesSupabase(env);

Deno.serve(async (req: Request) => {
  const cors = cabecalhosCors(env('VISAO_ORIGEM'), req.headers.get('origin'));
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
          chaveIA: env('ANTHROPIC_API_KEY'),
          modelo: env('VISAO_MODELO') || 'claude-sonnet-5-5',
          ferramenta: ferramenta.ferramenta,
          instrucoes: ferramenta.instrucoes,
        },
      );
    },
    (m) => console.error(`[visao-ia] ${m}`),
  );
});
