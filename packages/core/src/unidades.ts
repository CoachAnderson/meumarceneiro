/**
 * Unidades de medida do motor.
 *
 * Toda medida é um INTEIRO em décimos de milímetro (1 unidade = 0,1 mm).
 * Ex.: 18 mm = 180; kerf de 3,2 mm = 32; chapa de 2750 mm = 27500.
 *
 * Por que inteiros: somas e subtrações ficam exatas, comparações são seguras
 * e nenhum erro de arredondamento se acumula entre módulos. Divisões sempre
 * declaram explicitamente como arredondar.
 */

/** Medida em décimos de milímetro. Sempre um inteiro seguro. */
export type Dmm = number & { readonly __unidade: 'dmm' };

/** Área em décimos de milímetro ao quadrado (0,01 mm²). Sempre um inteiro seguro. */
export type Dmm2 = number & { readonly __unidade: 'dmm2' };

export const DMM_POR_MM = 10;

export type CodigoErroMedida =
  | 'NAO_NUMERICO'
  | 'PRECISAO'
  | 'FORMATO'
  | 'AMBIGUO'
  | 'FORA_DA_FAIXA_SEGURA'
  | 'FORA_DOS_LIMITES'
  | 'DIVISOR_INVALIDO'
  | 'DIVISAO_NAO_EXATA';

export class ErroMedida extends Error {
  readonly codigo: CodigoErroMedida;

  constructor(mensagem: string, codigo: CodigoErroMedida) {
    super(mensagem);
    this.name = 'ErroMedida';
    this.codigo = codigo;
  }
}

function exigirInteiroSeguro(valor: number, contexto: string): void {
  if (!Number.isSafeInteger(valor)) {
    throw new ErroMedida(
      `${contexto}: o valor ${valor} não é um inteiro seguro em décimos de milímetro.`,
      'FORA_DA_FAIXA_SEGURA',
    );
  }
}

/** Verdadeiro se o valor pode ser usado como medida (inteiro seguro). */
export function ehDmm(valor: unknown): valor is Dmm {
  return typeof valor === 'number' && Number.isSafeInteger(valor);
}

/** Cria uma medida a partir de um inteiro já em décimos de milímetro. */
export function dmm(valor: number): Dmm {
  exigirInteiroSeguro(valor, 'dmm()');
  // Normaliza -0 para 0.
  return (valor === 0 ? 0 : valor) as Dmm;
}

/**
 * Cria uma medida a partir de milímetros, com no máximo uma casa decimal.
 * mm(18) = 180; mm(18.5) = 185; mm(18.55) lança erro de precisão.
 */
export function mm(valor: number): Dmm {
  if (!Number.isFinite(valor)) {
    throw new ErroMedida(`mm(): ${valor} não é um número finito.`, 'NAO_NUMERICO');
  }
  const escalado = valor * DMM_POR_MM;
  const inteiro = Math.round(escalado);
  // Tolerância só para absorver a representação binária (ex.: 0.1 * 10).
  if (Math.abs(escalado - inteiro) > 1e-6) {
    throw new ErroMedida(
      `mm(): ${valor} mm tem mais de uma casa decimal; a precisão do sistema é 0,1 mm.`,
      'PRECISAO',
    );
  }
  return dmm(inteiro);
}

/** Converte para milímetros. Use só para exibir; nunca para calcular. */
export function emMm(medida: Dmm): number {
  return medida / DMM_POR_MM;
}

const PADRAO_MEDIDA = /^(-)?(\d+)(?:[.,](\d{1,2}))?$/;
const PADRAO_MILHAR = /^-?\d+[.,]\d{3,}$/;

/**
 * Lê uma medida digitada em milímetros.
 * Aceita "18", "18,5", "18.5", "18,50" e o sufixo opcional "mm".
 * Rejeita "18,55" (precisão), "2.750" (separador de milhar ambíguo) e
 * qualquer outro formato.
 */
export function lerMm(texto: string): Dmm {
  const limpo = texto.trim().replace(/\s*mm$/i, '').trim();

  if (limpo === '') {
    throw new ErroMedida('Informe uma medida.', 'FORMATO');
  }
  if (PADRAO_MILHAR.test(limpo)) {
    throw new ErroMedida(
      `"${texto}" é ambíguo. Digite a medida sem separador de milhar (ex.: 2750).`,
      'AMBIGUO',
    );
  }

  const partes = PADRAO_MEDIDA.exec(limpo);
  if (!partes) {
    throw new ErroMedida(`"${texto}" não é uma medida válida em milímetros.`, 'FORMATO');
  }

  const [, sinal, inteira = '0', fracao = ''] = partes;
  if (fracao.length === 2 && fracao[1] !== '0') {
    throw new ErroMedida(
      `"${texto}" tem mais de uma casa decimal; a precisão do sistema é 0,1 mm.`,
      'PRECISAO',
    );
  }

  const decimo = fracao.length > 0 ? Number(fracao[0]) : 0;
  const valor = Number(inteira) * DMM_POR_MM + decimo;
  return dmm(sinal ? -valor : valor);
}

