import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as motor from '../src/marceneiro';
import { tratar, type Buscar, type Dependencias, type Resposta } from '../../../supabase/functions/marceneiro-virtual/tratar';

/**
 * Função de servidor do marceneiro virtual, com a IA e o banco SIMULADOS.
 * Testa a lógica (modos, validação, erros do banco, registro de uso). Não
 * testa a qualidade da conversa: isso depende da IA real.
 */

const FONTE = new URL('../src/marceneiro.ts', import.meta.url);
const COPIA = new URL('../../../supabase/functions/marceneiro-virtual/ficha.ts', import.meta.url);
const CABECALHO = '// Gerado a partir de packages/core/src/marceneiro.ts. Não edite à mão: rode GERAR=1 npm test.\n';

describe('arquivo da função em dia com o motor', () => {
  it('ficha.ts é cópia do motor (GERAR=1 regrava)', () => {
    const esperado = CABECALHO + readFileSync(FONTE, 'utf8');
    if (process.env.GERAR === '1' || !existsSync(COPIA)) writeFileSync(COPIA, esperado);
    expect(readFileSync(COPIA, 'utf8')).toBe(esperado);
  });
});

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const APRESENTACAO = '33333333-3333-4333-8333-333333333333';
const PERGUNTA = '22222222-2222-4222-8222-222222222222';
const FICHA: motor.FichaMovel = {
  versao: 1,
  marcenaria: 'Marcenaria A',
  titulo: 'Mesa',
  tipo: 'Mesa com pés comprados',
  largura: 1200,
  altura: 750,
  profundidade: 800,
  materiais: ['MDF 18 mm (estrutura)'],
  totalPecas: 2,
  composicao: ['4 pés comprados prontos'],
  ferragens: ['4 × Pé de mesa com chapa de fixação 732 mm'],
  precoCentavos: 235000,
  prazoDias: null,
  observacoes: '',
};

interface Chamada {
  url: string;
  headers: Record<string, string>;
  corpo: Record<string, unknown>;
}

const resp = (status: number, corpo: unknown): Resposta => ({ ok: status < 300, status, json: async () => corpo, text: async () => JSON.stringify(corpo) });

