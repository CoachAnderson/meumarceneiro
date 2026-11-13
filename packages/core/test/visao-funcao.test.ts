import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FERRAMENTA_VISAO, INSTRUCOES_VISAO, pedidoVisao, validarLeitura } from '../src';
import { textoDoPedido, tratar, type Buscar, type Dependencias, type Resposta } from '../../../supabase/functions/visao-ia/tratar';

/**
 * Função de servidor da Visão IA, com a IA e o banco SIMULADOS.
 * Testa a lógica da função (validação do pedido, cota, erros, registro de
 * uso). Não testa a qualidade da leitura de fotos: isso depende da IA real.
 */

const ARQUIVO = new URL('../../../supabase/functions/visao-ia/ferramenta.ts', import.meta.url);
const ESPERADO = `// Gerado a partir de packages/core/src/visao.ts. Não edite à mão: rode GERAR=1 npm test.\nexport default ${JSON.stringify({ ferramenta: FERRAMENTA_VISAO, instrucoes: INSTRUCOES_VISAO }, null, 2)} as const;\n`;

describe('arquivos da função em dia com o motor', () => {
  it('ferramenta.ts é gerado do motor (GERAR=1 regrava)', () => {
    if (process.env.GERAR === '1' || !existsSync(ARQUIVO)) writeFileSync(ARQUIVO, ESPERADO);
    expect(readFileSync(ARQUIVO, 'utf8')).toBe(ESPERADO);
  });

  it('o texto do pedido é o mesmo do motor', () => {
    for (const [m, n] of [[{}, undefined], [{ largura: 800 }, 'porta de vidro'], [{ largura: 800, altura: 720, profundidade: 550 }, 'x'.repeat(900)]] as const) {
      expect(textoDoPedido(m, n)).toBe(pedidoVisao(m, n));
    }
  });
});

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const ANALISE = '22222222-2222-4222-8222-222222222222';
const IMAGEM = { tipo: 'image/jpeg', base64: 'A'.repeat(400) };
const LEITURA = {
  tipo_de_movel: 'Gabinete com 2 portas', montagem: 'tampo_base_entre_laterais', modo_frente: 'sobreposta',
  largura_mm: 800, altura_mm: 720, profundidade_mm: 550, origem_das_medidas: 'parciais', confianca: 'alta',
  vaos: [{ proporcao_largura: 1, frente: 'porta', portas: 2, lado_dobradicas: 'nao_se_aplica', gavetas: 0, prateleiras: 1 }],
  observacoes: [], nao_representado: [],
};

const resp = (status: number, corpo: unknown): Resposta => ({ ok: status >= 200 && status < 300, status, json: async () => corpo, text: async () => JSON.stringify(corpo) });

interface Chamada { url: string; headers: Record<string, string>; corpo: Record<string, unknown> }

