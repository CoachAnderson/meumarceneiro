import { useEffect, useState } from 'react';
import { formatarMm, lerMm, type Dmm } from '@marcenaria/core';
import { Campo } from '../components/ui';
import { lerCampo } from '../lib/formulario';

/**
 * Medida em mm, pensada para a trena e o celular: teclado numérico, aceita
 * vírgula, guarda null quando está vazia. Texto inválido fica na tela com o
 * erro e não muda a medida gravada.
 */
export function CampoMm({ rotulo, valor, aoMudar, ajuda, placeholder, aceitaZero = false }: { rotulo: string; valor: Dmm | null; aoMudar: (v: Dmm | null) => void; ajuda?: string; placeholder?: string; aceitaZero?: boolean }) {
  const [texto, setTexto] = useState(valor === null ? '' : formatarMm(valor));
  // Veio outra medida de fora (outra parede, versão do servidor): mostra ela.
  useEffect(() => {
    const lido = lerCampo(texto, lerMm);
    if ((lido.valor ?? null) !== valor && !(lido.erro && valor === null)) setTexto(valor === null ? '' : formatarMm(valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);
  const lido = lerCampo(texto, lerMm);
  const invalido = (v: number | undefined) => v !== undefined && (aceitaZero ? v < 0 : v <= 0);
  const negativo = invalido(lido.valor);
  return (
    <Campo
      rotulo={`${rotulo} (mm)`}
      inputMode="decimal"
      autoComplete="off"
      enterKeyHint="next"
      value={texto}
      placeholder={placeholder}
      ajuda={ajuda}
      erro={lido.erro ?? (negativo ? (aceitaZero ? 'A medida não pode ser negativa.' : 'A medida precisa ser maior que zero.') : null)}
      onChange={(e) => {
        setTexto(e.target.value);
        const l = lerCampo(e.target.value, lerMm);
        if (!l.erro && !invalido(l.valor)) aoMudar(l.valor ?? null);
      }}
    />
  );
}
