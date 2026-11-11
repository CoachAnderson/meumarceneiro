import { ErroMedida, lerMm, mm, type Dmm } from '@marcenaria/core';
import { ErroCampo, lerInteiroNaoNegativo, lerPrecoCentavos } from './numeros';
import {
  coletar,
  modeloCsv,
  normalizarColuna,
  opcional,
  processarPlanilha,
  textoLimitado,
  type DefinicaoColuna,
  type ResultadoPlanilha,
} from './planilha';

export type TipoMaterial = 'mdf' | 'mdp' | 'compensado' | 'hdf' | 'outro';
export type DirecaoVeio = 'sem_veio' | 'comprimento' | 'largura';

export const TIPOS_MATERIAL: readonly TipoMaterial[] = ['mdf', 'mdp', 'compensado', 'hdf', 'outro'];

export const NOME_TIPO_MATERIAL: Record<TipoMaterial, string> = {
  mdf: 'MDF',
  mdp: 'MDP',
  compensado: 'Compensado',
  hdf: 'HDF',
  outro: 'Outro',
};

export const NOME_VEIO: Record<DirecaoVeio, string> = {
  sem_veio: 'Sem veio',
  comprimento: 'No comprimento da chapa',
  largura: 'Na largura da chapa',
};

/** Limites — iguais aos do banco (migration da Fase 2). */
export const LIMITES_MATERIAL = {
  espessuraMin: mm(0.1),
  espessuraMax: mm(100),
  chapaMin: mm(100),
  chapaMax: mm(6000),
  precoMaxCentavos: 100_000_000,
  estoqueMax: 1_000_000,
} as const;

/** Espessura de chapa: lê em mm e confere os limites. */
export function lerEspessuraMaterial(texto: string, nome = 'Espessura'): Dmm {
  const valor = lerMedida(texto, nome);
  if (valor < LIMITES_MATERIAL.espessuraMin || valor > LIMITES_MATERIAL.espessuraMax) {
    throw new ErroCampo(`${nome}: use entre 0,1 e 100 mm.`);
  }
  return valor;
}

/** A espessura real precisa ficar a até 20% da nominal (pega erro de digitação). */
export function conferirEspessuraReal(nominal: Dmm, real: Dmm): void {
  if (real * 10 < nominal * 8 || real * 10 > nominal * 12) {
    throw new ErroCampo('Espessura real: precisa ficar a até 20% da nominal. Confira se não faltou a vírgula.');
  }
}

export function lerMedidaChapa(texto: string, nome: string): Dmm {
  const valor = lerMedida(texto, nome);
  if (valor < LIMITES_MATERIAL.chapaMin || valor > LIMITES_MATERIAL.chapaMax) {
    throw new ErroCampo(`${nome}: use entre 100 e 6000 mm.`);
  }
  return valor;
}

function lerMedida(texto: string, nome: string): Dmm {
  try {
    return lerMm(texto);
  } catch (e) {
    if (e instanceof ErroMedida) throw new ErroCampo(`${nome}: ${e.message}`);
    throw e;
  }
}

export function lerTipoMaterial(texto: string): TipoMaterial {
  const n = normalizarColuna(texto);
  if (n === 'mdf' || n === 'mdp' || n === 'compensado' || n === 'hdf') return n;
  if (n === 'outro' || n === 'outros' || n === 'personalizado') return 'outro';
  throw new ErroCampo(`Tipo: "${texto}" não é válido. Use MDF, MDP, Compensado, HDF ou Outro.`);
}

export function lerVeio(texto: string): DirecaoVeio {
  const n = normalizarColuna(texto);
  if (['nao', 'n', 'sem', 'sem_veio', 'nenhum'].includes(n)) return 'sem_veio';
  if (['sim', 's', 'comprimento', 'no_comprimento', 'longitudinal'].includes(n)) return 'comprimento';
  if (['largura', 'na_largura', 'transversal'].includes(n)) return 'largura';
  throw new ErroCampo(`Veio: "${texto}" não é válido. Use "sem veio", "comprimento" ou "largura".`);
}

