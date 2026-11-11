import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dmm, formatarMm, lerMm } from '@marcenaria/core';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { buscarRetalhos, chaveRetalhos, podeMexerRetalhos, type Material, type Retalho } from '../lib/catalogo';
import { mensagemDeErro } from '../lib/erros';
import { lerCampo } from '../lib/formulario';
import { supabase } from '../lib/supabase';
import { Aviso, Botao, Campo, CampoSelecao, Carregando, Cartao } from './ui';

/** Retalhos guardados: cadastro rápido e lista por material. */
export function Retalhos({ materiais }: { materiais: Material[] }) {
  const { empresa, papel } = useEmpresaAtual();
  const queryClient = useQueryClient();
  const consulta = useQuery({ queryKey: chaveRetalhos(empresa.id), queryFn: () => buscarRetalhos(empresa.id) });
  const [erro, setErro] = useState<string | null>(null);
  const podeMexer = podeMexerRetalhos(papel);
  const porId = new Map(materiais.map((m) => [m.id, m]));
  const nomeMaterial = (id: string) => {
    const m = porId.get(id);
    return m ? `${m.nome} ${formatarMm(dmm(m.espessura_nominal_dmm))} mm` : '—';
  };

  async function mudarQuantidade(r: Retalho, quantidade: number) {
    setErro(null);
    const { error } = quantidade <= 0 ? await supabase.from('retalhos').delete().eq('id', r.id) : await supabase.from('retalhos').update({ quantidade }).eq('id', r.id);
    if (error) setErro(mensagemDeErro(error));
    await queryClient.invalidateQueries({ queryKey: chaveRetalhos(empresa.id) });
  }

  const lista = [...(consulta.data ?? [])].sort((a, b) => nomeMaterial(a.material_id).localeCompare(nomeMaterial(b.material_id), 'pt-BR'));

  return (
    <Cartao titulo="Retalhos" descricao="Sobras guardadas para reaproveitar. O plano de corte usa os retalhos antes de abrir chapa nova.">
      {podeMexer && <NovoRetalho materiais={materiais.filter((m) => m.ativo)} aoSalvar={() => queryClient.invalidateQueries({ queryKey: chaveRetalhos(empresa.id) })} />}
      {erro && (
        <div className="mt-4">
          <Aviso>{erro}</Aviso>
        </div>
      )}
      {consulta.isPending ? (
        <Carregando />
      ) : consulta.error ? (
        <Aviso>{mensagemDeErro(consulta.error)}</Aviso>
      ) : lista.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500">Nenhum retalho guardado.</p>
      ) : (
        <div className="-mx-5 mt-4 overflow-x-auto sm:-mx-6">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-500">
                <th className="px-5 py-2 font-medium sm:px-6">Material</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Medida (mm)</th>
                <th className="px-3 py-2 font-medium">Local</th>
                <th className="px-5 py-2 text-right font-medium sm:px-6">Qtd</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {lista.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-2 sm:px-6">{nomeMaterial(r.material_id)}</td>
                  <td className="tabular px-3 py-2 whitespace-nowrap">
                    {formatarMm(dmm(r.comprimento_dmm))} × {formatarMm(dmm(r.largura_dmm))}
                  </td>
                  <td className="px-3 py-2 text-stone-600">{r.local ?? '–'}</td>
                  <td className="px-5 py-2 text-right sm:px-6">
                    <span className="inline-flex items-center gap-1">
                      {podeMexer && (
                        <button type="button" className="rounded px-2 text-stone-500 hover:bg-stone-100" aria-label={`Tirar um retalho de ${formatarMm(dmm(r.comprimento_dmm))} × ${formatarMm(dmm(r.largura_dmm))}`} onClick={() => mudarQuantidade(r, r.quantidade - 1)}>
                          −
                        </button>
                      )}
                      <span className="tabular w-8 text-center">{r.quantidade}</span>
                      {podeMexer && (
                        <button type="button" className="rounded px-2 text-stone-500 hover:bg-stone-100" aria-label={`Somar um retalho de ${formatarMm(dmm(r.comprimento_dmm))} × ${formatarMm(dmm(r.largura_dmm))}`} onClick={() => mudarQuantidade(r, r.quantidade + 1)}>
                          +
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}

function NovoRetalho({ materiais, aoSalvar }: { materiais: Material[]; aoSalvar: () => Promise<unknown> }) {
  const { empresa } = useEmpresaAtual();
  const [material, setMaterial] = useState('');
  const [c, setC] = useState('');
  const [l, setL] = useState('');
  const [qtd, setQtd] = useState('1');
  const [local, setLocal] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const cc = lerCampo(c, lerMm, { obrigatorio: true, nome: 'Comprimento' });
    const ll = lerCampo(l, lerMm, { obrigatorio: true, nome: 'Largura' });
    const q = /^\d{1,4}$/.test(qtd.trim()) ? Number(qtd) : NaN;
    const problema = !material ? 'Escolha o material.' : cc.erro ?? ll.erro ?? (!(q >= 1) ? 'Quantidade: use um número inteiro a partir de 1.' : null);
    if (problema) {
      setErro(problema);
      return;
    }
    if ((cc.valor as number) < 500 || (ll.valor as number) < 500) {
      setErro('Retalho precisa ter pelo menos 50 mm em cada lado.');
      return;
    }
    setErro(null);
    setEnviando(true);
    const { error } = await supabase.from('retalhos').insert({
      empresa_id: empresa.id,
      material_id: material,
      comprimento_dmm: cc.valor,
      largura_dmm: ll.valor,
      quantidade: q,
      local: local.trim() || null,
    });
    setEnviando(false);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    setC('');
    setL('');
    setQtd('1');
    await aoSalvar();
  }

  return (
    <form onSubmit={enviar} className="grid items-end gap-3 sm:grid-cols-[minmax(0,2fr)_6rem_6rem_4.5rem_minmax(0,1fr)_auto]">
      <CampoSelecao rotulo="Material" value={material} onChange={(e) => setMaterial(e.target.value)}>
        <option value="">Escolha…</option>
        {materiais.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome} {formatarMm(dmm(m.espessura_nominal_dmm))} mm
          </option>
        ))}
      </CampoSelecao>
      <Campo rotulo="Compr. (mm)" inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} />
      <Campo rotulo="Larg. (mm)" inputMode="decimal" value={l} onChange={(e) => setL(e.target.value)} />
      <Campo rotulo="Qtd" inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value)} />
      <Campo rotulo="Local" placeholder="Opcional" value={local} maxLength={120} onChange={(e) => setLocal(e.target.value)} />
      <Botao type="submit" carregando={enviando}>
        Guardar
      </Botao>
      {erro && (
        <div className="sm:col-span-6">
          <Aviso>{erro}</Aviso>
        </div>
      )}
    </form>
  );
}