function ambiente(opcoes: { iniciar?: Resposta; ia?: Resposta | 'erro_de_rede' } = {}) {
  const chamadas: Chamada[] = [];
  const buscar: Buscar = async (url, init) => {
    chamadas.push({ url, headers: init.headers, corpo: JSON.parse(init.body) });
    if (url.endsWith('/rpc/iniciar_analise_visao')) return opcoes.iniciar ?? resp(200, ANALISE);
    if (url.endsWith('/rpc/concluir_analise_visao')) return resp(204, null);
    if (url === 'https://api.anthropic.com/v1/messages') {
      if (opcoes.ia === 'erro_de_rede') throw new Error('rede');
      return opcoes.ia ?? resp(200, { content: [{ type: 'tool_use', id: 't1', name: FERRAMENTA_VISAO.name, input: LEITURA }], usage: { input_tokens: 1800, output_tokens: 240 }, stop_reason: 'tool_use' });
    }
    throw new Error(`chamada inesperada: ${url}`);
  };
  const deps: Dependencias = { buscar, supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', chaveIA: 'segredo', modelo: 'modelo-teste', ferramenta: FERRAMENTA_VISAO, instrucoes: INSTRUCOES_VISAO };
  const encerramento = () => chamadas.find((c) => c.url.endsWith('/rpc/concluir_analise_visao'))?.corpo;
  return { deps, chamadas, encerramento };
}

const pedido = (corpo: unknown, extra: Partial<{ metodo: string; autorizacao: string | null }> = {}) => ({ metodo: 'POST', autorizacao: 'Bearer token-do-usuario', corpo, ...extra });
const CORPO = { empresaId: EMPRESA, imagem: IMAGEM, medidas: { largura: 800 }, nota: 'cozinha' };

describe('caminho feliz', () => {
  it('reserva, chama a IA com imagem e ferramenta, encerra e devolve a leitura', async () => {
    const a = ambiente();
    const r = await tratar(pedido(CORPO), a.deps);
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ analiseId: ANALISE, leitura: LEITURA, modelo: 'modelo-teste' });
    // A leitura devolvida passa na validação do motor.
    expect(validarLeitura(r.corpo.leitura).ok).toBe(true);

    const [reserva, ia, fim] = a.chamadas;
    // Reserva com o token do usuário (as regras do banco valem para ele).
    expect(reserva!.headers.authorization).toBe('Bearer token-do-usuario');
    expect(reserva!.corpo).toEqual({ p_empresa: EMPRESA });
    // IA: chave só no cabeçalho, nunca o token do usuário.
    expect(ia!.headers['x-api-key']).toBe('segredo');
    expect(ia!.headers.authorization).toBeUndefined();
    expect(ia!.corpo).toMatchObject({ model: 'modelo-teste', tool_choice: { type: 'auto' }, tools: [{ name: FERRAMENTA_VISAO.name, strict: true }] });
    const conteudo = (ia!.corpo.messages as Array<{ content: Array<Record<string, unknown>> }>)[0]!.content;
    expect(conteudo[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMAGEM.base64 } });
    expect(conteudo[1]!.text).toContain('largura 800 mm');
    expect(fim!.corpo).toMatchObject({ p_id: ANALISE, p_status: 'concluida', p_tokens_entrada: 1800, p_tokens_saida: 240 });
  });
});

describe('pedido inválido não chega ao banco nem à IA', () => {
  const casos: Array<[string, unknown, Partial<{ metodo: string; autorizacao: string | null }>, number]> = [
    ['GET', CORPO, { metodo: 'GET' }, 405],
    ['sem login', CORPO, { autorizacao: null }, 401],
    ['corpo vazio', null, {}, 400],
    ['empresa inválida', { ...CORPO, empresaId: "1; drop table" }, {}, 400],
    ['tipo de arquivo', { ...CORPO, imagem: { tipo: 'application/pdf', base64: IMAGEM.base64 } }, {}, 400],
    ['base64 quebrado', { ...CORPO, imagem: { tipo: 'image/png', base64: '<script>'.repeat(30) } }, {}, 400],
    ['imagem grande', { ...CORPO, imagem: { tipo: 'image/png', base64: 'A'.repeat(7_000_004) } }, {}, 413],
    ['medida absurda', { ...CORPO, medidas: { largura: 99999 } }, {}, 400],
    ['medida não numérica', { ...CORPO, medidas: { altura: '720' } }, {}, 400],
  ];
  for (const [nome, corpo, extra, status] of casos) {
    it(nome, async () => {
      const a = ambiente();
      const r = await tratar(pedido(corpo, extra), a.deps);
      expect(r.status).toBe(status);
      expect(a.chamadas).toHaveLength(0);
    });
  }

  it('sem chave da IA configurada: avisa, sem gastar nada', async () => {
    const a = ambiente();
    const r = await tratar(pedido(CORPO), { ...a.deps, chaveIA: '' });
    expect(r.status).toBe(503);
    expect(a.chamadas).toHaveLength(0);
  });
});

describe('banco recusa', () => {
  it('cota esgotada: 429, sem chamar a IA', async () => {
    const a = ambiente({ iniciar: resp(400, { code: 'P0001', hint: 'cota_visao', message: 'A cota de análises de imagem deste mês acabou (30 por mês).' }) });
    const r = await tratar(pedido(CORPO), a.deps);
    expect(r.status).toBe(429);
    expect(r.corpo.erro).toContain('30 por mês');
    expect(a.chamadas).toHaveLength(1);
  });

  it('sem permissão: 403; sessão expirada: 401; nenhuma chama a IA', async () => {
    const a = ambiente({ iniciar: resp(403, { code: '42501' }) });
    expect((await tratar(pedido(CORPO), a.deps)).status).toBe(403);
    const b = ambiente({ iniciar: resp(401, { code: 'PGRST301' }) });
    expect((await tratar(pedido(CORPO), b.deps)).status).toBe(401);
    expect(a.chamadas.length + b.chamadas.length).toBe(2);
  });
});

