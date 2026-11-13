/**
 * Ajustes do interior pelo desenho: mover uma divisória, dar a altura de uma
 * prateleira. São contas puras sobre as entradas do motor (larguras dos vãos
 * e alturas das prateleiras); quem confere tudo de novo é calcularModulo.
 *
 * Convenções:
 *  - largura de vão: da face da peça à esquerda até a face da peça à direita;
 *  - altura de prateleira: do fundo interno (face de cima da base) até a face
 *    de BAIXO da prateleira. null = automática (espaçamento igual entre as
 *    vizinhas que têm altura, ou entre a base e o tampo).
 */
import { distribuir, dmm, formatarMm, type Dmm } from './unidades';

/** Menor vão livre entre prateleiras (e entre prateleira e base ou tampo) que o desenho aceita. */
export const VAO_LIVRE_MIN: Dmm = dmm(500); // 50 mm
/** Menor largura de vão (igual à do motor). */
export const VAO_MIN: Dmm = dmm(500); // 50 mm

export type PosicoesPrateleiras = { posicoes: Dmm[]; erro: null } | { posicoes: null; erro: string };

/**
 * Altura de cada prateleira (face de baixo, a partir do fundo interno).
 * As de altura informada ficam onde estão; as automáticas dividem por igual o
 * espaço entre as vizinhas. Erro quando alguma não cabe ou estão fora de ordem.
 */
export function posicoesPrateleiras(Hi: Dmm, e: Dmm, quantidade: number, alturas?: ReadonlyArray<Dmm | null>): PosicoesPrateleiras {
  const lista = alturas ?? [];
  if (lista.length > 0 && lista.length !== quantidade) {
    return { posicoes: null, erro: `informe a altura de ${quantidade} prateleira(s), ou de nenhuma` };
  }
  for (const [j, h] of lista.entries()) {
    if (h === null) continue;
    if (!Number.isSafeInteger(h) || h < 0) return { posicoes: null, erro: `a altura da prateleira ${j + 1} precisa ser um número de 0 em diante` };
    if (h + e > Hi) return { posicoes: null, erro: `a prateleira ${j + 1} a ${formatarMm(h)} mm passa do tampo (altura interna ${formatarMm(Hi)} mm)` };
  }
  const posicoes: number[] = [];
  let j = 0;
  let base = 0; // face de cima da peça de baixo (fundo interno ou prateleira anterior)
  while (j < quantidade) {
    // Próxima prateleira com altura informada (ou o tampo).
    let k = j;
    while (k < quantidade && (lista[k] ?? null) === null) k++;
    const teto = k < quantidade ? (lista[k] as number) : Hi;
    const automaticas = k - j;
    const espaco = teto - base - automaticas * e;
    if (espaco < 0) {
      return {
        posicoes: null,
        erro:
          k < quantidade
            ? `a prateleira ${k + 1} a ${formatarMm(dmm(teto))} mm não deixa lugar para as de baixo; confira a ordem das alturas`
            : `${automaticas} prateleira(s) não cabem acima de ${formatarMm(dmm(base))} mm`,
      };
    }
    const intervalos = automaticas > 0 ? distribuir(dmm(espaco), automaticas + 1) : [];
    let y = base;
    for (let a = 0; a < automaticas; a++) {
      y += intervalos[a] as number;
      posicoes.push(y);
      y += e;
    }
    if (k < quantidade) {
      posicoes.push(teto);
      base = teto + e;
    }
    j = k + 1;
  }
  return { posicoes: posicoes.map((p) => dmm(p)), erro: null };
}

/** Vão livre abaixo de cada prateleira e acima da última (quantidade + 1 itens). */
export function vaosLivres(Hi: Dmm, e: Dmm, posicoes: readonly Dmm[]): Dmm[] {
  const livres: Dmm[] = [];
  let base = 0;
  for (const p of posicoes) {
    livres.push(dmm(p - base));
    base = p + e;
  }
  livres.push(dmm(Hi - base));
  return livres;
}

