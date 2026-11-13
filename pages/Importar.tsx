import { useState, type ChangeEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  COLUNAS_FITAS,
  COLUNAS_MATERIAIS,
  modeloCsvFitas,
  modeloCsvMateriais,
  validarPlanilhaFitas,
  validarPlanilhaMateriais,
  type LinhaFita,
  type LinhaMaterial,
  type ResultadoPlanilha,
} from '@marcenaria/catalog';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Cartao, Titulo } from '../components/ui';
import { chaves, podeEditarCatalogo } from '../lib/catalogo';
import { mensagemDeErro } from '../lib/erros';
import { supabase } from '../lib/supabase';

type Tipo = 'materiais' | 'fitas';

const CONFIG = {
  materiais: {
    titulo: 'Materiais e chapas',
    colunas: COLUNAS_MATERIAIS,
    modelo: modeloCsvMateriais,
    arquivoModelo: 'modelo-materiais.csv',
    validar: validarPlanilhaMateriais as (t: string) => ResultadoPlanilha<LinhaMaterial | LinhaFita>,
    funcao: 'importar_materiais',
    voltar: '/materiais',
  },
  fitas: {
    titulo: 'Fitas de borda',
    colunas: COLUNAS_FITAS,
    modelo: modeloCsvFitas,
    arquivoModelo: 'modelo-fitas.csv',
    validar: validarPlanilhaFitas as (t: string) => ResultadoPlanilha<LinhaMaterial | LinhaFita>,
    funcao: 'importar_fitas',
    voltar: '/fitas',
  },
} as const;

const ROTULO_RESULTADO: Record<string, string> = {
  materiais_criados: 'materiais criados',
  materiais_atualizados: 'materiais atualizados',
  chapas_criadas: 'formatos de chapa criados',
  chapas_atualizadas: 'formatos de chapa atualizados',
  fitas_criadas: 'fitas criadas',
  fitas_atualizadas: 'fitas atualizadas',
  fornecedores_criados: 'fornecedores criados',
  estoques_definidos: 'estoques definidos',
};

