import { useMemo, useState } from 'react';
import { codigosDasPecas, gerarManual, modeloMontagem } from '@marcenaria/core';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Cartao } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import { publicarManual } from '../lib/manual';
import { Manual } from '../montagem/Manual';
import { CodigoQR } from './VerNoAmbiente';
import type { Calculo } from './useCalculo';

/** Manual de montagem gerado do projeto, com link para o montador ou o cliente. */
export function ManualMontagemCartao({ calculo, titulo }: { calculo: Calculo; titulo: string }) {
  const { empresa } = useEmpresaAtual();
  const { resultado, lista } = calculo;
  const codigos = useMemo(() => codigosDasPecas(lista?.itens ?? []), [lista]);
  const manual = useMemo(() => (resultado?.valido ? gerarManual(resultado, codigos) : null), [resultado, codigos]);
  const [link, setLink] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  if (!resultado || !manual) return null;

  async function publicar() {
    if (!resultado) return;
    setPublicando(true);
    setErro(null);
    try {
      setLink(await publicarManual(empresa.id, titulo, modeloMontagem(resultado, codigos)));
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setPublicando(false);
    }
  }

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro('Não foi possível copiar. Selecione o link e copie à mão.');
    }
  }

  return (
    <Cartao
      titulo="Manual de montagem"
      descricao={`${manual.passos.length} passos gerados do próprio projeto: a ordem das peças, onde vai cada ferragem e o código de cada peça.${lista ? '' : ' Os códigos das peças aparecem quando a lista de peças estiver liberada.'}`}
    >
      <Manual
        manual={manual}
        componentes={resultado.componentes}
        titulo={titulo}
        acoes={
          <Botao variante="secundario" onClick={publicar} carregando={publicando}>
            {link ? 'Gerar outro link' : 'Link para o montador ou cliente'}
          </Botao>
        }
      />
      {erro && (
        <div className="mt-4">
          <Aviso>{erro}</Aviso>
        </div>
      )}
      {link && (
        <div className="mt-4 flex flex-col gap-4 rounded-lg bg-stone-50 p-4 ring-1 ring-stone-200 sm:flex-row sm:items-center">
          <CodigoQR texto={link} tamanho={132} />
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <p className="text-stone-700">Quem abrir este link vê o manual no celular, em 3D, sem precisar de login. O link mostra só o móvel e os passos: sem preço e sem dados do cliente.</p>
            <p className="font-mono text-xs break-all text-stone-600">{link}</p>
            <div className="flex flex-wrap gap-2">
              <Botao variante="secundario" onClick={copiar}>
                {copiado ? 'Copiado' : 'Copiar link'}
              </Botao>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Manual de montagem${titulo ? ` · ${titulo}` : ''}: ${link}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-stone-900 ring-1 ring-inset ring-stone-300 hover:bg-stone-50"
              >
                Enviar pelo WhatsApp
              </a>
            </div>
            <p className="text-xs text-stone-500">Mudou o projeto? Gere outro link: este continua mostrando a versão de agora.</p>
          </div>
        </div>
      )}
    </Cartao>
  );
}
