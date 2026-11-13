import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Campo, Carregando, Cartao, Titulo } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import { buscarProjetos, chavesProjetos, formatarData, podeEditarProjetos } from '../lib/projetos';

export function Projetos() {
  const { empresa, papel } = useEmpresaAtual();
  const [busca, setBusca] = useState('');
  const [arquivados, setArquivados] = useState(false);
  const termo = useDeferredValue(busca.trim().toLocaleLowerCase('pt-BR'));
  const consulta = useQuery({ queryKey: chavesProjetos.lista(empresa.id), queryFn: () => buscarProjetos(empresa.id) });

  const projetos = (consulta.data ?? []).filter(
    (p) =>
      p.arquivado === arquivados &&
      (!termo || p.nome.toLocaleLowerCase('pt-BR').includes(termo) || p.cliente?.nome.toLocaleLowerCase('pt-BR').includes(termo)),
  );

  return (
    <>
      <Titulo subtitulo="Cada projeto guarda todas as versões salvas; nada é sobrescrito.">Projetos</Titulo>
      <Cartao
        titulo={arquivados ? 'Arquivados' : 'Em andamento'}
        acoes={
          podeEditarProjetos(papel) ? (
            <Link to="/modulo" className="inline-flex min-h-10 items-center rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">
              Novo projeto
            </Link>
          ) : undefined
        }
      >
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="w-full max-w-sm">
            <Campo rotulo="Buscar" placeholder="Nome do projeto ou cliente" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-stone-600">
            <input type="checkbox" checked={arquivados} onChange={(e) => setArquivados(e.target.checked)} className="accent-amber-600" />
            Ver arquivados
          </label>
        </div>

        {consulta.isPending ? (
          <Carregando />
        ) : consulta.isError ? (
          <Aviso>{mensagemDeErro(consulta.error)}</Aviso>
        ) : projetos.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-500">
            {consulta.data.length === 0 ? 'Nenhum projeto ainda. Comece um rascunho e salve como projeto.' : 'Nenhum projeto encontrado.'}
          </p>
        ) : (
          <ul className="-mx-5 divide-y divide-stone-100 sm:-mx-6">
            {projetos.map((p) => (
              <li key={p.id}>
                <Link to={`/projetos/${p.id}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3 hover:bg-stone-50 sm:px-6">
                  <span>
                    <span className="font-medium text-stone-900">{p.nome}</span>
                    <span className="ml-2 text-sm text-stone-500">{p.cliente?.nome ?? 'Sem cliente'}</span>
                  </span>
                  <span className="tabular text-sm text-stone-500">
                    v{p.versao_atual} · {formatarData(p.updated_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </>
  );
}