/**
 * Formata em milímetros no padrão brasileiro: 185 → "18,5"; 180 → "18".
 * Sem separador de milhar, como o marceneiro escreve (2750).
 */
export function formatarMm(medida: Dmm, opcoes: { unidade?: boolean } = {}): string {
  exigirInteiroSeguro(medida, 'formatarMm()');
  const negativo = medida < 0;
  const absoluto = Math.abs(medida);
  const inteira = Math.floor(absoluto / DMM_POR_MM);
  const decimo = absoluto % DMM_POR_MM;
  const texto = `${negativo ? '-' : ''}${inteira}${decimo === 0 ? '' : `,${decimo}`}`;
  return opcoes.unidade ? `${texto} mm` : texto;
}

/** Soma exata de medidas. */
export function somar(...medidas: Dmm[]): Dmm {
  let total = 0;
  for (const m of medidas) {
    total += m;
  }
  return dmm(total);
}

/** a − b, exato. */
export function subtrair(a: Dmm, b: Dmm): Dmm {
  return dmm(a - b);
}

/** Medida × fator inteiro (ex.: 2 × espessura). */
export function multiplicar(medida: Dmm, fator: number): Dmm {
  exigirInteiroSeguro(fator, 'multiplicar(): fator');
  return dmm(medida * fator);
}

export type Arredondamento = 'baixo' | 'cima' | 'proximo' | 'exato';

/** Divisão inteira com piso, exata para qualquer inteiro seguro. */
function divisaoPiso(a: number, b: number): number {
  const resto = ((a % b) + b) % b;
  return (a - resto) / b;
}

/**
 * Divide uma medida por um inteiro positivo, com arredondamento explícito.
 * - baixo: para −∞
 * - cima: para +∞
 * - proximo: ao inteiro mais próximo; empate (x,5) vai para +∞
 * - exato: lança erro se a divisão não for exata
 */
export function dividir(medida: Dmm, divisor: number, arredondamento: Arredondamento): Dmm {
  if (!Number.isSafeInteger(divisor) || divisor <= 0) {
    throw new ErroMedida(
      `dividir(): o divisor precisa ser um inteiro positivo (recebido ${divisor}).`,
      'DIVISOR_INVALIDO',
    );
  }
  exigirInteiroSeguro(medida, 'dividir()');

  switch (arredondamento) {
    case 'baixo':
      return dmm(divisaoPiso(medida, divisor));
    case 'cima':
      return dmm(-divisaoPiso(-medida, divisor));
    case 'proximo':
      return dmm(divisaoPiso(2 * medida + divisor, 2 * divisor));
    case 'exato': {
      if (medida % divisor !== 0) {
        throw new ErroMedida(
          `dividir(): ${formatarMm(medida)} mm não se divide exatamente em ${divisor} partes.`,
          'DIVISAO_NAO_EXATA',
        );
      }
      return dmm(medida / divisor);
    }
  }
}

/**
 * Reparte uma medida em N partes inteiras cuja soma é EXATAMENTE o total.
 * O resto vai, de 0,1 em 0,1 mm, para as primeiras partes.
 * Ex.: distribuir(1000, 3) = [334, 333, 333].
 */
export function distribuir(total: Dmm, partes: number): Dmm[] {
  if (!Number.isSafeInteger(partes) || partes <= 0) {
    throw new ErroMedida(
      `distribuir(): a quantidade de partes precisa ser um inteiro positivo (recebido ${partes}).`,
      'DIVISOR_INVALIDO',
    );
  }
  if (total < 0) {
    throw new ErroMedida('distribuir(): o total não pode ser negativo.', 'FORA_DOS_LIMITES');
  }
  const base = divisaoPiso(total, partes);
  const resto = total - base * partes;
  return Array.from({ length: partes }, (_, i) => dmm(i < resto ? base + 1 : base));
}

/** Área de um retângulo, em 0,01 mm². */
export function area(comprimento: Dmm, largura: Dmm): Dmm2 {
  const valor = comprimento * largura;
  exigirInteiroSeguro(valor, 'area()');
  return valor as Dmm2;
}

/** Converte área para m², só para exibir. */
export function emM2(valor: Dmm2): number {
  // 1 m² = 1000 mm × 1000 mm = 10000 dmm × 10000 dmm
  return valor / 100_000_000;
}

/** Garante que a medida está dentro de [min, max]; lança erro com o nome da medida. */
export function exigirEntre(medida: Dmm, min: Dmm, max: Dmm, nome: string): Dmm {
  exigirInteiroSeguro(medida, nome);
  if (medida < min || medida > max) {
    throw new ErroMedida(
      `${nome} deve estar entre ${formatarMm(min)} e ${formatarMm(max)} mm (recebido ${formatarMm(medida)} mm).`,
      'FORA_DOS_LIMITES',
    );
  }
  return medida;
}

/** Garante que a medida é maior que zero. */
export function exigirPositiva(medida: Dmm, nome: string): Dmm {
  exigirInteiroSeguro(medida, nome);
  if (medida <= 0) {
    throw new ErroMedida(`${nome} deve ser maior que zero (recebido ${formatarMm(medida)} mm).`, 'FORA_DOS_LIMITES');
  }
  return medida;
}
