import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Campo, Carregando, Cartao, Titulo } from '../components/ui';
import { AreaEditor } from '../editor/AreaEditor';
import { mesmoFormulario, normalizarFormulario, type Formulario } from '../editor/formulario';
import type { Calculo } from '../editor/useCalculo';
import { mensagemDeErro } from '../lib/erros';
import {
  atualizarProjeto,
  buscarProjeto,
  buscarVersoes,
  chavesProjetos,
  excluirProjeto,
  formatarData,
  podeEditarProjetos,
  salvarVersao,
  type Projeto as TipoProjeto,
  type VersaoProjeto,
} from '../lib/projetos';

const nomeArquivo = (nome: string) =>
  nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'projeto';

export function Projeto() {
  const { id = '' } = useParams();
  const projeto = useQuery({ queryKey: chavesProjetos.projeto(id), queryFn: () => buscarProjeto(id) });
  const versoes = useQuery({ queryKey: chavesProjetos.versoes(id), queryFn: () => buscarVersoes(id) });

  if (projeto.isPending || versoes.isPending) return <Carregando />;
  if (projeto.isError || versoes.isError) return <Aviso>{mensagemDeErro(projeto.error ?? versoes.error)}</Aviso>;
  if (!projeto.data || versoes.data.length === 0) {
    return (
      <Aviso>
        Projeto não encontrado. <Link to="/projetos" className="underline">Voltar para os projetos</Link>
      </Aviso>
    );
  }
  // key: ao trocar de projeto, o editor recomeça do zero.
  return <EditorProjeto key={id} projeto={projeto.data} versoes={versoes.data} />;
}

