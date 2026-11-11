import { ErroCampo } from '@marcenaria/catalog';
import { ErroMedida } from '@marcenaria/core';

export interface CampoLido<T> {
  valor: T | undefined;
  erro: string | null;
}

/**
 * Lê um campo de formulário com uma função do catálogo/motor.
 * Vazio: obrigatório gera erro; opcional gera valor undefined.
 * Mostra o erro só quando há texto (ou quando `mostrarVazio`).
 */
export function lerCampo<T>(
  texto: string,
  ler: (t: string) => T,
  opcoes: { obrigatorio?: boolean; nome?: string } = {},
): CampoLido<T> {
  if (texto.trim() === '') {
    return { valor: undefined, erro: opcoes.obrigatorio ? `${opcoes.nome ?? 'Campo'}: obrigatório.` : null };
  }
  try {
    return { valor: ler(texto), erro: null };
  } catch (e) {
    if (e instanceof ErroCampo || e instanceof ErroMedida) return { valor: undefined, erro: e.message };
    throw e;
  }
}

/** Mensagem a exibir sob o campo: esconde "obrigatório" enquanto o campo está vazio. */
export const erroVisivel = (texto: string, campo: CampoLido<unknown>) => (texto.trim() === '' ? null : campo.erro);
