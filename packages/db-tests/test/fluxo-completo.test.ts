import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  calcularModulo,
  calcularOrcamento,
  gerarListaPecas,
  juntarFerragens,
  medidaDeCorte,
  mm,
  modeloPadrao,
  otimizarCorte,
  verificarPlano,
  type ChapaDisponivel,
  type ParametrosCorte,
  type PecaCorte,
} from '@marcenaria/core';
import { SessaoTeste, type Usuario } from '../src/sessao';

/**
 * Fase 10 — o caminho inteiro, com o motor de verdade e o banco de verdade:
 * módulo → lista de peças → plano de corte → orçamento → projeto salvo →
 * orçamento emitido → ordem de produção → baixa de estoque.
 * Confere que os números de uma etapa são os que chegam na seguinte.
 */

let s: SessaoTeste;
let ana: Usuario;
let empresa: string;

async function um<T>(p: Promise<T[]>): Promise<T> {
  const l = await p;
  if (!l[0]) throw new Error('Nenhuma linha retornada.');
  return l[0];
}
const id = async (sql: string, params: unknown[]) => (await um(s.exigir<{ id: string }>(ana, sql, params))).id;
const saldo = async (coluna: string, item: string) => Number((await um(s.exigir<{ saldo: string }>(ana, `select saldo from public.estoque_saldos where ${coluna} = $1`, [item]))).saldo);

beforeAll(async () => {
  s = await SessaoTeste.abrir();
  ana = await s.criarUsuario('ana@fluxo.test', 'Ana');
  empresa = await id(`select public.criar_empresa('Marcenaria Fluxo') as id`, []);
});
afterAll(async () => {
  await s?.fechar();
});