/** Banco e IA de mentira. `banco` responde por nome de função; `ia` devolve a resposta da IA. */
function simular(banco: Record<string, () => Resposta>, ia: () => Resposta = () => respostaIA({ resposta: 'Tem 750 milímetros de altura.' })) {
  const chamadas: Chamada[] = [];
  const buscar: Buscar = async (url, init) => {
    chamadas.push({ url, headers: init.headers, corpo: JSON.parse(init.body) });
    if (url.startsWith('https://api.anthropic.com/')) return ia();
    const nome = url.split('/rpc/')[1]!;
    const f = banco[nome];
    if (!f) throw new Error(`rpc inesperada: ${nome}`);
    return f();
  };
  const deps: Dependencias = { buscar, supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', chaveServico: 'servico', chaveIA: 'chave-ia', modelo: 'modelo-x', regras: motor };
  const rpcs = () => chamadas.filter((c) => c.url.includes('/rpc/'));
  return { deps, chamadas, rpcs };
}

function respostaIA(entrada: Record<string, unknown>, extra: Record<string, unknown> = {}): Resposta {
  return resp(200, {
    content: [{ type: 'tool_use', name: 'responder_cliente', input: { encaminhar: false, ajuste_largura_mm: 0, ajuste_altura_mm: 0, ajuste_profundidade_mm: 0, ...entrada } }],
    usage: { input_tokens: 900, output_tokens: 60 },
    ...extra,
  });
}

const okLink = () => resp(200, { pergunta_id: PERGUNTA, nome: 'Seu Zé', ficha: FICHA, restantes: 39 });
const okConcluir = () => resp(204, null);
const link = (extra: Record<string, unknown> = {}) => ({ metodo: 'POST', autorizacao: 'Bearer anon', corpo: { modo: 'link', empresaId: EMPRESA, apresentacaoId: APRESENTACAO, pergunta: 'Qual a altura?', ...extra } });
const editor = (extra: Record<string, unknown> = {}) => ({ metodo: 'POST', autorizacao: 'Bearer usuario', corpo: { modo: 'editor', empresaId: EMPRESA, ficha: FICHA, nome: 'Seu Zé', pergunta: 'Qual a altura?', ...extra } });

describe('abrir o link', () => {
  it('devolve nome e saudação montada sem IA, com a chave de serviço', async () => {
    const s = simular({ abrir_apresentacao: () => resp(200, { nome: 'Seu Zé', ficha: FICHA, restantes: 40 }) });
    const r = await tratar({ metodo: 'POST', autorizacao: null, corpo: { modo: 'abrir', empresaId: EMPRESA, apresentacaoId: APRESENTACAO } }, s.deps);
    expect(r).toEqual({ status: 200, corpo: { nome: 'Seu Zé', saudacao: motor.saudacaoMarceneiro(FICHA, 'Seu Zé'), temPreco: true, restantes: 40 } });
    expect(s.chamadas.some((c) => c.url.includes('anthropic'))).toBe(false);
    expect(s.rpcs()[0]!.corpo).toEqual({ p_empresa: EMPRESA, p_id: APRESENTACAO });
    expect(s.rpcs()[0]!.headers).toEqual({ 'content-type': 'application/json', apikey: 'servico' });
  });

  it('link vencido, desligado ou de outra empresa (o banco devolve null): 404', async () => {
    const s = simular({ abrir_apresentacao: () => resp(200, null) });
    const r = await tratar({ metodo: 'POST', autorizacao: null, corpo: { modo: 'abrir', empresaId: EMPRESA, apresentacaoId: APRESENTACAO } }, s.deps);
    expect(r.status).toBe(404);
    expect(r.corpo.codigo).toBe('marceneiro_indisponivel');
  });

  it('identificadores inválidos nem chegam ao banco', async () => {
    const s = simular({});
    for (const corpo of [{ modo: 'abrir', empresaId: 'x', apresentacaoId: APRESENTACAO }, { modo: 'abrir', empresaId: EMPRESA }, { modo: 'outro' }, null]) {
      expect((await tratar({ metodo: 'POST', autorizacao: null, corpo }, s.deps)).status).toBe(400);
    }
    expect((await tratar({ metodo: 'GET', autorizacao: null, corpo: {} }, s.deps)).status).toBe(405);
    expect(s.chamadas).toEqual([]);
  });
});

describe('pergunta pelo link', () => {
  it('reserva, pergunta à IA com a ficha do banco e encerra como concluída', async () => {
    const s = simular({ iniciar_pergunta_link: okLink, concluir_pergunta_marceneiro: okConcluir });
    const r = await tratar(link({ historico: [{ papel: 'marceneiro', texto: 'Olá!' }] }), s.deps);
    expect(r).toEqual({ status: 200, corpo: { resposta: 'Tem 750 milímetros de altura.', encaminhar: false, ajuste: null, restantes: 39 } });

    const ia = s.chamadas.find((c) => c.url.includes('anthropic'))!;
    expect(ia.headers['x-api-key']).toBe('chave-ia');
    expect(ia.corpo.model).toBe('modelo-x');
    expect(ia.corpo.system).toBe(`${motor.instrucoesMarceneiro('Seu Zé', 'link')}\n\nFICHA DO MÓVEL:\n${motor.textoDaFicha(FICHA)}`);
    expect(ia.corpo.messages).toEqual([{ role: 'user', content: 'Qual a altura?' }]);

    const [inicio, fim] = s.rpcs();
    expect(inicio!.corpo).toEqual({ p_empresa: EMPRESA, p_apresentacao: APRESENTACAO });
    expect(inicio!.headers).toEqual({ 'content-type': 'application/json', apikey: 'servico' });
    expect(fim!.corpo).toEqual({ p_id: PERGUNTA, p_status: 'concluida', p_modelo: 'modelo-x', p_tokens_entrada: 900, p_tokens_saida: 60 });
    expect(fim!.headers.apikey).toBe('servico');
  });

  it('a ficha enviada pelo navegador é ignorada no link: vale a do banco', async () => {
    const s = simular({ iniciar_pergunta_link: okLink, concluir_pergunta_marceneiro: okConcluir });
    await tratar(link({ ficha: { ...FICHA, precoCentavos: 1 } }), s.deps);
    const ia = s.chamadas.find((c) => c.url.includes('anthropic'))!;
    expect(ia.corpo.system).toContain('R$ 2.350,00');
    expect(ia.corpo.system).not.toContain('R$ 0,01');
  });

  it('erros do banco viram mensagens claras, sem chamar a IA', async () => {
    for (const [hint, status] of [['limite_link', 429], ['cota_marceneiro', 429], ['devagar', 429], ['marceneiro_indisponivel', 404], ['assinatura', 403]] as const) {
      const s = simular({ iniciar_pergunta_link: () => resp(400, { code: 'P0001', hint, message: 'x' }) });
      const r = await tratar(link(), s.deps);
      expect([r.status, r.corpo.codigo], hint).toEqual([status, hint]);
      expect(s.chamadas.some((c) => c.url.includes('anthropic'))).toBe(false);
    }
  });

  it('IA fora do ar ou com erro: encerra como falha (devolve a pergunta ao link)', async () => {
    const fora = simular({ iniciar_pergunta_link: okLink, concluir_pergunta_marceneiro: okConcluir }, () => {
      throw new Error('rede');
    });
    expect((await tratar(link(), fora.deps)).corpo.codigo).toBe('ia_indisponivel');
    expect(fora.rpcs()[1]!.corpo.p_status).toBe('falhou');

    const erro = simular({ iniciar_pergunta_link: okLink, concluir_pergunta_marceneiro: okConcluir }, () => resp(529, {}));
    expect((await tratar(link(), erro.deps)).corpo.codigo).toBe('ia_erro');
    expect(erro.rpcs()[1]!.corpo.p_status).toBe('falhou');

    const vazia = simular({ iniciar_pergunta_link: okLink, concluir_pergunta_marceneiro: okConcluir }, () => resp(200, { content: [], usage: { input_tokens: 10, output_tokens: 0 } }));
    expect((await tratar(link(), vazia.deps)).corpo.codigo).toBe('sem_resposta');
    expect(vazia.rpcs()[1]!.corpo).toMatchObject({ p_status: 'falhou', p_tokens_entrada: 10 });
  });

  it('pedido de outro tamanho volta como ajuste e encaminhado', async () => {
    const s = simular({ iniciar_pergunta_link: okLink, concluir_pergunta_marceneiro: okConcluir }, () => respostaIA({ resposta: 'Anotei: 1.600 milímetros.', ajuste_largura_mm: 1600 }));
    expect((await tratar(link({ pergunta: 'Cabe uma de 1,60?' }), s.deps)).corpo).toEqual({ resposta: 'Anotei: 1.600 milímetros.', encaminhar: true, ajuste: { largura: 1600 }, restantes: 39 });
  });

  it('sem chave da IA: 503 antes de reservar', async () => {
    const s = simular({});
    const r = await tratar(link(), { ...s.deps, chaveIA: '' });
    expect([r.status, r.corpo.codigo]).toEqual([503, 'sem_chave']);
    expect(s.chamadas).toEqual([]);
  });

  it('pergunta vazia ou longa demais: 400 sem gastar nada', async () => {
    const s = simular({});
    expect((await tratar(link({ pergunta: '' }), s.deps)).status).toBe(400);
    expect((await tratar(link({ pergunta: 'x'.repeat(401) }), s.deps)).status).toBe(400);
    expect(s.chamadas).toEqual([]);
  });
});

describe('pergunta pelo editor', () => {
  it('usa o token do usuário e a ficha do navegador', async () => {
    const s = simular({ iniciar_pergunta_editor: () => resp(200, PERGUNTA), concluir_pergunta_marceneiro: okConcluir });
    const r = await tratar(editor(), s.deps);
    expect(r.status).toBe(200);
    const [inicio, fim] = s.rpcs();
    expect(inicio!.corpo).toEqual({ p_empresa: EMPRESA });
    expect(inicio!.headers).toMatchObject({ apikey: 'anon', authorization: 'Bearer usuario' });
    expect(fim!.headers.authorization).toBe('Bearer usuario');
    const ia = s.chamadas.find((c) => c.url.includes('anthropic'))!;
    expect(ia.corpo.system).toContain(motor.instrucoesMarceneiro('Seu Zé', 'editor'));
  });

  it('sem login, ficha inválida ou nome inválido: recusa antes do banco', async () => {
    const s = simular({});
    expect((await tratar({ ...editor(), autorizacao: null }, s.deps)).status).toBe(401);
    expect((await tratar(editor({ ficha: { ...FICHA, largura: -1 } }), s.deps)).corpo.codigo).toBe('ficha');
    expect((await tratar(editor({ nome: '' }), s.deps)).corpo.codigo).toBe('nome');
    expect((await tratar(editor({ nome: 'x'.repeat(41) }), s.deps)).corpo.codigo).toBe('nome');
    expect(s.chamadas).toEqual([]);
  });

  it('sessão expirada e falta de permissão', async () => {
    const expirada = simular({ iniciar_pergunta_editor: () => resp(401, { code: 'PGRST301' }) });
    expect((await tratar(editor(), expirada.deps)).status).toBe(401);
    const proibido = simular({ iniciar_pergunta_editor: () => resp(403, { code: '42501' }) });
    expect((await tratar(editor(), proibido.deps)).status).toBe(403);
  });
});
