import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Titulo } from '../components/ui';
import { buscarFitas, buscarMateriais, chaves, podeEditarCatalogo } from '../lib/catalogo';
import { mensagemDeErro } from '../lib/erros';
import { supabase } from '../lib/supabase';
import { NOME_PAPEL } from '../lib/tipos';

async function contar(tabela: 'clientes' | 'membros_empresa', empresaId: string): Promise<number> {
  const { count, error } = await supabase
    .from(tabela)
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresaId);
  if (error) throw error;
  return count ?? 0;
}

function Bloco({ para, titulo, valor, acao }: { para: string; titulo: string; valor: number | undefined; acao: string }) {
  return (
    <Link to={para} className="group rounded-xl bg-white p-6 shadow-sm ring-1 ring-stone-200 transition hover:ring-amber-400">
      <p className="text-sm text-stone-500">{titulo}</p>
      <p className="tabular mt-1 text-3xl font-semibold">{valor ?? '–'}</p>
      <p className="mt-3 text-sm font-medium text-stone-700 group-hover:text-stone-900">{acao} →</p>
    </Link>
  );
}

export function Painel() {
  const { usuario } = useAuth();
  const { empresa, papel } = useEmpresaAtual();

  const resumo = useQuery({
    queryKey: ['painel', empresa.id],
    queryFn: async () => {
      const [clientes, membros] = await Promise.all([contar('clientes', empresa.id), contar('membros_empresa', empresa.id)]);
      return { clientes, membros };
    },
  });
  const materiais = useQuery({ queryKey: chaves.materiais(empresa.id), queryFn: () => buscarMateriais(empresa.id) });
  const fitas = useQuery({ queryKey: chaves.fitas(empresa.id), queryFn: () => buscarFitas(empresa.id) });

  const ativos = (materiais.data ?? []).filter((m) => m.ativo);
  const chapasSemPreco = ativos.flatMap((m) => m.chapas).filter((c) => c.ativo && c.preco_centavos === null).length;
  const materiaisSemChapa = ativos.filter((m) => !m.chapas.some((c) => c.ativo)).length;
  const fitasAtivas = (fitas.data ?? []).filter((f) => f.ativo);
  const fitasSemPreco = fitasAtivas.filter((f) => f.preco_metro_centavos === null).length;

  const pendencias = [
    materiaisSemChapa > 0 && `${materiaisSemChapa} material(is) sem formato de chapa`,
    chapasSemPreco > 0 && `${chapasSemPreco} formato(s) de chapa sem preço`,
    fitasSemPreco > 0 && `${fitasSemPreco} fita(s) sem preço por metro`,
  ].filter(Boolean) as string[];

  const nome = (usuario?.user_metadata?.nome as string | undefined)?.split(' ')[0];
  const erro = resumo.error ?? materiais.error ?? fitas.error;

  return (
    <>
      <Titulo subtitulo={`${empresa.nome} · ${NOME_PAPEL[papel]}`}>{nome ? `Olá, ${nome}` : 'Painel'}</Titulo>

      {erro && (
        <div className="mb-6">
          <Aviso>{mensagemDeErro(erro)}</Aviso>
        </div>
      )}

      {pendencias.length > 0 && (
        <div className="mb-6">
          <Aviso tipo="info">
            Para os orçamentos saírem certos, complete o catálogo: {pendencias.join('; ')}.{' '}
            {podeEditarCatalogo(papel) && (
              <Link to={materiaisSemChapa > 0 || chapasSemPreco > 0 ? '/materiais' : '/fitas'} className="font-medium underline">
                Completar agora
              </Link>
            )}
          </Aviso>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Bloco para="/clientes" titulo="Clientes" valor={resumo.data?.clientes} acao="Ver clientes" />
        <Bloco para="/materiais" titulo="Materiais ativos" valor={materiais.data ? ativos.length : undefined} acao="Ver materiais" />
        <Bloco para="/fitas" titulo="Fitas de borda ativas" valor={fitas.data ? fitasAtivas.length : undefined} acao="Ver fitas" />
        <Bloco
          para="/empresa"
          titulo="Pessoas na equipe"
          valor={resumo.data?.membros}
          acao={papel === 'dono' ? 'Gerenciar equipe' : 'Ver equipe'}
        />
      </div>
    </>
  );
}
