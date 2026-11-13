import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  dividirEmParcelas,
  ErroFinanceiro,
  formatarReais,
  hojeBrasil,
  repetirMensal,
  type Parcela,
  type TipoLancamento,
} from '@marcenaria/core';
import { Aviso, Botao, Campo, CampoSelecao, CampoTexto } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import { chavesFinanceiro, criarLancamentos, editarLancamento, type Categoria, type Lancamento } from '../lib/financeiro';
import { CampoReais } from './CampoReais';

type Modo = 'unico' | 'parcelado' | 'mensal';

export interface Pessoa {
  id: string;
  nome: string;
}

/**
 * Nova conta a receber ou a pagar (uma, parcelada ou repetida todo mês), ou
 * edição de uma conta em aberto. `inicial` preenche a partir do orçamento.
 */
export function FormLancamento({
  empresaId,
  tipo,
  categorias,
  pessoas,
  editando,
  inicial,
  aoFechar,
}: {
  empresaId: string;
  tipo: TipoLancamento;
  categorias: readonly Categoria[];
  /** Clientes (a receber) ou fornecedores (a pagar). */
  pessoas: readonly Pessoa[];
  editando?: Lancamento | null;
  inicial?: { descricao: string; valorCentavos: number; clienteId: string | null; orcamentoId: string; modo?: Modo };
  aoFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const hoje = hojeBrasil();
  const [descricao, setDescricao] = useState(editando?.descricao ?? inicial?.descricao ?? '');
  const [valor, setValor] = useState<number | null>(editando?.valor_centavos ?? inicial?.valorCentavos ?? null);
  const [vencimento, setVencimento] = useState(editando?.vencimento ?? hoje);
  const [categoria, setCategoria] = useState(editando?.categoria_id ?? '');
  const [pessoa, setPessoa] = useState((tipo === 'receber' ? (editando?.cliente_id ?? inicial?.clienteId) : editando?.fornecedor_id) ?? '');
  const [documento, setDocumento] = useState(editando?.documento ?? '');
  const [observacao, setObservacao] = useState(editando?.observacao ?? '');
  const [modo, setModo] = useState<Modo>(inicial?.modo ?? 'unico');
  const [entrada, setEntrada] = useState<number | null>(null);
  const [parcelas, setParcelas] = useState('3');
  const [intervalo, setIntervalo] = useState<'mensal' | '30'>('mensal');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const nomeTipo = tipo === 'receber' ? 'a receber' : 'a pagar';

  let previa: Parcela[] = [];
  let erroPrevia: string | null = null;
  if (!editando && valor !== null && valor > 0) {
    try {
      const n = Number(parcelas);
      if (modo === 'unico') previa = [{ numero: 1, de: 1, valorCentavos: valor, vencimento }];
      else if (modo === 'parcelado') previa = dividirEmParcelas({ totalCentavos: valor, entradaCentavos: entrada ?? 0, parcelas: n, primeiroVencimento: vencimento, intervalo: intervalo === 'mensal' ? 'mensal' : 30 });
      else previa = repetirMensal(valor, vencimento, n);
    } catch (e) {
      erroPrevia = e instanceof ErroFinanceiro ? e.message : 'Confira os valores.';
    }
  }

  async function salvar() {
    setErro(null);
    if (!descricao.trim()) return setErro('Descreva a conta.');
    if (valor === null || valor <= 0) return setErro('Informe o valor.');
    if (!vencimento) return setErro('Informe o vencimento.');
    setOcupado(true);
    try {
      if (editando) {
        await editarLancamento(editando.id, {
          descricao: descricao.trim(),
          valor_centavos: valor,
          vencimento,
          categoria_id: categoria || null,
          ...(tipo === 'receber' ? { cliente_id: pessoa || null } : { fornecedor_id: pessoa || null }),
          documento: documento.trim() || null,
          observacao: observacao.trim() || null,
        });
      } else {
        if (erroPrevia || previa.length === 0) throw new Error(erroPrevia ?? 'Confira os valores.');
        await criarLancamentos(
          empresaId,
          {
            tipo,
            descricao: descricao.trim(),
            categoria_id: categoria || null,
            cliente_id: tipo === 'receber' ? pessoa || null : null,
            fornecedor_id: tipo === 'pagar' ? pessoa || null : null,
            orcamento_id: inicial?.orcamentoId ?? null,
            documento: documento.trim() || null,
            observacao: observacao.trim() || null,
          },
          previa,
        );
      }
      await queryClient.invalidateQueries({ queryKey: chavesFinanceiro.lancamentos(empresaId) });
      if (inicial?.orcamentoId) await queryClient.invalidateQueries({ queryKey: chavesFinanceiro.doOrcamento(inicial.orcamentoId) });
      aoFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }

  const ativas = categorias.filter((c) => c.tipo === tipo && (c.ativa || c.id === categoria));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Campo rotulo="Descrição" value={descricao} maxLength={180} onChange={(e) => setDescricao(e.target.value)} obrigatorio placeholder={tipo === 'receber' ? 'Roupeiro do quarto · João' : 'Chapas MDF · pedido 1532'} />
        </div>
        <CampoReais rotulo={modo === 'mensal' ? 'Valor de cada mês' : modo === 'parcelado' ? 'Valor total' : 'Valor'} valor={valor} aoMudar={setValor} obrigatorio />
        <Campo rotulo={modo === 'unico' || editando ? 'Vencimento' : 'Primeiro vencimento'} type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} obrigatorio />
        <CampoSelecao rotulo={tipo === 'receber' ? 'Cliente' : 'Fornecedor'} value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
          <option value="">Nenhum</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </CampoSelecao>
        <CampoSelecao rotulo="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Sem categoria</option>
          {ativas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </CampoSelecao>
        <Campo rotulo="Documento" value={documento} maxLength={60} onChange={(e) => setDocumento(e.target.value)} ajuda="Número da nota, do pedido ou do boleto." />
      </div>

      {!editando && (
        <fieldset className="rounded-lg bg-stone-50 p-4 ring-1 ring-stone-200">
          <legend className="sr-only">Forma de lançar</legend>
          <div className="mb-3 flex flex-wrap gap-2" role="radiogroup">
            {(
              [
                ['unico', 'Uma vez'],
                ['parcelado', 'Parcelado'],
                ['mensal', 'Todo mês'],
              ] as const
            ).map(([m, r]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={modo === m}
                onClick={() => setModo(m)}
                className={`min-h-10 rounded-full px-4 text-sm font-medium ring-1 ${modo === m ? 'bg-stone-900 text-white ring-stone-900' : 'bg-white text-stone-700 ring-stone-300'}`}
              >
                {r}
              </button>
            ))}
          </div>
          {modo === 'parcelado' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <CampoReais rotulo="Entrada" valor={entrada} aoMudar={setEntrada} ajuda="Vence no primeiro vencimento." />
              <Campo rotulo="Parcelas" inputMode="numeric" value={parcelas} onChange={(e) => setParcelas(e.target.value.replace(/\D/g, '').slice(0, 3))} />
              <CampoSelecao rotulo="Intervalo" value={intervalo} onChange={(e) => setIntervalo(e.target.value as 'mensal' | '30')}>
                <option value="mensal">Todo mês, no mesmo dia</option>
                <option value="30">A cada 30 dias</option>
              </CampoSelecao>
            </div>
          )}
          {modo === 'mensal' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo rotulo="Quantos meses" inputMode="numeric" value={parcelas} onChange={(e) => setParcelas(e.target.value.replace(/\D/g, '').slice(0, 3))} ajuda="Aluguel, energia, salário." />
            </div>
          )}
          {erroPrevia ? (
            <p className="mt-3 text-sm text-red-700">{erroPrevia}</p>
          ) : (
            previa.length > 1 && (
              <ol className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {previa.map((p) => (
                  <li key={`${p.numero}-${p.vencimento}`} className="tabular flex justify-between gap-3 border-b border-stone-200 py-1">
                    <span>
                      {p.numero === 0 ? 'Entrada' : `${p.numero}/${p.de}`} · {p.vencimento.split('-').reverse().join('/')}
                    </span>
                    <span className="font-medium">{formatarReais(p.valorCentavos)}</span>
                  </li>
                ))}
              </ol>
            )
          )}
        </fieldset>
      )}

      <CampoTexto rotulo="Observação" value={observacao} maxLength={1000} onChange={(e) => setObservacao(e.target.value)} />
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <Botao onClick={salvar} carregando={ocupado}>
          {editando ? 'Salvar' : previa.length > 1 ? `Lançar ${previa.length} contas ${nomeTipo}` : `Lançar conta ${nomeTipo}`}
        </Botao>
        <Botao variante="secundario" onClick={aoFechar}>
          Cancelar
        </Botao>
      </div>
    </div>
  );
}
