import { useQuery } from '@tanstack/react-query';
import { formatarMetros } from '@marcenaria/catalog';
import { formatarMm, type Dmm } from '@marcenaria/core';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Carregando, Cartao, Titulo } from '../components/ui';
import { Retalhos } from '../components/Retalhos';
import { buscarFerragens, buscarFitas, buscarMateriais, buscarSaldos, chaveFerragens, chaves } from '../lib/catalogo';
import { mensagemDeErro } from '../lib/erros';
import { supabase } from '../lib/supabase';

interface Movimento {
  id: string;
  chapa_id: string | null;
  fita_id: string | null;
  ferragem_id: string | null;
  tipo: 'saldo_inicial' | 'ajuste' | 'entrada' | 'saida';
  quantidade: number;
  motivo: string | null;
  created_at: string;
  usuario: { nome: string; email: string } | null;
}

const NOME_TIPO = { saldo_inicial: 'Saldo inicial', ajuste: 'Ajuste', entrada: 'Entrada', saida: 'Saída' } as const;

const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function Estoque() {
  const { empresa } = useEmpresaAtual();
  const materiais = useQuery({ queryKey: chaves.materiais(empresa.id), queryFn: () => buscarMateriais(empresa.id) });
  const fitas = useQuery({ queryKey: chaves.fitas(empresa.id), queryFn: () => buscarFitas(empresa.id) });
  const ferragens = useQuery({ queryKey: chaveFerragens(empresa.id), queryFn: () => buscarFerragens(empresa.id) });
  const saldos = useQuery({ queryKey: chaves.saldos(empresa.id), queryFn: () => buscarSaldos(empresa.id) });
  const movimentos = useQuery({
    queryKey: ['movimentos', empresa.id],
    queryFn: async (): Promise<Movimento[]> => {
      const { data, error } = await supabase
        .from('estoque_movimentos')
        .select('id, chapa_id, fita_id, ferragem_id, tipo, quantidade, motivo, created_at, usuario:usuarios(nome, email)')
        .eq('empresa_id', empresa.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return ((data ?? []) as unknown as Movimento[]).map((m) => ({ ...m, quantidade: Number(m.quantidade) }));
    },
  });

  const carregando = materiais.isPending || fitas.isPending || saldos.isPending;
  const erro = materiais.error ?? fitas.error ?? saldos.error;

  // Nome legível de cada chapa e fita, para o histórico.
  const nomes = new Map<string, string>();
  for (const m of materiais.data ?? []) {
    for (const c of m.chapas) {
      nomes.set(c.id, `${m.nome} ${formatarMm(m.espessura_nominal_dmm as Dmm)} mm · ${formatarMm(c.comprimento_dmm as Dmm)}×${formatarMm(c.largura_dmm as Dmm)}`);
    }
  }
  for (const f of fitas.data ?? []) nomes.set(f.id, f.nome);
  for (const f of ferragens.data ?? []) nomes.set(f.id, f.nome);
  const linhasFerragens = (ferragens.data ?? []).filter((f) => f.ativo).map((f) => ({ id: f.id, nome: f.nome, saldo: saldos.data?.ferragens.get(f.id) }));

  const linhasChapas = (materiais.data ?? []).flatMap((m) =>
    m.chapas
      .filter((c) => c.ativo && m.ativo)
      .map((c) => ({ id: c.id, nome: nomes.get(c.id) ?? '', saldo: saldos.data?.chapas.get(c.id) })),
  );
  const linhasFitas = (fitas.data ?? []).filter((f) => f.ativo).map((f) => ({ id: f.id, nome: f.nome, saldo: saldos.data?.fitas.get(f.id) }));

  return (
    <>
      <Titulo subtitulo="Saldo atual de chapas, fitas, ferragens e retalhos. A baixa de uma ordem de produção aparece aqui. Para ajustar, use o botão no cadastro de cada item.">Estoque</Titulo>
      {carregando ? (
        <Carregando />
      ) : erro ? (
        <Aviso>{mensagemDeErro(erro)}</Aviso>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <TabelaSaldo titulo="Chapas" unidade="chapas" linhas={linhasChapas} formatar={String} />
            <TabelaSaldo titulo="Fitas de borda" unidade="m" linhas={linhasFitas} formatar={formatarMetros} />
            <TabelaSaldo titulo="Ferragens" unidade="un" linhas={linhasFerragens} formatar={String} />
          </div>

          <Retalhos materiais={materiais.data ?? []} />

          <Cartao titulo="Últimas movimentações" descricao="O saldo é sempre a soma destes registros; nenhum é apagado.">
            {movimentos.isPending ? (
              <Carregando />
            ) : movimentos.error ? (
              <Aviso>{mensagemDeErro(movimentos.error)}</Aviso>
            ) : movimentos.data.length === 0 ? (
              <p className="text-sm text-stone-500">Nenhuma movimentação ainda.</p>
            ) : (
              <div className="-mx-5 overflow-x-auto sm:-mx-6">
                <table className="cartoes-celular min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-left text-stone-500">
                      <th className="px-5 py-2 font-medium sm:px-6">Quando</th>
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 font-medium">Tipo</th>
                      <th className="px-3 py-2 text-right font-medium">Quantidade</th>
                      <th className="px-5 py-2 font-medium sm:px-6">Motivo · quem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {movimentos.data.map((m) => {
                      const fita = m.fita_id !== null;
                      const qtd = fita ? `${formatarMetros(Math.abs(m.quantidade))} m` : `${Math.abs(m.quantidade)}`;
                      return (
                        <tr key={m.id}>
                          <td className="tabular px-5 py-2 whitespace-nowrap text-stone-600 sm:px-6">{dataHora.format(new Date(m.created_at))}</td>
                          <td className="px-3 py-2">{nomes.get((m.chapa_id ?? m.fita_id ?? m.ferragem_id) as string) ?? 'Item excluído'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{NOME_TIPO[m.tipo]}</td>
                          <td className={`tabular px-3 py-2 text-right whitespace-nowrap ${m.quantidade < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                            {m.quantidade < 0 ? '−' : '+'}
                            {qtd}
                          </td>
                          <td className="px-5 py-2 text-stone-600 sm:px-6">
                            {[m.motivo, m.usuario?.nome || m.usuario?.email].filter(Boolean).join(' · ')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Cartao>
        </div>
      )}
    </>
  );
}

function TabelaSaldo({
  titulo,
  unidade,
  linhas,
  formatar,
}: {
  titulo: string;
  unidade: string;
  linhas: Array<{ id: string; nome: string; saldo: number | undefined }>;
  formatar: (n: number) => string;
}) {
  return (
    <Cartao titulo={titulo}>
      {linhas.length === 0 ? (
        <p className="text-sm text-stone-500">Nenhum item ativo cadastrado.</p>
      ) : (
        <ul className="divide-y divide-stone-100 text-sm">
          {linhas.map((l) => (
            <li key={l.id} className="flex items-baseline justify-between gap-4 py-2">
              <span className="min-w-0">{l.nome}</span>
              <span className={`tabular shrink-0 ${l.saldo === undefined ? 'text-stone-400' : l.saldo === 0 ? 'text-amber-700' : 'font-medium'}`}>
                {l.saldo === undefined ? 'sem registro' : `${formatar(l.saldo)} ${unidade}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}