export function lerPrecoChapa(texto: string): number {
  const valor = lerPrecoCentavos(texto, 'Preço da chapa');
  if (valor > LIMITES_MATERIAL.precoMaxCentavos) throw new ErroCampo('Preço da chapa: valor alto demais.');
  return valor;
}

type ChaveMaterial =
  | 'tipo'
  | 'nome'
  | 'fabricante'
  | 'cor_padrao'
  | 'espessura'
  | 'espessura_real'
  | 'veio'
  | 'comprimento'
  | 'largura'
  | 'preco'
  | 'fornecedor'
  | 'estoque';

export const COLUNAS_MATERIAIS: readonly DefinicaoColuna<ChaveMaterial>[] = [
  { chave: 'tipo', titulo: 'tipo', apelidos: ['tipo_material'], obrigatoria: true, exemplo: 'MDF', ajuda: 'MDF, MDP, Compensado, HDF ou Outro' },
  { chave: 'nome', titulo: 'nome', apelidos: ['material', 'descricao'], obrigatoria: true, exemplo: 'MDF Branco TX', ajuda: 'Nome do material; com a espessura, identifica o cadastro' },
  { chave: 'fabricante', titulo: 'fabricante', apelidos: ['marca'], obrigatoria: false, exemplo: '', ajuda: 'Opcional' },
  { chave: 'cor_padrao', titulo: 'cor_padrao', apelidos: ['cor', 'padrao', 'cor_e_padrao', 'acabamento'], obrigatoria: false, exemplo: 'Branco TX', ajuda: 'Opcional' },
  { chave: 'espessura', titulo: 'espessura_mm', apelidos: ['espessura', 'espessura_nominal', 'espessura_nominal_mm'], obrigatoria: true, exemplo: '18', ajuda: 'Em mm, como no catálogo: 6, 9, 15, 18, 25' },
  { chave: 'espessura_real', titulo: 'espessura_real_mm', apelidos: ['espessura_real', 'espessura_medida'], obrigatoria: false, exemplo: '', ajuda: 'Opcional. Medida com paquímetro (ex.: 18,3); o cálculo usa esta' },
  { chave: 'veio', titulo: 'veio', apelidos: ['direcao_do_veio', 'direcao_veio'], obrigatoria: false, exemplo: 'sem veio', ajuda: '"sem veio", "comprimento" ou "largura" da chapa' },
  { chave: 'comprimento', titulo: 'comprimento_chapa_mm', apelidos: ['comprimento', 'comprimento_mm'], obrigatoria: false, exemplo: '2750', ajuda: 'Tamanho da chapa em mm, sem ponto de milhar' },
  { chave: 'largura', titulo: 'largura_chapa_mm', apelidos: ['largura', 'largura_mm'], obrigatoria: false, exemplo: '1850', ajuda: 'Tamanho da chapa em mm, sem ponto de milhar' },
  { chave: 'preco', titulo: 'preco_chapa', apelidos: ['preco', 'preco_por_chapa', 'valor', 'preco_r'], obrigatoria: false, exemplo: '', ajuda: 'Em reais (ex.: 329,90). Vazio = não altera' },
  { chave: 'fornecedor', titulo: 'fornecedor', apelidos: ['distribuidor'], obrigatoria: false, exemplo: '', ajuda: 'Nome; é criado se ainda não existir' },
  { chave: 'estoque', titulo: 'estoque_chapas', apelidos: ['estoque', 'quantidade', 'qtd', 'saldo'], obrigatoria: false, exemplo: '', ajuda: 'Chapas inteiras em estoque. Vazio = não altera' },
];

/** Linha pronta para a função importar_materiais do banco. */
export interface LinhaMaterial {
  linha: number;
  tipo: TipoMaterial;
  nome: string;
  fabricante?: string;
  cor_padrao?: string;
  espessura_nominal_dmm: number;
  espessura_real_dmm?: number;
  veio?: DirecaoVeio;
  observacoes?: string;
  comprimento_dmm?: number;
  largura_dmm?: number;
  preco_centavos?: number;
  fornecedor?: string;
  estoque?: number;
}

