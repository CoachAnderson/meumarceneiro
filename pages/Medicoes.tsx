import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { novaMedicao } from '@marcenaria/core';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Campo, CampoSelecao, Cartao, Carregando, Titulo } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import { buscarMedicoes, chavesMedicao, guardarLocal, NOME_STATUS_MEDICAO, pendentesLocais } from '../lib/medicoes';
import { formatarData } from '../lib/projetos';
import { supabase } from '../lib/supabase';

/** Medições no local: lista e criação (funciona sem sinal). */
export function Medicoes() {
  const { empresa } = useEmpresaAtual();
  const navegar = useNavigate();
  const consulta = useQuery({ queryKey: chavesMedicao.lista(empresa.id), queryFn: () => buscarMedicoes(empresa.id) });
  const clientes = useQuery({
    queryKey: ['clientes-nomes', empresa.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, nome, endereco').eq('empresa_id', empresa.id).order('nome').limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome: string; endereco: string | null }>;
    },
  });
  const [titulo, setTitulo] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [endereco, setEndereco] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const pendentes = pendentesLocais(empresa.id);
  const doServidor = new Set((consulta.data ?? []).map((m) => m.id));
  const soNoAparelho = pendentes.filter((p) => !doServidor.has(p.id));

  function criar() {
    if (!titulo.trim()) {
      setErro('Dê um nome à medição (o ambiente, por exemplo "Quarto do casal").');
      return;
    }
    const id = crypto.randomUUID();
    const ok = guardarLocal({
      id,
      empresaId: empresa.id,
      clienteId: clienteId || null,
      titulo: titulo.trim().slice(0, 160),
      endereco: endereco.trim().slice(0, 300) || null,
      status: 'em_andamento',
      dados: { ...novaMedicao(crypto.randomUUID()), ambiente: titulo.trim().slice(0, 160) },
      versao: null,
      pendente: true,
      alteradoEm: new Date().toISOString(),
    });
    if (!ok) {
      setErro('Este navegador não deixa guardar dados no aparelho. Libere o armazenamento do site e tente de novo.');
      return;
    }
    navegar(`/medicoes/${id}`);
  }

  return (
    <>
      <Titulo subtitulo="Roteiro para medir na casa do cliente pelo celular: paredes, esquadro, tomadas, janelas e fotos. Funciona sem sinal e envia quando voltar.">Medições</Titulo>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Cartao titulo="Nova medição">
          <div className="space-y-4">
            <Campo rotulo="Ambiente" value={titulo} maxLength={160} placeholder="Quarto do casal" onChange={(e) => setTitulo(e.target.value)} obrigatorio />
            <CampoSelecao
              rotulo="Cliente"
              value={clienteId}
              onChange={(e) => {
                setClienteId(e.target.value);
                const c = clientes.data?.find((x) => x.id === e.target.value);
                if (c?.endereco && !endereco.trim()) setEndereco(c.endereco);
              }}
            >
              <option value="">Sem cliente</option>
              {(clientes.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </CampoSelecao>
            <Campo rotulo="Endereço" value={endereco} maxLength={300} onChange={(e) => setEndereco(e.target.value)} />
            {erro && <Aviso>{erro}</Aviso>}
            <Botao onClick={criar} className="w-full">
              Começar a medir
            </Botao>
          </div>
        </Cartao>

        <Cartao titulo="Medições">
          {consulta.isPending ? (
            <Carregando />
          ) : (
            <>
              {consulta.error && soNoAparelho.length === 0 && <Aviso>{mensagemDeErro(consulta.error)}</Aviso>}
              {soNoAparelho.length > 0 && (
                <ul className="mb-4 divide-y divide-stone-100 rounded-lg bg-amber-50 ring-1 ring-amber-200">
                  {soNoAparelho.map((m) => (
                    <li key={m.id}>
                      <Link to={`/medicoes/${m.id}`} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                        <span className="font-medium text-stone-900">{m.titulo}</span>
                        <span className="text-xs text-amber-900">Só neste aparelho · envia quando houver sinal</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {(consulta.data ?? []).length === 0 && soNoAparelho.length === 0 ? (
                <p className="text-sm text-stone-500">Nenhuma medição ainda.</p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {(consulta.data ?? []).map((m) => (
                    <li key={m.id}>
                      <Link to={`/medicoes/${m.id}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                        <span className="min-w-0">
                          <span className="block font-medium text-stone-900">{m.titulo}</span>
                          <span className="block text-sm text-stone-500">
                            {m.cliente?.nome ?? 'Sem cliente'}
                            {` · ${m.dados.paredes?.length ?? 0} parede${m.dados.paredes?.length === 1 ? '' : 's'} · ${m.dados.fotos?.length ?? 0} foto${m.dados.fotos?.length === 1 ? '' : 's'}`}
                          </span>
                        </span>
                        <span className="text-right text-xs text-stone-500">
                          <span className={`mr-2 rounded-full px-2 py-0.5 ${m.status === 'concluida' ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>{NOME_STATUS_MEDICAO[m.status]}</span>
                          {formatarData(m.updated_at)}
                          {m.autor?.nome ? ` · ${m.autor.nome}` : ''}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Cartao>
      </div>
    </>
  );
}
