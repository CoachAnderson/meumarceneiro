import { DESCRICAO_FERRAGEM, formatarMm, juntarFerragens, type FerragemNecessaria } from '@marcenaria/core';
import type { Ferragem } from '../lib/catalogo';
import type { Formulario } from './formulario';
import type { Calculo } from './useCalculo';

export const chaveFerragem = (f: FerragemNecessaria) => `${f.codigo}/${f.comprimento ?? ''}`;

export function descricaoFerragem(f: FerragemNecessaria) {
  return `${DESCRICAO_FERRAGEM[f.codigo]}${f.comprimento ? ` ${formatarMm(f.comprimento)} mm` : ''}`;
}

/** Itens do catálogo que servem para a necessidade (corrediça: mesmo comprimento). */
function candidatos(f: FerragemNecessaria, catalogo: Ferragem[]): Ferragem[] {
  return catalogo.filter((c) => c.ativo && c.tipo === f.codigo && (f.codigo !== 'corredica' || c.comprimento_dmm === f.comprimento));
}

export interface LinhaFerragem {
  n: FerragemNecessaria;
  opcoes: Ferragem[];
  escolhido: Ferragem | null;
  total: number | null;
}

/** Ferragens do projeto ligadas ao catálogo; usada na lista e no orçamento. */
export function linhasDeFerragem(calculo: Calculo, f: Formulario, catalogo: Ferragem[]): LinhaFerragem[] {
  if (!calculo.resultado?.valido) return [];
  return juntarFerragens(calculo.resultado.ferragens, calculo.qtdModulos).map((n) => {
    const opcoes = candidatos(n, catalogo);
    const escolhido = opcoes.find((o) => o.id === f.ferragens[chaveFerragem(n)]) ?? opcoes[0] ?? null;
    const total = escolhido?.preco_centavos != null ? escolhido.preco_centavos * n.quantidade : null;
    return { n, opcoes, escolhido, total };
  });
}
