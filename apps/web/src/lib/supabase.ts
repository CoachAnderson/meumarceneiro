import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Falta de configuração vira uma tela explicativa, não uma página em branco. */
export const configuracaoAusente: string | null =
  !url || !chave
    ? 'Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em apps/web/.env.local (veja .env.example).'
    : null;

export const supabase = createClient(url ?? 'http://localhost', chave ?? 'ausente', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