function EditorProjeto({ projeto, versoes }: { projeto: TipoProjeto; versoes: VersaoProjeto[] }) {
  const { empresa, papel } = useEmpresaAtual();
  const queryClient = useQueryClient();
  const navegar = useNavigate();
  const podeEditar = podeEditarProjetos(papel);

  const ultima = versoes[0]!;
  const [base, setBase] = useState<VersaoProjeto>(ultima);
  const formularioBase = useMemo(() => normalizarFormulario(base.dados), [base]);
  const [f, setFState] = useState<Formulario>(formularioBase);
  const setF = useCallback((atualizar: (atual: Formulario) => Formulario) => setFState(atualizar), []);
  const alterado = !mesmoFormulario(f, formularioBase);

  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'erro' | 'sucesso'; texto: string } | null>(null);
  const [historico, setHistorico] = useState(false);

  // Aviso do navegador ao sair com alteração não salva.
  useEffect(() => {
    if (!alterado) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [alterado]);

  async function salvar(calculo: Calculo) {
    setSalvando(true);
    setMensagem(null);
    try {
      const obs = observacao.trim() || (base.numero !== ultima.numero ? `A partir da versão ${base.numero}` : null);
      const numero = await salvarVersao({
        empresaId: empresa.id,
        projetoId: projeto.id,
        dados: f,
        regras: calculo.regras,
        valido: calculo.liberado,
        observacao: obs,
      });
      const novas = await queryClient.fetchQuery({ queryKey: chavesProjetos.versoes(projeto.id), queryFn: () => buscarVersoes(projeto.id) });
      await queryClient.invalidateQueries({ queryKey: chavesProjetos.projeto(projeto.id) });
      await queryClient.invalidateQueries({ queryKey: chavesProjetos.lista(empresa.id) });
      const salva = novas.find((v) => v.numero === numero);
      if (salva) {
        setBase(salva);
        setFState(normalizarFormulario(salva.dados));
      }
      setObservacao('');
      setMensagem({ tipo: 'sucesso', texto: `Versão ${numero} salva.` });
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: mensagemDeErro(e) });
    } finally {
      setSalvando(false);
    }
  }

  function abrirVersao(v: VersaoProjeto) {
    if (alterado && !window.confirm('Há alterações não salvas. Abrir outra versão descarta essas alterações. Continuar?')) return;
    setBase(v);
    setFState(normalizarFormulario(v.dados));
    setMensagem(null);
  }

  async function renomear() {
    const nome = window.prompt('Novo nome do projeto', projeto.nome)?.trim();
    if (!nome || nome === projeto.nome) return;
    try {
      await atualizarProjeto(projeto.id, { nome });
      await queryClient.invalidateQueries({ queryKey: chavesProjetos.projeto(projeto.id) });
      await queryClient.invalidateQueries({ queryKey: chavesProjetos.lista(empresa.id) });
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: mensagemDeErro(e) });
    }
  }

  async function arquivar() {
    try {
      await atualizarProjeto(projeto.id, { arquivado: !projeto.arquivado });
      await queryClient.invalidateQueries({ queryKey: chavesProjetos.projeto(projeto.id) });
      await queryClient.invalidateQueries({ queryKey: chavesProjetos.lista(empresa.id) });
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: mensagemDeErro(e) });
    }
  }

  async function excluir() {
    if (!window.confirm(`Excluir o projeto "${projeto.nome}" e todas as ${versoes.length} versões? Esta ação não pode ser desfeita.`)) return;
    try {
      await excluirProjeto(projeto.id);
      await queryClient.invalidateQueries({ queryKey: chavesProjetos.lista(empresa.id) });
      navegar('/projetos', { replace: true });
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: mensagemDeErro(e) });
    }
  }

  const vendoAntiga = base.numero !== ultima.numero;

  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/projetos" className="inline-flex min-h-11 items-center text-stone-500 hover:text-stone-900 lg:min-h-0">
          ← Projetos
        </Link>
      </div>
      <Titulo
        subtitulo={
          <>
            {projeto.cliente?.nome ?? 'Sem cliente'} · {projeto.versao_atual} {projeto.versao_atual === 1 ? 'versão' : 'versões'}
            {projeto.arquivado && ' · arquivado'}
          </>
        }
      >
        {projeto.nome}
      </Titulo>

      <AreaEditor
        f={f}
        setF={setF}
        somenteLeitura={!podeEditar}
        projeto={{ id: projeto.id, nome: projeto.nome, versao: base.numero, alterado, clienteId: projeto.cliente_id, clienteNome: projeto.cliente?.nome ?? null }}
        nomeArquivo={`${nomeArquivo(projeto.nome)}-v${base.numero}${alterado ? '-alterado' : ''}`}
        aoCalcular={(calculo) => (
          <Cartao
            titulo={`Versão ${base.numero}${alterado ? ' · com alterações' : ''}`}
            descricao={
              <>
                {vendoAntiga ? `Aberta do histórico (a mais recente é a ${ultima.numero}). ` : ''}
                Salva em {formatarData(base.created_at)} por {base.autor?.nome ?? base.autor?.email ?? '—'}
                {base.observacao ? ` — ${base.observacao}` : ''}
                {base.valido ? '' : ' · não liberada (tinha problemas)'}
              </>
            }
            acoes={
              <Botao variante="discreto" onClick={() => setHistorico((h) => !h)} aria-expanded={historico}>
                {historico ? 'Fechar histórico' : 'Histórico'}
              </Botao>
            }
          >
            {mensagem && (
              <div className="mb-4">
                <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>
              </div>
            )}

            {historico && (
              <ol className="mb-4 max-h-72 divide-y divide-stone-100 overflow-y-auto rounded-lg ring-1 ring-stone-200">
                {versoes.map((v) => (
                  <li key={v.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm ${v.numero === base.numero ? 'bg-amber-50' : ''}`}>
                    <span>
                      <span className="tabular font-medium">v{v.numero}</span>
                      <span className="ml-2 text-stone-500">
                        {formatarData(v.created_at)} · {v.autor?.nome ?? v.autor?.email ?? '—'}
                        {v.observacao ? ` — ${v.observacao}` : ''}
                        {!v.valido && ' · não liberada'}
                      </span>
                    </span>
                    {v.numero !== base.numero && (
                      <Botao variante="secundario" className="min-h-0 px-3 py-1" onClick={() => abrirVersao(v)}>
                        Abrir
                      </Botao>
                    )}
                  </li>
                ))}
              </ol>
            )}

            {podeEditar ? (
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-48 flex-1">
                  <Campo
                    rotulo="Observação da nova versão"
                    placeholder={vendoAntiga ? `A partir da versão ${base.numero}` : 'Ex.: cliente pediu 2 cm a mais'}
                    value={observacao}
                    maxLength={500}
                    onChange={(e) => setObservacao(e.target.value)}
                  />
                </div>
                {alterado && (
                  <Botao variante="secundario" onClick={() => setFState(formularioBase)}>
                    Descartar alterações
                  </Botao>
                )}
                <Botao onClick={() => salvar(calculo)} carregando={salvando} disabled={!alterado && !vendoAntiga}>
                  Salvar versão {ultima.numero + 1}
                </Botao>
              </div>
            ) : (
              <p className="text-sm text-stone-500">Sua função permite apenas consultar o projeto.</p>
            )}

            {podeEditar && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                <Botao variante="discreto" className="min-h-0 px-2 py-1" onClick={renomear}>
                  Renomear
                </Botao>
                <Botao variante="discreto" className="min-h-0 px-2 py-1" onClick={arquivar}>
                  {projeto.arquivado ? 'Desarquivar' : 'Arquivar'}
                </Botao>
                {papel === 'dono' && (
                  <Botao variante="perigo" className="min-h-0 px-2 py-1" onClick={excluir}>
                    Excluir projeto
                  </Botao>
                )}
              </div>
            )}
          </Cartao>
        )}
      />
    </>
  );
}
