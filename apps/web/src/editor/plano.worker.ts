/// <reference lib="webworker" />
import { otimizarCorte, type ChapaDisponivel, type ParametrosCorte, type PecaCorte, type ResultadoOtimizacao } from '@marcenaria/core';

export interface PedidoPlano {
  id: number;
  grupos: Array<{ chave: string; pecas: PecaCorte[]; chapas: ChapaDisponivel[]; parametros: ParametrosCorte }>;
}

export interface RespostaPlano {
  id: number;
  grupos: Array<{ chave: string; resultado?: ResultadoOtimizacao; erro?: string }>;
}

// O otimizador roda aqui para não travar a tela em listas grandes.
self.onmessage = (e: MessageEvent<PedidoPlano>) => {
  const { id, grupos } = e.data;
  const resposta: RespostaPlano = {
    id,
    grupos: grupos.map((g) => {
      try {
        return { chave: g.chave, resultado: otimizarCorte(g.pecas, g.chapas, g.parametros) };
      } catch (erro) {
        return { chave: g.chave, erro: erro instanceof Error ? erro.message : String(erro) };
      }
    }),
  };
  (self as unknown as Worker).postMessage(resposta);
};
