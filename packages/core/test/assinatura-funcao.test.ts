import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OFERTAS } from '../src';
import { enderecoDoMercadoPago, tratar, type Dependencias } from '../../../supabase/functions/assinatura/tratar';
import { hmacSha256, textoAssinado, tratarAviso, type DependenciasAviso } from '../../../supabase/functions/mp-webhook/tratar';
import type { Buscar, Resposta } from '../../../supabase/functions/_shared/mp';

/**
 * Funções de servidor da cobrança, com o Mercado Pago e o banco SIMULADOS.
 * Testa a lógica (o que é enviado, o que é recusado, a conferência dos avisos).
 * Não testa o Mercado Pago de verdade: isso exige as credenciais de teste.
 */

const ARQUIVO = new URL('../../../supabase/functions/assinatura/oferta.ts', import.meta.url);
const ESPERADO = `// Gerado a partir de packages/core/src/assinatura.ts. Não edite à mão: rode GERAR=1 npm test.\nexport default ${JSON.stringify(OFERTAS, null, 2)};\n`;

describe('catálogo do servidor em dia com o motor', () => {
  it('oferta.ts é gerado do motor (GERAR=1 regrava)', () => {
    if (process.env.GERAR === '1' || !existsSync(ARQUIVO)) writeFileSync(ARQUIVO, ESPERADO);
    expect(readFileSync(ARQUIVO, 'utf8')).toBe(ESPERADO);
  });
});

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const REFERENCIA = '22222222-2222-4222-8222-222222222222';
const MP_ID = '2c938084726fca480172750000000000';
const API = 'https://api.mercadopago.com';

const resp = (status: number, corpo: unknown): Resposta => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });

interface Chamada { url: string; metodo: string; headers: Record<string, string>; corpo: Record<string, unknown> | null }

const preapproval = (extra: Record<string, unknown> = {}) => ({
  id: MP_ID, status: 'authorized', external_reference: REFERENCIA, next_payment_date: '2026-12-11T10:00:00.000-04:00',
  summarized: { charged_quantity: 1, last_charged_date: '2026-11-11T10:00:00.000-04:00' }, ...extra,
});