describe('do módulo à baixa de estoque', () => {
  it('os números batem em todas as etapas', async () => {
    // ---- Catálogo e estoque
    const material = await id(`insert into public.materiais (empresa_id, tipo, nome, espessura_nominal_dmm) values ($1, 'mdf', 'MDF Branco', 180) returning id`, [empresa]);
    const fundo = await id(`insert into public.materiais (empresa_id, tipo, nome, espessura_nominal_dmm) values ($1, 'mdf', 'MDF Branco', 60) returning id`, [empresa]);
    const chapa18 = await id(`insert into public.chapas (empresa_id, material_id, comprimento_dmm, largura_dmm, preco_centavos) values ($1, $2, 27500, 18500, 32990) returning id`, [empresa, material]);
    const chapa6 = await id(`insert into public.chapas (empresa_id, material_id, comprimento_dmm, largura_dmm, preco_centavos) values ($1, $2, 27500, 18500, 14990) returning id`, [empresa, fundo]);
    const fita = await id(`insert into public.fitas (empresa_id, nome, largura_dmm, espessura_cmm, preco_metro_centavos) values ($1, 'Fita Branco', 220, 45, 89) returning id`, [empresa]);
    const dobradica = await id(`insert into public.ferragens (empresa_id, tipo, nome, preco_centavos) values ($1, 'dobradica_reta', 'Dobradiça reta', 690) returning id`, [empresa]);
    const puxador = await id(`insert into public.ferragens (empresa_id, tipo, nome, preco_centavos) values ($1, 'puxador', 'Puxador', 1450) returning id`, [empresa]);
    await s.exigir(ana, `select public.definir_estoque(p_chapa => $1, p_saldo => 10)`, [chapa18]);
    await s.exigir(ana, `select public.definir_estoque(p_chapa => $1, p_saldo => 10)`, [chapa6]);
    await s.exigir(ana, `select public.definir_estoque(p_fita => $1, p_saldo => 1000000)`, [fita]);
    await s.exigir(ana, `select public.definir_estoque_ferragem($1, 50)`, [dobradica]);
    await s.exigir(ana, `select public.definir_estoque_ferragem($1, 50)`, [puxador]);

    // ---- Motor: módulo com par de portas, 3 módulos iguais
    const MODULOS = 3;
    const entrada = { L: mm(800), A: mm(720), P: mm(550), espessuraEstrutura: mm(18), espessuraFundo: mm(6) };
    const resultado = calcularModulo(modeloPadrao('tampo_base_entre_laterais', 'fundo_canal'), {
      ...entrada,
      interior: { divisorias: 0, prateleiras: { quantidade: 1, tipo: 'fixa' } },
      frentes: { modo: 'sobreposta', espessuraFrente: mm(18), espessuraGaveta: mm(15), vaos: { tipo: 'porta', portas: 2 } },
    });
    expect(resultado.erros).toEqual([]);
    const lista = gerarListaPecas({ resultado, montagem: 'tampo_base_entre_laterais', fundo: 'fundo_canal', espessuraFundo: mm(6), opcoes: { quantidadeModulos: MODULOS, sobraFitaPercentual: 10, veioEstrutura: false, veioFrente: false } });
    // 2 laterais, tampo, base, fundo, prateleira, 2 portas = 8 peças por módulo.
    expect(lista.totalPecas).toBe(8 * MODULOS);

    // ---- Plano de corte por material (portas no mesmo MDF 18)
    const p: ParametrosCorte = { serra: mm(4), refilo: mm(10), refiloRetalho: mm(5), sobraMinima: { comprimento: mm(300), largura: mm(100) }, veio: 'sem_veio' };
    const pecasDe = (materiais: string[]): PecaCorte[] =>
      lista.itens
        .filter((i) => materiais.includes(i.material))
        .map((i) => {
          const m = medidaDeCorte(i, { espessuraFitaCmm: 45 });
          return { id: i.codigo, nome: i.nome, comprimento: m.comprimento, largura: m.largura, quantidade: i.quantidade, veio: i.veio };
        });
    const chapaDisp = (cid: string): ChapaDisponivel[] => [{ id: cid, tipo: 'chapa', nome: '2750 × 1850', comprimento: mm(2750), largura: mm(1850), quantidade: null }];
    const pecas18 = pecasDe(['estrutura', 'frente']);
    const pecas6 = pecasDe(['fundo']);
    const plano18 = otimizarCorte(pecas18, chapaDisp(chapa18), p).plano!;
    const plano6 = otimizarCorte(pecas6, chapaDisp(chapa6), p).plano!;
    expect(verificarPlano(plano18, pecas18, chapaDisp(chapa18), p)).toEqual([]);
    expect(verificarPlano(plano6, pecas6, chapaDisp(chapa6), p)).toEqual([]);
    const pecasNoPlano = [plano18, plano6].reduce((t, pl) => t + pl.chapas.reduce((u, c) => u + c.pecas.length, 0), 0);
    expect(pecasNoPlano).toBe(lista.totalPecas);
    const n18 = plano18.chapas.length;
    const n6 = plano6.chapas.length;

    // ---- Orçamento
    const ferragens = juntarFerragens(resultado.ferragens, MODULOS);
    const qDob = ferragens.find((f) => f.codigo === 'dobradica_reta')!.quantidade;
    const qPux = ferragens.find((f) => f.codigo === 'puxador')!.quantidade;
    expect([qDob, qPux]).toEqual([4 * MODULOS, 2 * MODULOS]); // 2 portas × 2 dobradiças; 1 puxador por porta
    const orc = calcularOrcamento({
      chapas: [
        { descricao: 'MDF 18', quantidade: n18, precoCentavos: 32990 },
        { descricao: 'MDF 6', quantidade: n6, precoCentavos: 14990 },
      ],
      fitas: [{ descricao: 'Fita', comprimentoDmm: lista.fitaComSobraDmm, precoMetroCentavos: 89 }],
      ferragens: [
        { descricao: 'Dobradiça', quantidade: qDob, precoCentavos: 690 },
        { descricao: 'Puxador', quantidade: qPux, precoCentavos: 1450 },
      ],
      maoDeObra: { minutos: 480, valorHoraCentavos: 6000 },
      margemCentesimos: 4000,
    });
    expect(orc.pendencias).toEqual([]);
    const custoEsperado = n18 * 32990 + n6 * 14990 + Math.ceil((lista.fitaComSobraDmm * 89) / 10000) + qDob * 690 + qPux * 1450 + 48000;
    expect(orc.custoCentavos).toBe(custoEsperado);

    // ---- Banco: projeto, orçamento emitido, ordem, baixa
    const projeto = await id(`select public.criar_projeto($1, 'Armário de cozinha', null, $2::jsonb, 'tampo_base_entre_laterais@1+fundo_canal@1', true) as id`, [empresa, JSON.stringify({ L: '800', A: '720', P: '550' })]);
    const emitido = await um(
      s.exigir<{ numero: number; total_centavos: string }>(
        ana,
        `insert into public.orcamentos (empresa_id, numero, projeto_id, projeto_versao, projeto_nome, dados, custo_centavos, total_centavos, validade)
         values ($1, 1, $2, 1, 'Armário de cozinha', $3::jsonb, $4, $5, current_date + 15) returning numero, total_centavos`,
        [empresa, projeto, JSON.stringify({ linhas: orc.linhas }), orc.custoCentavos, orc.totalCentavos],
      ),
    );
    expect(emitido).toEqual({ numero: 1, total_centavos: String(orc.totalCentavos) });

    const consumo = {
      chapas: [
        { id: chapa18, quantidade: n18 },
        { id: chapa6, quantidade: n6 },
      ],
      fitas: [{ id: fita, dmm: lista.fitaComSobraDmm }],
      ferragens: [
        { id: dobradica, quantidade: qDob },
        { id: puxador, quantidade: qPux },
      ],
      retalhos: [],
      sobras: [...plano18.chapas.map((c) => ({ c, m: material })), ...plano6.chapas.map((c) => ({ c, m: fundo }))].flatMap(({ c, m }) =>
        c.retalhos.filter((r) => r.dx >= 500 && r.dy >= 500).map((r) => ({ material_id: m, comprimento_dmm: r.dx, largura_dmm: r.dy, quantidade: 1 })),
      ),
    };
    const ordem = await id(`insert into public.ordens_producao (empresa_id, numero, projeto_id, projeto_versao, projeto_nome, dados) values ($1, 1, $2, 1, 'Armário de cozinha', $3::jsonb) returning id`, [
      empresa,
      projeto,
      JSON.stringify({ consumo }),
    ]);
    const baixa = await um(s.exigir<{ r: { baixado: boolean; sobras_guardadas: number } }>(ana, `select public.baixar_estoque_ordem($1) as r`, [ordem]));
    expect(baixa.r.baixado).toBe(true);
    expect(baixa.r.sobras_guardadas).toBe(consumo.sobras.length);

    // ---- O estoque caiu exatamente o que o plano e a lista dizem
    expect(await saldo('chapa_id', chapa18)).toBe(10 - n18);
    expect(await saldo('chapa_id', chapa6)).toBe(10 - n6);
    expect(await saldo('fita_id', fita)).toBe(1000000 - lista.fitaComSobraDmm);
    expect(await saldo('ferragem_id', dobradica)).toBe(50 - qDob);
    expect(await saldo('ferragem_id', puxador)).toBe(50 - qPux);
    const retalhos = await s.exigir(ana, `select id from public.retalhos where empresa_id = $1`, [empresa]);
    expect(retalhos).toHaveLength(consumo.sobras.length);
  });
});
