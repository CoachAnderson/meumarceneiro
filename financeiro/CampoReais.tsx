import { useEffect, useState } from 'react';
import { centavosParaTexto, lerPrecoCentavos } from '@marcenaria/catalog';
import { LIMITE_CENTAVOS } from '@marcenaria/core';
import { Campo } from '../components/ui';
import { lerCampo } from '../lib/formulario';

/** Valor em reais: teclado numérico, aceita "1.234,56"; guarda centavos (null se vazio). */
export function CampoReais({ rotulo, valor, aoMudar, ajuda, obrigatorio }: { rotulo: string; valor: number | null; aoMudar: (v: number | null) => void; ajuda?: string; obrigatorio?: boolean }) {
  const [texto, setTexto] = useState(centavosParaTexto(valor));
  useEffect(() => {
    const l = lerCampo(texto, (t) => lerPrecoCentavos(t, rotulo));
    if ((l.valor ?? null) !== valor && !(l.erro && valor === null)) setTexto(centavosParaTexto(valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);
  const ler = (t: string) => lerCampo(t, (x) => {
    const v = lerPrecoCentavos(x, rotulo);
    if (v > LIMITE_CENTAVOS) throw new Error(`${rotulo}: valor alto demais.`);
    return v;
  });
  const lido = ler(texto);
  return (
    <Campo
      rotulo={`${rotulo} (R$)`}
      inputMode="decimal"
      autoComplete="off"
      value={texto}
      ajuda={ajuda}
      obrigatorio={obrigatorio}
      erro={lido.erro ?? null}
      onChange={(e) => {
        setTexto(e.target.value);
        const l = ler(e.target.value);
        if (!l.erro) aoMudar(l.valor ?? null);
      }}
    />
  );
}
