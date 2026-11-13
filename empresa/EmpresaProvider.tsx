import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import type { Empresa, Papel, Vinculo } from '../lib/tipos';

interface EstadoEmpresa {
  carregando: boolean;
  erro: unknown;
  vinculos: Vinculo[];
  atual: Empresa | null;
  papel: Papel | null;
  trocar: (empresaId: string) => void;
  recarregar: () => Promise<void>;
}

const ContextoEmpresa = createContext<EstadoEmpresa | null>(null);

const chaveArmazenada = (usuarioId: string) => `marcenaria:empresa:${usuarioId}`;

function lerEscolha(usuarioId: string): string | null {
  try {
    return localStorage.getItem(chaveArmazenada(usuarioId));
  } catch {
    return null;
  }
}

function gravarEscolha(usuarioId: string, empresaId: string): void {
  try {
    localStorage.setItem(chaveArmazenada(usuarioId), empresaId);
  } catch {
    // Armazenamento indisponível (aba anônima, bloqueio): a escolha vale só nesta sessão.
  }
}

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const usuarioId = usuario?.id ?? null;
  const [escolhida, setEscolhida] = useState<string | null>(null);

  useEffect(() => {
    setEscolhida(usuarioId ? lerEscolha(usuarioId) : null);
  }, [usuarioId]);

  const consulta = useQuery({
    queryKey: ['vinculos', usuarioId],
    enabled: usuarioId !== null,
    queryFn: async (): Promise<Vinculo[]> => {
      const { data, error } = await supabase
        .from('membros_empresa')
        .select('papel, empresa:empresas(id, nome, cnpj)')
        .eq('usuario_id', usuarioId!);
      if (error) throw error;
      const vinculos = (data ?? []) as unknown as Vinculo[];
      return vinculos
        .filter((v) => v.empresa !== null)
        .sort((a, b) => a.empresa.nome.localeCompare(b.empresa.nome, 'pt-BR'));
    },
  });

  const vinculos = useMemo(() => consulta.data ?? [], [consulta.data]);
  const vinculoAtual = vinculos.find((v) => v.empresa.id === escolhida) ?? vinculos[0] ?? null;

  const trocar = useCallback(
    (empresaId: string) => {
      if (!usuarioId) return;
      gravarEscolha(usuarioId, empresaId);
      setEscolhida(empresaId);
      // Dados de outra empresa nunca podem aparecer na tela da nova.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'vinculos' });
    },
    [usuarioId, queryClient],
  );

  const recarregar = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['vinculos'] });
  }, [queryClient]);

  const valor = useMemo<EstadoEmpresa>(
    () => ({
      carregando: usuarioId !== null && consulta.isPending,
      erro: consulta.error,
      vinculos,
      atual: vinculoAtual?.empresa ?? null,
      papel: vinculoAtual?.papel ?? null,
      trocar,
      recarregar,
    }),
    [usuarioId, consulta.isPending, consulta.error, vinculos, vinculoAtual, trocar, recarregar],
  );

  return <ContextoEmpresa.Provider value={valor}>{children}</ContextoEmpresa.Provider>;
}

export function useEmpresa(): EstadoEmpresa {
  const ctx = useContext(ContextoEmpresa);
  if (!ctx) throw new Error('useEmpresa precisa estar dentro de <EmpresaProvider>.');
  return ctx;
}

/** Empresa e papel garantidos (use só dentro de rotas protegidas por <RequerEmpresa>). */
export function useEmpresaAtual(): { empresa: Empresa; papel: Papel; vinculos: Vinculo[] } {
  const { atual, papel, vinculos } = useEmpresa();
  if (!atual || !papel) throw new Error('Nenhuma empresa selecionada.');
  return { empresa: atual, papel, vinculos };
}
