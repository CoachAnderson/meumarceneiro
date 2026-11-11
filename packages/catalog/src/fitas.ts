import { ErroMedida, lerMm, mm, type Dmm } from '@marcenaria/core';
import { ErroCampo, lerEspessuraCmm, lerMetrosEmDmm, lerPrecoCentavos } from './numeros';
import { coletar, modeloCsv, opcional, processarPlanilha, textoLimitado, type DefinicaoColuna, type ResultadoPlanilha } from './planilha';

/** Limites — iguais aos do banco (migration da Fase 2). */
export const LIMITES_FITA = {
  larguraMin: mm(5),
  larguraMax: mm(100),
  espessuraMinCmm: 10, // 0,10 mm
  espessuraMaxCmm: 1000, // 10 mm
  roloMinDmm: 10_000, // 1 m
  roloMaxDmm: 10_000_000, // 1000 m
  precoMetroMaxCentavos: 10_000_000,
  estoqueMaxDmm: 1_000_000_000, // 100 km
} as const;

export function lerLarguraFita(texto: string): Dmm {
  let valor: Dmm;
  try {
    valor = lerMm(texto);
  } catch (e) {
    if (e instanceof ErroMedida) throw new ErroCampo(`Largura da fita: ${e.message}`);
    throw e;
  }
  if (valor < LIMITES_FITA.larguraMin || valor > LIMITES_FITA.larguraMax) {
    throw new ErroCampo('Largura da fita: use entre 5 e 100 mm.');
  }
  return valor;
}

export function lerEspessuraFita(texto: string): number {
  const valor = lerEspessuraCmm(texto, 'Espessura da fita');
  if (valor < LIMITES_FITA.espessuraMinCmm || valor > LIMITES_FITA.espessuraMaxCmm) {
    throw new ErroCampo('Espessura da fita: use entre 0,10 e 10 mm.');
  }
  return valor;
}

export function lerRoloMetros(texto: string): number {
  const valor = lerMetrosEmDmm(texto, 'Metros por rolo');
  if (valor < LIMITES_FITA.roloMinDmm || valor > LIMITES_FITA.roloMaxDmm) {
    throw new ErroCampo('Metros por rolo: use entre 1 e 1000 m.');
  }
  return valor;
}

export function lerPrecoMetro(texto: string): number {
  const valor = lerPrecoCentavos(texto, 'Preço por metro');
  if (valor > LIMITES_FITA.precoMetroMaxCentavos) throw new ErroCampo('Preço por metro: valor alto demais.');
  return valor;
}

export function lerEstoqueMetros(texto: string): number {
  const valor = lerMetrosEmDmm(texto, 'Estoque (m)');
  if (valor > LIMITES_FITA.estoqueMaxDmm) throw new ErroCampo('Estoque (m): quantidade alta demais.');
  return valor;
}

type ChaveFita = 'nome' | 'fabricante' | 'cor_padrao' | 'largura' | 'espessura' | 'rolo' | 'preco' | 'fornecedor' | 'estoque';

