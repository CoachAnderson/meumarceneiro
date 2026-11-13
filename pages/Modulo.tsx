import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Campo, CampoSelecao, Cartao, Titulo } from '../components/ui';
import { AreaEditor } from '../editor/AreaEditor';
import { INICIAL, normalizarFormulario, type Formulario } from '../editor/formulario';
import type { Calculo } from '../editor/useCalculo';
import { mensagemDeErro } from '../lib/erros';
import { chavesProjetos, criarProjeto, podeEditarProjetos } from '../lib/projetos';
import { supabase } from '../lib/supabase';

const CHAVE_LOCAL = 'marcenaria:calculadora-modulo';

function carregar(): Formulario {
  try {
    const salvo = localStorage.getItem(CHAVE_LOCAL);
    if (salvo) return normalizarFormulario(JSON.parse(salvo));
  } catch {
    // Armazenamento indisponível: começa do padrão.
  }
  return INICIAL;
}

/** Rascunho: calcula sem salvar no banco; pode virar projeto. */
export function Modulo() {
  const { papel } = useEmpresaAtual();
  const [f, setF] = useState<Formulario>(carregar);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_LOCAL, JSON.stringify(f));
    } catch {
      // Sem armazenamento: o formulário vale só nesta visita.
    }
  }, [f]);

  return (
    <>
      <Titulo subtitulo="Rascunho: calcule à vontade; ele fica só neste navegador até você salvar como projeto.">Rascunho de módulo</Titulo>
      <AreaEditor
        f={f}
        setF={setF}
        somenteLeitura={false}
        nomeArquivo="lista-de-pecas"
        aoCalcular={(calculo) =>
          podeEditarProjetos(papel) ? (
            salvando ? (
              <SalvarComoProjeto f={f} calculo={calculo} aoCancelar={() => setSalvando(false)} />
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                <Botao variante="secundario" onClick={() => setF(INICIAL)}>
                  Recomeçar
                </Botao>
                <Botao onClick={() => setSalvando(true)}>Salvar como projeto</Botao>
              </div>
            )
          ) : null
        }
      />
    </>
  );
}

function SalvarComoProjeto({ f, calculo, aoCancelar }: { f: Formulario; calculo: Calculo; aoCancelar: () => void }) {
  const { empresa } = useEmpresaAtual();
  const navegar = useNavigate();
  const queryClient = useQueryClient();
  const [nome, setNome] = useState('');
  const [cliente, setCliente] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const clientes = useQuery({
    queryKey: ['clientes', empresa.id, 'opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('id, nome').eq('empresa_id', empresa.id).order('nome').limit(1000);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; nome: string }>;
    },
  });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (nome.trim().length < 2) {
      setErro('Dê um nome ao projeto (pelo menos 2 letras).');
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const id = await criarProjeto({
        empresaId: empresa.id,
        nome: nome.trim(),
        clienteId: cliente || null,
        dados: f,
        regras: calculo.regras,
        valido: calculo.liberado,
      });
      await queryClient.invalidateQueries({ queryKey: chavesProjetos.lista(empresa.id) });
      navegar(`/projetos/${id}`);
    } catch (e) {
      setErro(mensagemDeErro(e));
      setEnviando(false);
    }
  }

  return (
    <Cartao titulo="Salvar como projeto" descricao="O projeto guarda as entradas; cada salvamento depois disso vira uma nova versão.">
      <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome do projeto" obrigatorio value={nome} onChange={(e) => setNome(e.target.value)} maxLength={160} autoFocus placeholder="Ex.: Cozinha — gabinete da pia" />
        <CampoSelecao rotulo="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} ajuda={clientes.data?.length === 0 ? 'Nenhum cliente cadastrado ainda.' : undefined}>
          <option value="">Sem cliente</option>
          {(clientes.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </CampoSelecao>
        {erro && (
          <div className="sm:col-span-2">
            <Aviso>{erro}</Aviso>
          </div>
        )}
        {!calculo.liberado && (
          <div className="sm:col-span-2">
            <Aviso tipo="info">O módulo ainda tem problemas. Dá para salvar, mas a versão fica marcada como não liberada.</Aviso>
          </div>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Botao type="button" variante="secundario" onClick={aoCancelar}>
            Cancelar
          </Botao>
          <Botao type="submit" carregando={enviando}>
            Criar projeto
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}
