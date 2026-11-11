import { formatarMm, largurasPorProporcao, lerMm, mm, type Dmm, type LeituraMovel } from '@marcenaria/core';
import { INICIAL, type Formulario } from './formulario';

/**
 * Leitura da IA → entradas do editor. Daqui em diante é um projeto como
 * qualquer outro: o motor calcula as peças e valida tudo.
 */
export function formularioDaLeitura(l: LeituraMovel, medidas: { L: string; A: string; P: string }): Formulario {
  // Larguras de vão só quando a IA viu vãos diferentes; senão o motor divide por igual.
  // Usa a largura que o usuário confirmou; se o campo estiver inválido, a da leitura.
  let largura: Dmm = l.largura;
  try {
    largura = lerMm(medidas.L);
  } catch {
    // O editor mostra o erro do campo.
  }
  const larguras = largurasPorProporcao(largura, mm(18), l.vaos.map((v) => v.proporcao));
  const embutidaComPrateleira = l.modoFrente === 'embutida' && l.vaos.some((v) => v.frente !== 'aberto' && v.prateleiras > 0);
  return {
    ...INICIAL,
    montagem: l.montagem,
    L: medidas.L,
    A: medidas.A,
    P: medidas.P,
    divisorias: String(l.vaos.length - 1),
    vaos: l.vaos.map((v, i) => ({
      largura: larguras?.[i] ? formatarMm(larguras[i]) : '',
      prateleiras: String(v.prateleiras),
      tipo: 'regulavel',
      frente: v.frente,
      portas: v.portas === 2 ? '2' : '1',
      lado: v.lado,
      gavetas: String(v.gavetas),
    })),
    modoFrente: l.modoFrente,
    // Frente embutida pede prateleira recuada pelo menos a espessura da frente.
    parametros: embutidaComPrateleira ? { rfp: '20' } : {},
  };
}