function ambiente(o: { iniciar?: Resposta; criar?: Resposta | 'rede'; obter?: Resposta; alterar?: Resposta; vincular?: Resposta; aplicar?: Resposta; linhas?: unknown[]; cobranca?: Resposta } = {}) {
  const chamadas: Chamada[] = [];
  const buscar: Buscar = async (url, init) => {
    chamadas.push({ url, metodo: init.method, headers: init.headers, corpo: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith('/rpc/iniciar_assinatura')) return o.iniciar ?? resp(200, { id: REFERENCIA, anteriores: [] });
    if (url.endsWith('/rpc/vincular_assinatura_mp')) return o.vincular ?? resp(204, null);
    if (url.endsWith('/rpc/aplicar_assinatura_mp')) return o.aplicar ?? resp(200, true);
    if (url.includes('/rest/v1/assinaturas?')) return resp(200, o.linhas ?? [{ id: REFERENCIA, mp_preapproval_id: MP_ID, status: 'ativa' }]);
    if (url === 'https://api.mercadopago.com/preapproval' && init.method === 'POST') {
      if (o.criar === 'rede') throw new Error('rede');
      return o.criar ?? resp(201, { id: MP_ID, status: 'pending', init_point: `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=${MP_ID}` });
    }
    if (url.startsWith(`${API}/preapproval/`) && init.method === 'GET') return o.obter ?? resp(200, preapproval());
    if (url.startsWith(`${API}/preapproval/`) && init.method === 'PUT') return o.alterar ?? resp(200, {});
    if (url.startsWith(`${API}/authorized_payments/`)) return o.cobranca ?? resp(200, { id: 6114264375, preapproval_id: MP_ID, status: 'processed' });
    throw new Error(`chamada inesperada: ${init.method} ${url}`);
  };
  const deps: Dependencias = { buscar, supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', chaveServico: 'servico', credencialMP: 'credencial-mp', appUrl: 'https://app.exemplo.com.br', offerCatalog: OFERTAS };
  const para = (trecho: string, metodo?: string) => chamadas.filter((c) => c.url.includes(trecho) && (!metodo || c.metodo === metodo));
  return { deps, chamadas, para };
}

const pedido = (corpo: unknown, extra: Partial<{ metodo: string; autorizacao: string | null }> = {}) => ({ metodo: 'POST', autorizacao: 'Bearer login-do-usuario', corpo, ...extra });
const ASSINAR = { acao: 'assinar', empresaId: EMPRESA, plano: 'mensal', email: ' Dono@Marcenaria.com.br ' };

describe('assinar', () => {
  it('cria a assinatura pendente com os termos do servidor e devolve o endereço de pagamento', async () => {
    const a = ambiente();
    const r = await tratar(pedido(ASSINAR), a.deps);
    expect(r).toEqual({ status: 200, corpo: { status: 'pending', init_point: `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=${MP_ID}` } });
    const [criacao] = a.para('/preapproval', 'POST').filter((c) => c.url === `${API}/preapproval`);
    expect(criacao!.corpo).toEqual({
      reason: 'Meu Marceneiro - assinatura mensal',
      external_reference: REFERENCIA,
      payer_email: 'dono@marcenaria.com.br',
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 149, currency_id: 'BRL' },
      back_url: 'https://app.exemplo.com.br/assinatura',
      status: 'pending',
    });
    expect(criacao!.headers.Authorization).toBe('Bearer credencial-mp');
    // A reserva usa o login do usuário; o vínculo, a chave de serviço.
    expect(a.para('/rpc/iniciar_assinatura')[0]).toMatchObject({ corpo: { p_empresa: EMPRESA, p_plano: 'mensal' }, headers: { authorization: 'Bearer login-do-usuario', apikey: 'anon' } });
    expect(a.para('/rpc/vincular_assinatura_mp')[0]).toMatchObject({ corpo: { p_id: REFERENCIA, p_mp_id: MP_ID, p_valor_centavos: 14900, p_email: 'dono@marcenaria.com.br' }, headers: { apikey: 'servico' } });
    expect(a.para('/rpc/vincular_assinatura_mp')[0]!.headers.authorization).toBeUndefined();
  });

  it('preço, frequência ou referência enviados pelo navegador são ignorados', async () => {
    const a = ambiente();
    await tratar(pedido({ ...ASSINAR, transaction_amount: 1, valorCentavos: 1, auto_recurring: { transaction_amount: 1 }, external_reference: 'x', back_url: 'https://golpe.test' }), a.deps);
    const criacao = a.chamadas.find((c) => c.url === `${API}/preapproval`)!;
    expect(criacao.corpo).toMatchObject({ external_reference: REFERENCIA, back_url: 'https://app.exemplo.com.br/assinatura', auto_recurring: { transaction_amount: 149 } });
  });

  it('cancela no Mercado Pago as tentativas anteriores que ficaram sem pagar', async () => {
    const a = ambiente({ iniciar: resp(200, { id: REFERENCIA, anteriores: ['aaaaaaaa11111111', '../golpe'] }) });
    await tratar(pedido(ASSINAR), a.deps);
    const cancelamentos = a.para('/preapproval/', 'PUT');
    expect(cancelamentos.map((c) => c.url)).toEqual([`${API}/preapproval/aaaaaaaa11111111`]);
    expect(cancelamentos[0]!.corpo).toEqual({ status: 'cancelled' });
  });

  it.each([
    ['sem login', pedido(ASSINAR, { autorizacao: null }), 401, 'sem_login'],
    ['método errado', pedido(ASSINAR, { metodo: 'GET' }), 405, 'metodo'],
    ['empresa inválida', pedido({ ...ASSINAR, empresaId: 'x' }), 400, 'pedido'],
    ['plano inventado', pedido({ ...ASSINAR, plano: 'vitalicio' }), 400, 'plano'],
    ['plano com nome de propriedade interna', pedido({ ...ASSINAR, plano: 'constructor' }), 400, 'plano'],
    ['e-mail inválido', pedido({ ...ASSINAR, email: 'sem-arroba' }), 400, 'email'],
    ['ação desconhecida', pedido({ ...ASSINAR, acao: 'estornar' }), 400, 'pedido'],
  ])('recusa: %s', async (_n, p, status, codigo) => {
    const a = ambiente();
    const r = await tratar(p, a.deps);
    expect([r.status, r.corpo.codigo]).toEqual([status, codigo]);
    expect(a.chamadas.filter((c) => c.url.startsWith(API))).toEqual([]);
  });

  it('sem credencial ou sem endereço do site: avisa que a cobrança não está configurada', async () => {
    const a = ambiente();
    expect((await tratar(pedido(ASSINAR), { ...a.deps, credencialMP: '' })).corpo.codigo).toBe('sem_cobranca');
    expect((await tratar(pedido(ASSINAR), { ...a.deps, appUrl: 'http://site-sem-https.com' })).corpo.codigo).toBe('sem_cobranca');
    expect(a.chamadas).toEqual([]);
  });

  it('o banco decide quem pode: não dono e já assinante', async () => {
    expect((await tratar(pedido(ASSINAR), ambiente({ iniciar: resp(403, { code: '42501' }) }).deps)).status).toBe(403);
    expect((await tratar(pedido(ASSINAR), ambiente({ iniciar: resp(400, { code: 'P0001', hint: 'ja_assinante' }) }).deps)).corpo.codigo).toBe('ja_assinante');
  });

  it('erro do Mercado Pago não vaza para o navegador', async () => {
    const r = await tratar(pedido(ASSINAR), ambiente({ criar: resp(400, { message: 'detalhe interno do Mercado Pago', cause: [{ code: 1 }] }) }).deps);
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.corpo)).not.toContain('detalhe interno');
    expect((await tratar(pedido(ASSINAR), ambiente({ criar: resp(401, {}) }).deps)).corpo.codigo).toBe('sem_cobranca');
    expect((await tratar(pedido(ASSINAR), ambiente({ criar: 'rede' }).deps)).corpo.codigo).toBe('rede');
  });

  it('endereço de pagamento fora do Mercado Pago é recusado', async () => {
    const r = await tratar(pedido(ASSINAR), ambiente({ criar: resp(201, { id: MP_ID, init_point: 'https://mercadopago.com.br.golpe.test/pagar' }) }).deps);
    expect(r.corpo.codigo).toBe('mp');
    expect(enderecoDoMercadoPago('https://www.mercadopago.com.br/x')).not.toBeNull();
    expect(enderecoDoMercadoPago('http://www.mercadopago.com.br/x')).toBeNull();
    expect(enderecoDoMercadoPago('https://falsomercadopago.com/x')).toBeNull();
    expect(enderecoDoMercadoPago('javascript:alert(1)')).toBeNull();
  });

  it('se o vínculo no banco falhar, desfaz a assinatura no Mercado Pago', async () => {
    const a = ambiente({ vincular: resp(500, {}) });
    const r = await tratar(pedido(ASSINAR), a.deps);
    expect(r.corpo.codigo).toBe('banco');
    expect(a.para(`/preapproval/${MP_ID}`, 'PUT')[0]!.corpo).toEqual({ status: 'cancelled' });
  });
});

