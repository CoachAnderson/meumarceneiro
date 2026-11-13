import { useState } from 'react';
import { calcularBaixa, formatarReais, hojeBrasil, NOME_FORMA, type FormaPagamento } from '@marcenaria/core';
import { Aviso, Botao, Campo, CampoSelecao } from '../components/ui';
import { mensagemDeErro } from '../lib/erros';
import { baixarLancamento, type ContaFinanceira, type Lancamento } from '../lib/financeiro';
import { CampoReais } from './CampoReais';

/** Recebeu ou pagou: data, valor, conta e forma. Valor menor: parcial (resto em aberto) ou desconto. */
export function Baixa({ l, contas, aoConcluir, aoCancelar }: { l: Lancamento; contas: readonly ContaFinanceira[]; aoConcluir: () => void; aoCancelar: () => void }) {
  const [data, setData] = useState(hojeBrasil());
  const [valor, setValor] = useState<number | null>(l.valor_centavos);
  const [conta, setConta] = useState(contas.find((c) => c.ativa)?.id ?? '');
  const [forma, setForma] = useState<FormaPagamento>(l.boleto ? 'boleto' : 'pix');
  const [parcial, setParcial] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const menor = valor !== null && valor > 0 && valor < l.valor_centavos;
  const b = valor !== null && valor > 0 ? calcularBaixa(l.valor_centavos, valor, menor && parcial) : null;
  const verbo = l.tipo === 'receber' ? 'Recebido' : 'Pago';

  async function confirmar() {
    if (!valor || valor <= 0) return setErro('Informe o valor.');
    setErro(null);
    setOcupado(true);
    try {
      await baixarLancamento({ id: l.id, pagoEm: data, valorCentavos: valor, contaId: conta || null, forma, parcial: menor && parcial });
      aoConcluir();
    } catch (e) {
      setErro(mensagemDeErro(e));
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200">
      <div className="grid gap-3 sm:grid-cols-4">
        <Campo rotulo={`${verbo} em`} type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <CampoReais rotulo="Valor" valor={valor} aoMudar={setValor} />
        <CampoSelecao rotulo="Conta" value={conta} onChange={(e) => setConta(e.target.value)}>
          <option value="">Nenhuma</option>
          {contas
            .filter((c) => c.ativa)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
        </CampoSelecao>
        <CampoSelecao rotulo="Forma" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
          {Object.entries(NOME_FORMA).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </CampoSelecao>
      </div>
      {menor && (
        <div className="space-y-1 text-sm" role="radiogroup" aria-label="Valor menor que a conta">
          <label className="flex items-start gap-2">
            <input type="radio" className="mt-1 accent-amber-600" checked={parcial} onChange={() => setParcial(true)} />
            <span>Pagamento parcial: os {formatarReais(l.valor_centavos - valor!)} que faltam ficam em aberto, com o mesmo vencimento.</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" className="mt-1 accent-amber-600" checked={!parcial} onChange={() => setParcial(false)} />
            <span>Quitar com desconto de {formatarReais(l.valor_centavos - valor!)}.</span>
          </label>
        </div>
      )}
      {b && b.diferencaCentavos > 0 && <p className="text-sm text-stone-700">Juros ou multa: {formatarReais(b.diferencaCentavos)}.</p>}
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <Botao onClick={confirmar} carregando={ocupado}>
          Confirmar {verbo.toLowerCase()}
        </Botao>
        <Botao variante="secundario" onClick={aoCancelar}>
          Voltar
        </Botao>
      </div>
    </div>
  );
}
