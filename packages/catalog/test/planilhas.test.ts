import { describe, expect, it } from 'vitest';
import { modeloCsvFitas, modeloCsvMateriais, validarPlanilhaFitas, validarPlanilhaMateriais } from '../src';

describe('validarPlanilhaMateriais()', () => {
  it('converte uma planilha válida para as unidades do sistema', () => {
    const csv = [
      'Tipo;Nome;Fabricante;Cor e padrão;Espessura (mm);Espessura real (mm);Veio;Comprimento;Largura;Preço (R$);Fornecedor;Estoque',
      'MDF;MDF Branco TX;Fab X;Branco TX;18;18,3;sem veio;2750;1850;329,90;Madeireira;12',
      'mdp;MDP Cinza;;;15;;;;;;;',
      'Compensado;Compensado Naval;;;"9,5";;comprimento;2200;1600;"1.120,00";;0',
    ].join('\n');

    const r = validarPlanilhaMateriais(csv);
    expect(r.erroGeral).toBeNull();
    expect(r.erros).toEqual([]);
    expect(r.validas).toEqual([
      {
        linha: 2,
        tipo: 'mdf',
        nome: 'MDF Branco TX',
        fabricante: 'Fab X',
        cor_padrao: 'Branco TX',
        espessura_nominal_dmm: 180,
        espessura_real_dmm: 183,
        veio: 'sem_veio',
        comprimento_dmm: 27500,
        largura_dmm: 18500,
        preco_centavos: 32990,
        fornecedor: 'Madeireira',
        estoque: 12,
      },
      expect.objectContaining({ linha: 3, tipo: 'mdp', nome: 'MDP Cinza', espessura_nominal_dmm: 150, comprimento_dmm: undefined }),
      expect.objectContaining({ linha: 4, tipo: 'compensado', espessura_nominal_dmm: 95, veio: 'comprimento', preco_centavos: 112000, estoque: 0 }),
    ]);
  });

  it('aponta todos os erros de cada linha, com o número da linha', () => {
    const csv = [
      'tipo;nome;espessura_mm;espessura_real_mm;comprimento_chapa_mm;largura_chapa_mm;preco_chapa;estoque_chapas',
      'Madeira;X;0;;2.750;;abc;1,5', // tipo, nome curto, espessura 0, milhar, sem largura, preço, estoque fracionado
      'MDF;MDF Branco;18;183;;;;', // espessura real 183 mm: faltou a vírgula
      'MDF;MDF Branco;18;;;;329,90;', // preço sem chapa
      'MDF;MDF Branco;250;;;;;', // acima de 100 mm
      'MDF;MDF Branco;18;;80;1850;;', // chapa menor que 100 mm
    ].join('\n');

    const r = validarPlanilhaMateriais(csv);
    expect(r.validas).toEqual([]);
    expect(r.erros.map((e) => e.linha)).toEqual([2, 3, 4, 5, 6]);

    const linha2 = r.erros[0]?.mensagens.join(' | ') ?? '';
    expect(linha2).toContain('Tipo');
    expect(linha2).toContain('Nome');
    expect(linha2).toContain('Espessura');
    expect(linha2).toContain('sem separador de milhar');
    expect(linha2).toContain('Preço');
    expect(linha2).toContain('inteiro');
    expect(linha2).toContain('comprimento e largura juntos');

    expect(r.erros[1]?.mensagens.join()).toContain('faltou a vírgula');
    expect(r.erros[2]?.mensagens.join()).toContain('informe também comprimento e largura');
    expect(r.erros[3]?.mensagens.join()).toContain('entre 0,1 e 100 mm');
    expect(r.erros[4]?.mensagens.join()).toContain('entre 100 e 6000 mm');
  });

  it('acusa linha repetida dentro da planilha', () => {
    const csv = 'tipo;nome;espessura_mm;comprimento_chapa_mm;largura_chapa_mm\nMDF;MDF Preto;18;2750;1850\nMDF;mdf preto;18;2750;1850';
    const r = validarPlanilhaMateriais(csv);
    expect(r.validas).toHaveLength(1);
    expect(r.erros).toEqual([{ linha: 3, mensagens: ['Repete a linha 2 (mesmo material, espessura e tamanho de chapa).'] }]);
  });

  it('recusa a planilha sem colunas obrigatórias e lista colunas ignoradas', () => {
    const r = validarPlanilhaMateriais('nome;cor;observação\nMDF;Branco;x');
    expect(r.erroGeral).toContain('tipo');
    expect(r.erroGeral).toContain('espessura_mm');
    expect(r.colunasIgnoradas).toEqual(['observação']);
  });

  it('aceita CSV separado por vírgula com decimais entre aspas', () => {
    const r = validarPlanilhaMateriais('tipo,nome,espessura_mm\nMDF,MDF Branco,"18,5"');
    expect(r.validas[0]?.espessura_nominal_dmm).toBe(185);
  });

  it('o modelo baixado é aceito sem erros', () => {
    const r = validarPlanilhaMateriais(modeloCsvMateriais());
    expect(r.erroGeral).toBeNull();
    expect(r.erros).toEqual([]);
    expect(r.validas).toHaveLength(3);
  });
});

describe('validarPlanilhaFitas()', () => {
  it('converte largura, espessura, rolo, preço e estoque', () => {
    const r = validarPlanilhaFitas(
      'Nome;Cor;Largura (mm);Espessura (mm);Metros por rolo;Preço por metro;Fornecedor;Estoque (m)\n' +
        'Fita Branco TX;Branco TX;22;0,45;50;0,89;Madeireira;125,5\n' +
        'Fita Grossa;;35;2;;R$ 3,10;;',
    );
    expect(r.erros).toEqual([]);
    expect(r.validas).toEqual([
      {
        linha: 2,
        nome: 'Fita Branco TX',
        fabricante: undefined,
        cor_padrao: 'Branco TX',
        largura_dmm: 220,
        espessura_cmm: 45,
        comprimento_rolo_dmm: 500000,
        preco_metro_centavos: 89,
        fornecedor: 'Madeireira',
        estoque_dmm: 1255000,
      },
      expect.objectContaining({ linha: 3, largura_dmm: 350, espessura_cmm: 200, preco_metro_centavos: 310, estoque_dmm: undefined }),
    ]);
  });

  it('recusa medidas fora dos limites', () => {
    const r = validarPlanilhaFitas('nome;largura_mm;espessura_mm;metros_por_rolo\nFita;4;0,05;0,5\nFita B;22;0,455;');
    expect(r.erros[0]?.mensagens).toEqual([
      'Largura da fita: use entre 5 e 100 mm.',
      'Espessura da fita: use entre 0,10 e 10 mm.',
      'Metros por rolo: use entre 1 e 1000 m.',
    ]);
    expect(r.erros[1]?.mensagens.join()).toContain('2 casas');
  });

  it('o modelo baixado é aceito sem erros', () => {
    const r = validarPlanilhaFitas(modeloCsvFitas());
    expect(r.erros).toEqual([]);
    expect(r.validas).toHaveLength(2);
  });
});