export const COLUNAS_FITAS: readonly DefinicaoColuna<ChaveFita>[] = [
  { chave: 'nome', titulo: 'nome', apelidos: ['fita', 'descricao'], obrigatoria: true, exemplo: 'Fita Branco TX 22x0,45', ajuda: 'Com largura e espessura, identifica o cadastro' },
  { chave: 'fabricante', titulo: 'fabricante', apelidos: ['marca'], obrigatoria: false, exemplo: '', ajuda: 'Opcional' },
  { chave: 'cor_padrao', titulo: 'cor_padrao', apelidos: ['cor', 'padrao', 'cor_e_padrao'], obrigatoria: false, exemplo: 'Branco TX', ajuda: 'Opcional' },
  { chave: 'largura', titulo: 'largura_mm', apelidos: ['largura'], obrigatoria: true, exemplo: '22', ajuda: 'Em mm' },
  { chave: 'espessura', titulo: 'espessura_mm', apelidos: ['espessura'], obrigatoria: true, exemplo: '0,45', ajuda: 'Em mm, até duas casas (0,45; 1; 2)' },
  { chave: 'rolo', titulo: 'metros_por_rolo', apelidos: ['rolo', 'rolo_m', 'comprimento_rolo_m', 'comprimento_do_rolo'], obrigatoria: false, exemplo: '', ajuda: 'Opcional, em metros' },
  { chave: 'preco', titulo: 'preco_metro', apelidos: ['preco', 'preco_por_metro', 'valor_metro', 'valor'], obrigatoria: false, exemplo: '', ajuda: 'Em reais por metro. Vazio = não altera' },
  { chave: 'fornecedor', titulo: 'fornecedor', apelidos: ['distribuidor'], obrigatoria: false, exemplo: '', ajuda: 'Nome; é criado se ainda não existir' },
  { chave: 'estoque', titulo: 'estoque_metros', apelidos: ['estoque', 'estoque_m', 'metros', 'saldo'], obrigatoria: false, exemplo: '', ajuda: 'Metros em estoque. Vazio = não altera' },
];

/** Linha pronta para a função importar_fitas do banco. */
export interface LinhaFita {
  linha: number;
  nome: string;
  fabricante?: string;
  cor_padrao?: string;
  largura_dmm: number;
  espessura_cmm: number;
  comprimento_rolo_dmm?: number;
  preco_metro_centavos?: number;
  fornecedor?: string;
  estoque_dmm?: number;
}

export function validarPlanilhaFitas(texto: string): ResultadoPlanilha<LinhaFita> {
  const vistos = new Map<string, number>();

  return processarPlanilha(texto, COLUNAS_FITAS, (ler, linha, msgs) => {
    const nome = coletar(msgs, () => textoLimitado(ler('nome'), 'Nome', 2, 160));
    const fabricante = coletar(msgs, () => opcional(ler('fabricante'), (v) => textoLimitado(v, 'Fabricante', 1, 80)));
    const cor = coletar(msgs, () => opcional(ler('cor_padrao'), (v) => textoLimitado(v, 'Cor/padrão', 1, 80)));
    const largura = coletar(msgs, () => lerLarguraFita(textoLimitado(ler('largura'), 'Largura da fita', 1, 20)));
    const espessura = coletar(msgs, () => lerEspessuraFita(textoLimitado(ler('espessura'), 'Espessura da fita', 1, 20)));
    const rolo = coletar(msgs, () => opcional(ler('rolo'), lerRoloMetros));
    const preco = coletar(msgs, () => opcional(ler('preco'), lerPrecoMetro));
    const fornecedor = coletar(msgs, () => opcional(ler('fornecedor'), (v) => textoLimitado(v, 'Fornecedor', 2, 160)));
    const estoque = coletar(msgs, () => opcional(ler('estoque'), lerEstoqueMetros));

    if (msgs.length > 0 || !nome || largura === undefined || espessura === undefined) return null;

    const chave = [nome.toLowerCase(), largura, espessura].join('|');
    const repetida = vistos.get(chave);
    if (repetida !== undefined) {
      msgs.push(`Repete a linha ${repetida} (mesma fita, largura e espessura).`);
      return null;
    }
    vistos.set(chave, linha);

    return {
      linha,
      nome,
      fabricante,
      cor_padrao: cor,
      largura_dmm: largura,
      espessura_cmm: espessura,
      comprimento_rolo_dmm: rolo,
      preco_metro_centavos: preco,
      fornecedor,
      estoque_dmm: estoque,
    };
  });
}

export function modeloCsvFitas(): string {
  return modeloCsv(COLUNAS_FITAS, [
    ['Fita Branco TX 22x0,45', '', 'Branco TX', '22', '0,45', '', '', '', ''],
    ['Fita Branco TX 22x1', '', 'Branco TX', '22', '1', '', '', '', ''],
  ]);
}