describe('consultar e alterar', () => {
  it('consultar busca no Mercado Pago e grava a situação com a chave de serviço', async () => {
    const a = ambiente();
    const r = await tratar(pedido({ acao: 'consultar', empresaId: EMPRESA }), a.deps);
    expect(r).toEqual({ status: 200, corpo: { sincronizada: true, status: 'authorized' } });
    expect(a.para('/rpc/aplicar_assinatura_mp')[0]).toMatchObject({
      corpo: { p_id: REFERENCIA, p_mp_id: MP_ID, p_status: 'authorized', p_proxima_cobranca: '2026-12-11T10:00:00.000-04:00', p_ultima_cobranca: '2026-11-11T10:00:00.000-04:00' },
      headers: { apikey: 'servico' },
    });
    // A leitura da assinatura usa o login do usuário (a RLS só mostra ao dono).
    expect(a.para('/rest/v1/assinaturas?')[0]!.headers.authorization).toBe('Bearer login-do-usuario');
  });

  it('sem assinatura (ou sem ser dono): nada a sincronizar', async () => {
    const a = ambiente({ linhas: [] });
    expect((await tratar(pedido({ acao: 'consultar', empresaId: EMPRESA }), a.deps)).corpo).toEqual({ sincronizada: false });
    expect(a.chamadas.filter((c) => c.url.startsWith(API))).toEqual([]);
  });

  it('referência do Mercado Pago diferente da assinatura do usuário: não grava', async () => {
    const a = ambiente({ obter: resp(200, preapproval({ external_reference: '33333333-3333-4333-8333-333333333333' })) });
    expect((await tratar(pedido({ acao: 'consultar', empresaId: EMPRESA }), a.deps)).status).toBe(502);
    expect(a.para('/rpc/aplicar_assinatura_mp')).toEqual([]);
  });

  it.each([
    ['pausar', 'ativa', 'paused'],
    ['reativar', 'pausada', 'authorized'],
    ['cancelar', 'ativa', 'cancelled'],
  ])('%s envia só o valor da lista fechada', async (acao, atual, enviado) => {
    const a = ambiente({ linhas: [{ id: REFERENCIA, mp_preapproval_id: MP_ID, status: atual }] });
    const r = await tratar(pedido({ acao, empresaId: EMPRESA, status: 'authorized', valor: 1 }), a.deps);
    expect(r.status).toBe(200);
    expect(a.para(`/preapproval/${MP_ID}`, 'PUT')[0]!.corpo).toEqual({ status: enviado });
    expect(a.para('/rpc/aplicar_assinatura_mp').length).toBe(1);
  });

  it('não pausa o que não está ativo nem altera sem assinatura', async () => {
    expect((await tratar(pedido({ acao: 'pausar', empresaId: EMPRESA }), ambiente({ linhas: [{ id: REFERENCIA, mp_preapproval_id: MP_ID, status: 'pausada' }] }).deps)).status).toBe(409);
    expect((await tratar(pedido({ acao: 'reativar', empresaId: EMPRESA }), ambiente().deps)).status).toBe(409);
    expect((await tratar(pedido({ acao: 'cancelar', empresaId: EMPRESA }), ambiente({ linhas: [] }).deps)).status).toBe(404);
  });
});

