import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { comodoDaMedicao, type ComodoImersivo, type Dmm, type Problema } from '@marcenaria/core';
import { CampoSelecao } from '../components/ui';
import { CampoMm } from '../medicao/CampoMm';
import { buscarMedicoes, chavesMedicao } from '../lib/medicoes';

export type EscolhaComodo = { comodo: ComodoImersivo | null; erros: Problema[]; avisos: Problema[] } | null;

/**
 * Escolhe a medição e a parede onde o móvel vai ficar, para o cliente "entrar"
 * no cômodo com os óculos. Opcional: sem escolha, os óculos mostram um
 * ambiente neutro.
 */
export function ComodoParaOculos({ empresaId, larguraMovel, aoMudar }: { empresaId: string; larguraMovel: Dmm; aoMudar: (e: EscolhaComodo) => void }) {
  const medicoes = useQuery({ queryKey: chavesMedicao.lista(empresaId), queryFn: () => buscarMedicoes(empresaId), staleTime: 60_000 });
  const [medicaoId, setMedicaoId] = useState('');
  const [paredeId, setParedeId] = useState('');
  const [posicao, setPosicao] = useState<Dmm | null>(null);

  const medicao = medicoes.data?.find((m) => m.id === medicaoId) ?? null;
  const paredes = medicao?.dados.paredes ?? [];

  const resultado = useMemo<EscolhaComodo>(() => {
    if (!medicao || !paredeId) return null;
    return comodoDaMedicao({ medicao: medicao.dados, paredeId, posicao }, larguraMovel);
  }, [medicao, paredeId, posicao, larguraMovel]);

  useEffect(() => aoMudar(resultado), [resultado]); // eslint-disable-line react-hooks/exhaustive-deps

  if (medicoes.isError || (medicoes.data && medicoes.data.length === 0)) return null;

  return (
    <div className="mt-4 rounded-lg bg-white p-4 ring-1 ring-stone-200">
      <h4 className="text-sm font-semibold text-stone-900">Cômodo para os óculos</h4>
      <p className="text-sm text-stone-600">Opcional. Com óculos de realidade virtual, o cliente entra no cômodo medido, com o móvel encostado na parede escolhida. Vão no link só as medidas da parede e a posição dos pontos (sem nome, endereço, fotos ou observações).</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <CampoSelecao
          rotulo="Medição"
          value={medicaoId}
          onChange={(e) => {
            setMedicaoId(e.target.value);
            const m = medicoes.data?.find((x) => x.id === e.target.value);
            setParedeId(m?.dados.paredes[0]?.id ?? '');
          }}
        >
          <option value="">Sem cômodo (ambiente neutro)</option>
          {medicoes.data?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.titulo}
              {m.cliente?.nome ? ` · ${m.cliente.nome}` : ''}
            </option>
          ))}
        </CampoSelecao>
        {medicao && (
          <>
            <CampoSelecao rotulo="Parede do móvel" value={paredeId} onChange={(e) => setParedeId(e.target.value)}>
              {paredes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </CampoSelecao>
            <CampoMm rotulo="Do canto esquerdo até o móvel" valor={posicao} aoMudar={setPosicao} aceitaZero placeholder="No meio da parede" />
          </>
        )}
      </div>
    </div>
  );
}