export function validarPlanilhaMateriais(texto: string): ResultadoPlanilha<LinhaMaterial> {
  const vistos = new Map<string, number>();

  return processarPlanilha(texto, COLUNAS_MATERIAIS, (ler, linha, msgs) => {
    const tipo = coletar(msgs, () => lerTipoMaterial(textoLimitado(ler('tipo'), 'Tipo', 1, 40)));
    const nome = coletar(msgs, () => textoLimitado(ler('nome'), 'Nome', 2, 160));
    const fabricante = coletar(msgs, () => opcional(ler('fabricante'), (v) => textoLimitado(v, 'Fabricante', 1, 80)));
    const cor = coletar(msgs, () => opcional(ler('cor_padrao'), (v) => textoLimitado(v, 'Cor/padrão', 1, 80)));
    const espessura = coletar(msgs, () => lerEspessuraMaterial(textoLimitado(ler('espessura'), 'Espessura', 1, 20)));
    const real = coletar(msgs, () =>
      opcional(ler('espessura_real'), (v) => {
        const r = lerMedida(v, 'Espessura real');
        if (r <= 0) throw new ErroCampo('Espessura real: precisa ser maior que zero.');
        return r;
      }),
    );
    const veio = coletar(msgs, () => opcional(ler('veio'), lerVeio));
    const comprimento = coletar(msgs, () => opcional(ler('comprimento'), (v) => lerMedidaChapa(v, 'Comprimento da chapa')));
    const largura = coletar(msgs, () => opcional(ler('largura'), (v) => lerMedidaChapa(v, 'Largura da chapa')));
    const preco = coletar(msgs, () => opcional(ler('preco'), lerPrecoChapa));
    const fornecedor = coletar(msgs, () => opcional(ler('fornecedor'), (v) => textoLimitado(v, 'Fornecedor', 2, 160)));
    const estoque = coletar(msgs, () =>
      opcional(ler('estoque'), (v) => {
        const n = lerInteiroNaoNegativo(v, 'Estoque');
        if (n > LIMITES_MATERIAL.estoqueMax) throw new ErroCampo('Estoque: quantidade alta demais.');
        return n;
      }),
    );

    if (espessura !== undefined && real !== undefined) coletar(msgs, () => conferirEspessuraReal(espessura, real));

    const temChapa = ler('comprimento') !== '' || ler('largura') !== '';
    if (temChapa && (ler('comprimento') === '' || ler('largura') === '')) {
      msgs.push('Chapa: informe comprimento e largura juntos.');
    }
    if (!temChapa && (ler('preco') !== '' || ler('estoque') !== '')) {
      msgs.push('Preço e estoque são do formato de chapa: informe também comprimento e largura.');
    }

    if (msgs.length > 0 || !tipo || !nome || espessura === undefined) return null;

    const chave = [nome.toLowerCase(), espessura, comprimento ?? '', largura ?? ''].join('|');
    const repetida = vistos.get(chave);
    if (repetida !== undefined) {
      msgs.push(`Repete a linha ${repetida} (mesmo material, espessura e tamanho de chapa).`);
      return null;
    }
    vistos.set(chave, linha);

    return {
      linha,
      tipo,
      nome,
      fabricante,
      cor_padrao: cor,
      espessura_nominal_dmm: espessura,
      espessura_real_dmm: real,
      veio,
      comprimento_dmm: comprimento,
      largura_dmm: largura,
      preco_centavos: preco,
      fornecedor,
      estoque,
    };
  });
}

export function modeloCsvMateriais(): string {
  return modeloCsv(COLUNAS_MATERIAIS, [
    ['MDF', 'MDF Branco TX', '', 'Branco TX', '18', '', 'sem veio', '2750', '1850', '', '', ''],
    ['MDF', 'MDF Branco TX', '', 'Branco TX', '6', '', 'sem veio', '2750', '1850', '', '', ''],
    ['MDF', 'MDF Carvalho', '', 'Carvalho', '18', '', 'comprimento', '2750', '1850', '', '', ''],
  ]);
}