/** Lê o arquivo como UTF-8; se tiver caractere inválido, tenta Windows-1252 (Excel antigo). */
async function lerArquivo(arquivo: File): Promise<string> {
  const bytes = await arquivo.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function Importar() {
  const { empresa, papel } = useEmpresaAtual();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tipo: Tipo = params.get('tipo') === 'fitas' ? 'fitas' : 'materiais';
  const cfg = CONFIG[tipo];

  const [arquivo, setArquivo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoPlanilha<LinhaMaterial | LinhaFita> | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [concluido, setConcluido] = useState<Record<string, number> | null>(null);

  function limpar() {
    setArquivo(null);
    setResultado(null);
    setErro(null);
    setConcluido(null);
  }

  async function aoEscolher(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    limpar();
    if (f.size > 2_000_000) {
      setErro('Arquivo grande demais (máximo de 2 MB). Divida a planilha em partes.');
      return;
    }
    if (/\.(xlsx?|ods)$/i.test(f.name)) {
      setErro('Este é um arquivo de planilha, não CSV. No Excel: Arquivo → Salvar como → "CSV (separado por ponto e vírgula)".');
      return;
    }
    setArquivo(f.name);
    setResultado(cfg.validar(await lerArquivo(f)));
  }

  async function importar() {
    if (!resultado || resultado.validas.length === 0 || resultado.erros.length > 0) return;
    setEnviando(true);
    setErro(null);
    const { data, error } = await supabase.rpc(cfg.funcao, { p_empresa: empresa.id, p_linhas: resultado.validas });
    setEnviando(false);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    setConcluido(data as Record<string, number>);
    await Promise.all(
      [chaves.materiais, chaves.fitas, chaves.fornecedores, chaves.saldos].map((k) =>
        queryClient.invalidateQueries({ queryKey: k(empresa.id) }),
      ),
    );
  }

  if (!podeEditarCatalogo(papel)) {
    return (
      <>
        <Titulo>Importar planilha</Titulo>
        <Aviso tipo="info">Só o dono e o projetista podem importar cadastros.</Aviso>
      </>
    );
  }

  const prontos = resultado && !resultado.erroGeral && resultado.erros.length === 0 && resultado.validas.length > 0;

  return (
    <>
      <Titulo subtitulo="Cadastre muitos itens de uma vez a partir de uma planilha CSV.">Importar planilha</Titulo>

      <div className="mb-6 inline-flex rounded-lg bg-stone-100 p-1" role="tablist">
        {(Object.keys(CONFIG) as Tipo[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={t === tipo}
            onClick={() => {
              limpar();
              setParams({ tipo: t });
            }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${t === tipo ? 'bg-white shadow-sm ring-1 ring-stone-200' : 'text-stone-600 hover:text-stone-900'}`}
          >
            {CONFIG[t].titulo}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        <Cartao titulo="1. Prepare a planilha" descricao="Baixe o modelo, preencha no Excel ou Google Planilhas e salve como CSV.">
          <Botao variante="secundario" onClick={() => baixar(cfg.arquivoModelo, cfg.modelo())}>
            Baixar modelo ({cfg.arquivoModelo})
          </Botao>
          <div className="mt-4 -mx-5 overflow-x-auto sm:-mx-6">
            <table className="cartoes-celular min-w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-stone-500">
                  <th className="px-5 py-2 font-medium sm:px-6">Coluna</th>
                  <th className="px-3 py-2 font-medium">Obrigatória</th>
                  <th className="px-5 py-2 font-medium sm:px-6">Como preencher</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {cfg.colunas.map((c) => (
                  <tr key={c.chave}>
                    <td className="px-5 py-2 font-mono text-xs whitespace-nowrap sm:px-6">{c.titulo}</td>
                    <td className="px-3 py-2">{c.obrigatoria ? 'Sim' : '–'}</td>
                    <td className="px-5 py-2 text-stone-600 sm:px-6">{c.ajuda}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-stone-500">
            Se o item já existir, ele é atualizado; campos vazios não apagam o que já está cadastrado. Medidas em milímetros,
            sem ponto de milhar (2750, não 2.750).
          </p>
        </Cartao>

        <Cartao titulo="2. Envie o arquivo">
          <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-amber-500">
            Escolher arquivo CSV
            <input type="file" accept=".csv,.txt,text/csv" onChange={(e) => void aoEscolher(e)} className="sr-only" />
          </label>
          {arquivo && <span className="ml-3 text-sm text-stone-600">{arquivo}</span>}

          {erro && (
            <div className="mt-4">
              <Aviso>{erro}</Aviso>
            </div>
          )}

          {resultado?.erroGeral && (
            <div className="mt-4">
              <Aviso>{resultado.erroGeral}</Aviso>
            </div>
          )}

          {resultado && !resultado.erroGeral && (
            <div className="mt-4 space-y-4">
              <p className="text-sm">
                <strong className="tabular">{resultado.totalLinhas}</strong> linha{resultado.totalLinhas === 1 ? '' : 's'} lida
                {resultado.totalLinhas === 1 ? '' : 's'}:{' '}
                <span className="text-emerald-700">{resultado.validas.length} válida{resultado.validas.length === 1 ? '' : 's'}</span>
                {resultado.erros.length > 0 && (
                  <>
                    , <span className="text-red-700">{resultado.erros.length} com erro</span>
                  </>
                )}
                .
              </p>
              {resultado.colunasIgnoradas.length > 0 && (
                <Aviso tipo="info">Colunas ignoradas (nome não reconhecido): {resultado.colunasIgnoradas.join(', ')}.</Aviso>
              )}
              {resultado.erros.length > 0 && (
                <div className="rounded-lg ring-1 ring-red-200">
                  <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm font-medium text-red-800">
                    Corrija estas linhas na planilha e envie de novo. Nada é importado enquanto houver erro.
                  </p>
                  <ul className="max-h-80 divide-y divide-red-50 overflow-y-auto text-sm">
                    {resultado.erros.map((e) => (
                      <li key={e.linha} className="flex gap-3 px-4 py-2">
                        <span className="tabular w-16 shrink-0 font-medium text-red-800">Linha {e.linha}</span>
                        <span className="text-stone-700">{e.mensagens.join(' ')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Cartao>

        {(prontos || concluido) && (
          <Cartao titulo="3. Importe">
            {concluido ? (
              <div className="space-y-4">
                <Aviso tipo="sucesso">
                  Importação concluída:{' '}
                  {Object.entries(concluido)
                    .filter(([, n]) => n > 0)
                    .map(([k, n]) => `${n} ${ROTULO_RESULTADO[k] ?? k}`)
                    .join(', ') || 'nada mudou'}
                  .
                </Aviso>
                <div className="flex gap-2">
                  <Link
                    to={cfg.voltar}
                    className="inline-flex min-h-10 items-center rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
                  >
                    Ver {cfg.titulo.toLowerCase()}
                  </Link>
                  <Botao variante="secundario" onClick={limpar}>
                    Importar outro arquivo
                  </Botao>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Botao carregando={enviando} onClick={() => void importar()}>
                  Importar {resultado?.validas.length} linha{resultado?.validas.length === 1 ? '' : 's'}
                </Botao>
                <span className="text-sm text-stone-500">Tudo ou nada: se algo falhar, nenhuma linha é gravada.</span>
              </div>
            )}
          </Cartao>
        )}
      </div>
    </>
  );
}
