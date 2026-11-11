import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface EstadoAuth {
  carregando: boolean;
  sessao: Session | null;
  usuario: User | null;
  /** Verdadeiro quando o usuário chegou pelo link de recuperação de senha. */
  recuperandoSenha: boolean;
  concluirRecuperacao: () => void;
  sair: () => Promise<void>;
}

const ContextoAuth = createContext<EstadoAuth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState<Session | null>(null);
  const [recuperandoSenha, setRecuperandoSenha] = useState(false);

  useEffect(() => {
    let ativo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setSessao(data.session);
      setCarregando(false);
    });

    const { data } = supabase.auth.onAuthStateChange((evento, novaSessao) => {
      setSessao(novaSessao);
      if (evento === 'PASSWORD_RECOVERY') setRecuperandoSenha(true);
      if (evento === 'SIGNED_OUT') setRecuperandoSenha(false);
    });

    return () => {
      ativo = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const valor = useMemo<EstadoAuth>(
    () => ({
      carregando,
      sessao,
      usuario: sessao?.user ?? null,
      recuperandoSenha,
      concluirRecuperacao: () => setRecuperandoSenha(false),
      sair: async () => {
        await supabase.auth.signOut();
      },
    }),
    [carregando, sessao, recuperandoSenha],
  );

  return <ContextoAuth.Provider value={valor}>{children}</ContextoAuth.Provider>;
}

export function useAuth(): EstadoAuth {
  const ctx = useContext(ContextoAuth);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return ctx;
}