/** Faixa em que a prateleira j (0 = a de baixo) pode ficar sem encostar nas vizinhas. */
export function limitesPrateleira(Hi: Dmm, e: Dmm, posicoes: readonly Dmm[], j: number): { min: Dmm; max: Dmm } {
  const abaixo = j > 0 ? (posicoes[j - 1] as number) + e : 0;
  const acima = j < posicoes.length - 1 ? (posicoes[j + 1] as number) : Hi;
  return { min: dmm(abaixo + VAO_LIVRE_MIN), max: dmm(acima - VAO_LIVRE_MIN - e) };
}

/**
 * Nova lista de alturas depois de mover a prateleira j: as outras ficam onde
 * estão (viram altura informada), para mexer numa não andar com as demais.
 */
export function fixarPrateleira(posicoes: readonly Dmm[], j: number, altura: Dmm): Dmm[] {
  return posicoes.map((p, i) => (i === j ? altura : p));
}

/** Linhas da fileira de furos de pino, a partir do fundo interno (sistema 32). */
export function linhasDePino(Hi: Dmm, margem: Dmm, passo: Dmm): Dmm[] {
  const linhas: Dmm[] = [];
  for (let y: number = margem; y <= Hi - margem; y += passo) linhas.push(dmm(y));
  return linhas;
}

/** A linha de furo mais perto (prateleira regulável apoia nos pinos), dentro dos limites. */
export function encaixarNoFuro(altura: number, linhas: readonly Dmm[], limites: { min: Dmm; max: Dmm }): Dmm | null {
  let melhor: Dmm | null = null;
  for (const l of linhas) {
    if (l < limites.min || l > limites.max) continue;
    if (melhor === null || Math.abs(l - altura) < Math.abs(melhor - altura)) melhor = l;
  }
  return melhor;
}

/** Faixa da largura do vão à esquerda da divisória k (1 = a primeira), mantendo o vão da direita com o mínimo. */
export function limitesDivisoria(larguras: readonly Dmm[], k: number): { min: Dmm; max: Dmm } {
  const esquerda = larguras[k - 1] as number;
  const direita = larguras[k] as number;
  return { min: VAO_MIN, max: dmm(esquerda + direita - VAO_MIN) };
}

/**
 * Larguras dos vãos depois de mover a divisória k para que o vão da esquerda
 * fique com `larguraEsquerda`. Só os dois vãos vizinhos mudam: os dois passam
 * a ter largura fixa. Se com isso nenhum vão ficar automático, o da direita
 * (ou o da esquerda) volta a ser automático, com a mesma medida: assim o
 * móvel continua aceitando mudança de largura total.
 *
 * `larguras` são as medidas atuais (do resultado); `fixas`, as informadas
 * (null = automática). Devolve null se a medida pedida sair dos limites.
 */
export function moverDivisoria(larguras: readonly Dmm[], fixas: ReadonlyArray<Dmm | null>, k: number, larguraEsquerda: Dmm): Array<Dmm | null> | null {
  if (!Number.isSafeInteger(k) || k < 1 || k >= larguras.length) return null;
  if (!Number.isSafeInteger(larguraEsquerda)) return null;
  const { min, max } = limitesDivisoria(larguras, k);
  if (larguraEsquerda < min || larguraEsquerda > max) return null;
  const soma = (larguras[k - 1] as number) + (larguras[k] as number);
  const nova: Array<Dmm | null> = larguras.map((_, i) => fixas[i] ?? null);
  nova[k - 1] = larguraEsquerda;
  nova[k] = dmm(soma - larguraEsquerda);
  if (!nova.includes(null)) {
    if ((fixas[k] ?? null) === null) nova[k] = null;
    else if ((fixas[k - 1] ?? null) === null) nova[k - 1] = null;
  }
  return nova;
}