describe('IA falha ou não vê móvel', () => {
  it('IA fora do ar: encerra como falha (não gasta cota)', async () => {
    const a = ambiente({ ia: 'erro_de_rede' });
    const r = await tratar(pedido(CORPO), a.deps);
    expect(r.status).toBe(502);
    expect(a.encerramento()).toMatchObject({ p_status: 'falhou' });
  });

  it('IA sobrecarregada (529): falha, com mensagem para tentar de novo', async () => {
    const a = ambiente({ ia: resp(529, { error: { type: 'overloaded_error' } }) });
    const r = await tratar(pedido(CORPO), a.deps);
    expect(r.status).toBe(502);
    expect(String(r.corpo.erro)).toContain('sobrecarregada');
    expect(a.encerramento()).toMatchObject({ p_status: 'falhou', p_motivo: 'IA respondeu 529' });
  });

  it('foto que não é de móvel: a IA responde em texto → 422 com a explicação, registrada como recusada', async () => {
    const a = ambiente({ ia: resp(200, { content: [{ type: 'text', text: 'A imagem mostra um cachorro\n no sofá.' }], usage: { input_tokens: 1500, output_tokens: 20 }, stop_reason: 'end_turn' }) });
    const r = await tratar(pedido(CORPO), a.deps);
    expect(r.status).toBe(422);
    expect(r.corpo).toMatchObject({ codigo: 'sem_movel', explicacao: 'A imagem mostra um cachorro no sofá.' });
    expect(a.encerramento()).toMatchObject({ p_status: 'recusada', p_tokens_entrada: 1500 });
  });

  it('resposta cortada ou ferramenta errada não vira leitura', async () => {
    const cortada = ambiente({ ia: resp(200, { content: [{ type: 'tool_use', name: FERRAMENTA_VISAO.name, input: LEITURA }], stop_reason: 'max_tokens' }) });
    expect((await tratar(pedido(CORPO), cortada.deps)).status).toBe(422);
    const outra = ambiente({ ia: resp(200, { content: [{ type: 'tool_use', name: 'outra_ferramenta', input: {} }], stop_reason: 'tool_use' }) });
    expect((await tratar(pedido(CORPO), outra.deps)).status).toBe(422);
    const lixo = ambiente({ ia: resp(200, 'não é json de mensagem') });
    expect((await tratar(pedido(CORPO), lixo.deps)).status).toBe(422);
  });

  it('a chave da IA e a imagem nunca aparecem na resposta ao usuário', async () => {
    for (const ia of [undefined, 'erro_de_rede' as const, resp(500, { error: 'x-api-key segredo inválida' })]) {
      const r = await tratar(pedido(CORPO), ambiente({ ia }).deps);
      const texto = JSON.stringify(r.corpo);
      expect(texto).not.toContain('segredo');
      expect(texto).not.toContain(IMAGEM.base64);
    }
  });
});

describe('resposta das funções: CORS sempre presente', () => {
  it('endereço do site com barra no final, maiúsculas ou vários endereços', async () => {
    const { origemPermitida } = await import('../../../supabase/functions/_shared/http');
    expect(origemPermitida('', 'https://app.exemplo.com.br')).toBe('*');
    expect(origemPermitida('https://App.Exemplo.com.br/', 'https://app.exemplo.com.br')).toBe('https://app.exemplo.com.br');
    expect(origemPermitida('https://a.com.br, https://www.a.com.br', 'https://www.a.com.br')).toBe('https://www.a.com.br');
    // Origem fora da lista: devolve a configurada (o navegador bloqueia, como deve).
    expect(origemPermitida('https://a.com.br', 'https://golpe.test')).toBe('https://a.com.br');
  });

  it('falha inesperada no servidor ainda volta com CORS e mensagem legível', async () => {
    const { cabecalhosCors, responder } = await import('../../../supabase/functions/_shared/http');
    const registros: string[] = [];
    const r = await responder(cabecalhosCors('', 'https://a.com.br'), async () => {
      throw new TypeError('quebrou');
    }, (m) => registros.push(m));
    expect(r.status).toBe(500);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(((await r.json()) as { codigo: string }).codigo).toBe('falha_servidor');
    expect(registros).toEqual(['TypeError: quebrou']);
  });
});