describe('avisos do Mercado Pago', () => {
  const SEGREDO = 'segredo-dos-avisos';
  const TS = '1762862400';
  const REQ = 'bb56a2f1-6aae-46ac-982e-9dcd3581d08e';

  async function aviso(o: { tipo?: string; id?: string; v1?: string; ts?: string; naConsulta?: boolean; requestId?: string | null; metodo?: string } = {}) {
    const id = o.id ?? MP_ID;
    const v1 = o.v1 ?? (await hmacSha256(SEGREDO, textoAssinado(id.toLowerCase(), REQ, o.ts ?? TS)));
    const tipo = o.tipo ?? 'subscription_preapproval';
    return {
      metodo: o.metodo ?? 'POST',
      url: `https://x.supabase.co/functions/v1/mp-webhook${o.naConsulta === false ? '' : `?data.id=${id}&type=${tipo}`}`,
      assinatura: `ts=${o.ts ?? TS},v1=${v1}`,
      requestId: o.requestId === undefined ? REQ : o.requestId,
      corpo: { action: 'updated', type: tipo, data: { id } },
    };
  }
  const depsAviso = (a: ReturnType<typeof ambiente>, extra: Partial<DependenciasAviso> = {}): DependenciasAviso & { falhas: string[] } => {
    const falhas: string[] = [];
    return { buscar: a.deps.buscar, supabaseUrl: a.deps.supabaseUrl, chaveServico: 'servico', credencialMP: 'credencial-mp', segredo: SEGREDO, registrar: (m) => falhas.push(m), falhas, ...extra };
  };

  it('o HMAC confere com um valor conhecido', async () => {
    // Vetor de teste do HMAC-SHA256 (RFC 4231, caso 2).
    expect(await hmacSha256('Jefe', 'what do ya want for nothing?')).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
    expect(textoAssinado('abc', 'req', '1')).toBe('id:abc;request-id:req;ts:1;');
  });

  it('aviso de assinatura válido: responde 200 e grava o que o Mercado Pago informa', async () => {
    const a = ambiente();
    const d = depsAviso(a);
    const r = await tratarAviso(await aviso(), d);
    expect(r.status).toBe(200);
    await r.depois;
    expect(a.para(`/preapproval/${MP_ID}`, 'GET').length).toBe(1);
    expect(a.para('/rpc/aplicar_assinatura_mp')[0]!.corpo).toMatchObject({ p_id: REFERENCIA, p_mp_id: MP_ID, p_status: 'authorized' });
    expect(d.falhas).toEqual([]);
  });

  it('aviso de cobrança recorrente: descobre a assinatura e sincroniza', async () => {
    const a = ambiente();
    const r = await tratarAviso(await aviso({ tipo: 'subscription_authorized_payment', id: '6114264375' }), depsAviso(a));
    await r.depois;
    expect(a.para('/authorized_payments/6114264375').length).toBe(1);
    expect(a.para('/rpc/aplicar_assinatura_mp').length).toBe(1);
  });

  it('identificador só no corpo também é aceito', async () => {
    const a = ambiente();
    const r = await tratarAviso(await aviso({ naConsulta: false }), depsAviso(a));
    expect(r.status).toBe(200);
    await r.depois;
    expect(a.para('/rpc/aplicar_assinatura_mp').length).toBe(1);
  });

  it('assinatura do aviso errada: 401 e nenhuma chamada', async () => {
    const a = ambiente();
    for (const errado of [{ v1: 'a'.repeat(64) }, { ts: '1762862401', v1: await hmacSha256(SEGREDO, textoAssinado(MP_ID, REQ, TS)) }]) {
      const r = await tratarAviso(await aviso(errado), depsAviso(a));
      expect(r.status).toBe(401);
      expect(r.depois).toBeUndefined();
    }
    // Assinado com outro segredo.
    const r = await tratarAviso(await aviso({ v1: await hmacSha256('outro-segredo', textoAssinado(MP_ID, REQ, TS)) }), depsAviso(a));
    expect(r.status).toBe(401);
    expect(a.chamadas).toEqual([]);
  });

  it('aviso incompleto: 400; sem segredo configurado: 503', async () => {
    const a = ambiente();
    expect((await tratarAviso(await aviso({ requestId: null }), depsAviso(a))).status).toBe(400);
    expect((await tratarAviso({ ...(await aviso()), assinatura: null }, depsAviso(a))).status).toBe(400);
    expect((await tratarAviso(await aviso({ metodo: 'GET' }), depsAviso(a))).status).toBe(405);
    expect((await tratarAviso(await aviso(), depsAviso(a, { segredo: '' }))).status).toBe(503);
    expect(a.chamadas).toEqual([]);
  });

  it('outros tipos de aviso são aceitos e ignorados', async () => {
    const a = ambiente();
    const r = await tratarAviso(await aviso({ tipo: 'payment', id: '123456789012' }), depsAviso(a));
    expect(r.status).toBe(200);
    await r.depois;
    expect(a.chamadas).toEqual([]);
  });

  it('o corpo do aviso não decide nada: vale a consulta ao Mercado Pago', async () => {
    const a = ambiente({ obter: resp(200, preapproval({ status: 'cancelled', summarized: {} })) });
    const av = await aviso();
    const r = await tratarAviso({ ...av, corpo: { ...av.corpo, status: 'authorized', external_reference: 'x' } }, depsAviso(a));
    await r.depois;
    expect(a.para('/rpc/aplicar_assinatura_mp')[0]!.corpo).toMatchObject({ p_status: 'cancelled', p_ultima_cobranca: null });
  });

  it('assinatura que não é deste sistema (referência estranha) não grava; falha fica registrada', async () => {
    const a = ambiente({ obter: resp(200, preapproval({ external_reference: 'pedido-de-outro-sistema' })) });
    const d = depsAviso(a);
    const r = await tratarAviso(await aviso(), d);
    expect(r.status).toBe(200);
    await r.depois;
    expect(a.para('/rpc/aplicar_assinatura_mp')).toEqual([]);
    expect(d.falhas).toEqual(['aviso subscription_preapproval: sincronia falhou (referencia)']);
    expect(d.falhas.join()).not.toContain('credencial-mp');
  });
});
