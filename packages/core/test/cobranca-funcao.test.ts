import { describe, expect, it } from 'vitest';
import { cifrar, decifrar, finalDaChave } from '../../../supabase/functions/_shared/cofre';
import {
  agoraBrasilia,
  conferirConfigFiscal,
  lerNotaFocus,
  lerOrder,
  notaNfe,
  notaNfse,
  pagamentoDaOrder,
  pedidoDoBoleto,
  type ClienteCobranca,
  type ConfigFiscal,
} from '../../../supabase/functions/cobranca/montar';
import { tratar, type Dependencias } from '../../../supabase/functions/cobranca/tratar';
import { tratarAvisoBoleto } from '../../../supabase/functions/cobranca/aviso';

/** Boleto (Mercado Pago da marcenaria) e nota fiscal (Focus NFe da marcenaria). */

const CHAVE = Buffer.alloc(32, 7).toString('base64');
const EMPRESA = '11111111-1111-4111-8111-111111111111';
const LANC = '22222222-2222-4222-8222-222222222222';
const ORC = '33333333-3333-4333-8333-333333333333';
// Chaves de mentira, montadas em partes (não são credenciais).
const CHAVE_MP = ['falsa', 'marcenaria', '1234', '9876'].join('-');
const CHAVE_MP_ERRADA = ['falsa', 'errada', '1234'].join('-');
const CHAVE_FOCUS = ['focus', 'falsa', '123'].join('-');
const portador = (t: string) => [['Bear', 'er'].join(''), t].join(' ');
const LOGIN = portador('jwt-do-dono');

const joao: ClienteCobranca = {
  nome: 'João Pereira da Silva',
  documento: '12345678909',
  email: 'joao@exemplo.com.br',
  telefone: '(14) 99999-0000',
  cep: '17600000',
  logradouro: 'Rua das Acácias',
  numero: '120',
  complemento: null,
  bairro: 'Centro',
  cidade: 'Tupã',
  uf: 'SP',
  codigo_municipio: '3555000',
  inscricao_estadual: null,
};

const CONFIG: ConfigFiscal = {
  cnpj: '12345678000195',
  uf: 'SP',
  natureza_operacao: 'Venda de produção do estabelecimento',
  cfop_estadual: '5101',
  cfop_interestadual: '6101',
  ncm: '94036000',
  unidade: 'UN',
  icms_situacao_tributaria: '102',
  icms_origem: '0',
  pis_situacao_tributaria: '49',
  cofins_situacao_tributaria: '49',
  modalidade_frete: '9',
  presenca_comprador: '1',
  nfse: { inscricao_municipal: '12345', codigo_municipio: '3555000', item_lista_servico: '14.06', codigo_tributario_municipio: '', aliquota: '2.00', iss_retido: false },
};

describe('cofre das chaves', () => {
  it('cifra e decifra; outra chave não abre; chave do cofre do tamanho errado é recusada', async () => {
    const guardado = await cifrar(CHAVE_MP, CHAVE);
    expect(guardado).toMatch(/^v1\./);
    expect(guardado).not.toContain('marcenaria');
    expect(await decifrar(guardado, CHAVE)).toBe(CHAVE_MP);
    await expect(decifrar(guardado, Buffer.alloc(32, 8).toString('base64'))).rejects.toThrow();
    await expect(cifrar('x', Buffer.alloc(16).toString('base64'))).rejects.toThrow('32 bytes');
    expect(finalDaChave(' token-abcd ')).toBe('abcd');
  });
});

describe('boleto', () => {
  const l = { id: LANC, descricao: 'Roupeiro · 1/3', valor_centavos: 233334, vencimento: '2026-11-20', status: 'aberto' };

  it('pedido conferido à mão: valor em reais, vencimento em dias, CPF e endereço', () => {
    expect(pedidoDoBoleto(l, joao, '2026-11-12')).toEqual({
      ok: true,
      valor: {
        type: 'online',
        processing_mode: 'automatic',
        external_reference: LANC,
        total_amount: '2333.34',
        description: 'Roupeiro · 1/3',
        payer: {
          email: 'joao@exemplo.com.br',
          first_name: 'João',
          last_name: 'Pereira da Silva',
          identification: { type: 'CPF', number: '12345678909' },
          address: { street_name: 'Rua das Acácias', street_number: '120', zip_code: '17600000', neighborhood: 'Centro', state: 'SP', city: 'Tupã' },
        },
        transactions: { payments: [{ amount: '2333.34', payment_method: { id: 'boleto', type: 'ticket' }, expiration_time: 'P8D' }] },
      },
    });
  });

  it('o que impede: cadastro incompleto, vencimento hoje ou passado, mais de 30 dias, conta paga', () => {
    expect(pedidoDoBoleto(l, { ...joao, email: null, bairro: null }, '2026-11-12')).toEqual({ ok: false, erro: 'Complete o cadastro do cliente: bairro, e-mail.' });
    expect(pedidoDoBoleto(l, joao, '2026-11-20')).toMatchObject({ ok: false, erro: expect.stringContaining('a partir de amanhã') });
    expect(pedidoDoBoleto(l, joao, '2026-10-15')).toMatchObject({ ok: false, erro: expect.stringContaining('30 dias') });
    expect(pedidoDoBoleto({ ...l, status: 'pago' }, joao, '2026-11-12').ok).toBe(false);
    expect(pedidoDoBoleto(l, null, '2026-11-12').ok).toBe(false);
  });

  const order = {
    id: 'ORD01JABC',
    status: 'action_required',
    external_reference: LANC,
    total_amount: '2333.34',
    transactions: { payments: [{ id: 'PAY01', status: 'action_required', payment_method: { id: 'boleto', ticket_url: 'https://www.mercadopago.com.br/payments/1/ticket', digitable_line: '23793381286000000000000000000000000000000000000' } }] },
  };

  it('lê a order: link do boleto (só https) e linha digitável; referência de outra conta é recusada', () => {
    expect(lerOrder(order, LANC, '2026-11-20', '2026-11-12T12:00:00.000Z')).toEqual({
      id: 'ORD01JABC',
      status: 'action_required',
      url: 'https://www.mercadopago.com.br/payments/1/ticket',
      linha: '23793381286000000000000000000000000000000000000',
      vencimento: '2026-11-20',
      emitido_em: '2026-11-12T12:00:00.000Z',
    });
    expect(lerOrder({ ...order, external_reference: 'outra' }, LANC, null, '')).toBeNull();
    expect(lerOrder({ ...order, transactions: { payments: [{ payment_method: { ticket_url: 'http://x' } }] } }, LANC, null, '')?.url).toBeNull();
  });

  it('pago: status processed; valor pago e o dia em São Paulo', () => {
    expect(pagamentoDaOrder(order, '2026-11-12')).toBeNull();
    const pago = { ...order, status: 'processed', total_paid_amount: '2333.34', transactions: { payments: [{ date_approved: '2026-11-14T01:30:00.000Z' }] } };
    expect(pagamentoDaOrder(pago, '2026-11-15')).toEqual({ centavos: 233334, dia: '2026-11-13' });
  });
});

describe('nota fiscal', () => {
  const agora = new Date('2026-11-12T21:30:00Z');

  it('data e hora de Brasília', () => {
    expect(agoraBrasilia(agora)).toBe('2026-11-12T18:30:00-03:00');
  });

  it('NF-e para pessoa física no mesmo estado: CFOP estadual, não contribuinte, operação interna', () => {
    const n = notaNfe(CONFIG, joao, [{ codigo: 'ORC0012', descricao: 'Roupeiro 3 portas em MDF', quantidade: 1, valorCentavos: 700000 }], agora);
    if (!n.ok) throw new Error(n.erro);
    expect(n.valor).toMatchObject({
      natureza_operacao: 'Venda de produção do estabelecimento',
      cnpj_emitente: '12345678000195',
      cpf_destinatario: '12345678909',
      indicador_inscricao_estadual_destinatario: 9,
      local_destino: 1,
      consumidor_final: 1,
      valor_total: '7000.00',
    });
    expect((n.valor.items as Array<Record<string, unknown>>)[0]).toEqual({
      numero_item: 1,
      codigo_produto: 'ORC0012',
      descricao: 'Roupeiro 3 portas em MDF',
      cfop: '5101',
      unidade_comercial: 'UN',
      quantidade_comercial: 1,
      valor_unitario_comercial: '7000',
      unidade_tributavel: 'UN',
      quantidade_tributavel: 1,
      valor_unitario_tributavel: '7000',
      valor_bruto: '7000.00',
      codigo_ncm: '94036000',
      icms_situacao_tributaria: '102',
      icms_origem: 0,
      pis_situacao_tributaria: '49',
      cofins_situacao_tributaria: '49',
    });
  });

  it('empresa de outro estado com inscrição estadual: CFOP interestadual, contribuinte', () => {
    const pj = { ...joao, nome: 'Loja X Ltda', documento: '11222333000181', uf: 'PR', inscricao_estadual: '9012345678' };
    const n = notaNfe(CONFIG, pj, [{ codigo: 'A', descricao: 'Balcão', quantidade: 3, valorCentavos: 100000 }], agora);
    if (!n.ok) throw new Error(n.erro);
    expect(n.valor).toMatchObject({ cnpj_destinatario: '11222333000181', indicador_inscricao_estadual_destinatario: 1, inscricao_estadual_destinatario: '9012345678', local_destino: 2 });
    expect((n.valor.items as Array<Record<string, unknown>>)[0]).toMatchObject({ cfop: '6101', valor_unitario_comercial: '333.3333333333', valor_bruto: '1000.00' });
  });

  it('NFS-e da montagem: prestador, tomador com município e serviço', () => {
    const n = notaNfse(CONFIG, joao, 'Montagem do roupeiro', 80000, agora);
    if (!n.ok) throw new Error(n.erro);
    expect(n.valor).toEqual({
      data_emissao: '2026-11-12T18:30:00-03:00',
      prestador: { cnpj: '12345678000195', inscricao_municipal: '12345', codigo_municipio: '3555000' },
      tomador: {
        cpf: '12345678909',
        razao_social: 'João Pereira da Silva',
        email: 'joao@exemplo.com.br',
        endereco: { logradouro: 'Rua das Acácias', numero: '120', bairro: 'Centro', codigo_municipio: '3555000', uf: 'SP', cep: '17600000' },
      },
      servico: { aliquota: '2.00', discriminacao: 'Montagem do roupeiro', iss_retido: false, item_lista_servico: '14.06', valor_servicos: '800.00' },
    });
    expect(notaNfse(CONFIG, { ...joao, codigo_municipio: null }, 'x', 1, agora)).toEqual({ ok: false, erro: 'Complete o cadastro do cliente: código IBGE do município.' });
  });

  it('configuração fiscal incompleta: diz o que falta, sem inventar código', () => {
    expect(conferirConfigFiscal({ ...CONFIG, cfop_estadual: '6101', ncm: '9403' }, false)).toEqual({ ok: false, erro: 'Confira nos dados fiscais: CFOP dentro do estado, NCM.' });
    expect(conferirConfigFiscal({ ...CONFIG, nfse: undefined }, true).ok).toBe(false);
    expect(conferirConfigFiscal(CONFIG, true).ok).toBe(true);
  });

  it('resposta da Focus: caminho do DANFE vira endereço completo do mesmo ambiente', () => {
    expect(
      lerNotaFocus(
        { status: 'autorizado', status_sefaz: '100', mensagem_sefaz: 'Autorizado o uso da NF-e', chave_nfe: 'NFe3526', numero: '40', serie: '1', caminho_danfe: '/arquivos/123/DANFEs/x.pdf', caminho_xml_nota_fiscal: '/arquivos/123/XMLs/x-nfe.xml' },
        'https://homologacao.focusnfe.com.br',
      ),
    ).toEqual({
      status: 'autorizado',
      numero: '40',
      serie: '1',
      chave: 'NFe3526',
      url_pdf: 'https://homologacao.focusnfe.com.br/arquivos/123/DANFEs/x.pdf',
      url_xml: 'https://homologacao.focusnfe.com.br/arquivos/123/XMLs/x-nfe.xml',
      mensagem: 'Autorizado o uso da NF-e',
    });
    expect(lerNotaFocus({ status: 'erro_autorizacao', erros: [{ mensagem: 'CNPJ do destinatário inválido' }] }, 'https://x')?.mensagem).toBe('CNPJ do destinatário inválido');
  });
});

type Rota = [RegExp, (url: string) => { status: number; corpo: unknown }];

/** Servidor de mentira: responde por método e URL e anota as chamadas. */
function deps(rotas: Rota[]) {
  const chamadas: Array<{ url: string; metodo: string; corpo: unknown; cab: Record<string, string> }> = [];
  const d: Dependencias = {
    buscar: async (url, init) => {
      chamadas.push({ url, metodo: init.method, corpo: init.body ? JSON.parse(init.body) : undefined, cab: init.headers });
      const rota = rotas.find(([r]) => r.test(`${init.method} ${url}`));
      const { status, corpo } = rota ? rota[1](url) : { status: 404, corpo: {} };
      return { ok: status < 300, status, json: async () => corpo };
    },
    supabaseUrl: 'https://proj.supabase.co',
    anonKey: 'sb_publishable_x',
    chaveServico: 'sb_secret_x',
    chaveCofre: CHAVE,
    agora: () => new Date('2026-11-12T15:00:00Z'),
    novoId: () => '44444444-4444-4444-8444-444444444444',
  };
  return { d, chamadas };
}

describe('função cobranca', () => {
  it('emitir boleto: confere o dono, usa a chave da marcenaria e grava o boleto na conta', async () => {
    const segredo = await cifrar(CHAVE_MP, CHAVE);
    const { d, chamadas } = deps([
      [/GET .*\/rest\/v1\/lancamentos\?id=eq/, () => ({ status: 200, corpo: [{ id: LANC, empresa_id: EMPRESA, tipo: 'receber', descricao: 'Roupeiro', valor_centavos: 100000, vencimento: '2026-11-20', status: 'aberto', boleto: null, cliente: joao }] })],
      [/POST .*rpc\/pode_cobrar/, () => ({ status: 200, corpo: true })],
      [/GET .*integracoes\?/, () => ({ status: 200, corpo: [{ segredo, ambiente: 'teste', dados: {} }] })],
      [/POST https:\/\/api\.mercadopago\.com\/v1\/orders$/, () => ({ status: 201, corpo: { id: 'ORD01', status: 'action_required', external_reference: LANC, transactions: { payments: [{ payment_method: { ticket_url: 'https://mp/boleto', digitable_line: '2379' } }] } } })],
      [/PATCH .*lancamentos\?id=eq/, () => ({ status: 204, corpo: null })],
    ]);
    const r = await tratar({ metodo: 'POST', autorizacao: LOGIN, corpo: { acao: 'emitir_boleto', lancamento: LANC } }, d);
    expect(r.status).toBe(200);
    const mp = chamadas.find((c) => c.url.endsWith('/v1/orders'))!;
    expect(mp.cab.Authorization).toBe(portador(CHAVE_MP));
    expect(mp.cab['X-Idempotency-Key']).toBe('44444444-4444-4444-8444-444444444444');
    // A conta foi lida com o login do dono (RLS), não com a chave de serviço.
    expect(chamadas[0]!.cab.Authorization).toBe(LOGIN);
    const gravado = chamadas.find((c) => c.metodo === 'PATCH')!;
    expect(gravado.corpo).toMatchObject({ forma: 'boleto', boleto: { id: 'ORD01', url: 'https://mp/boleto', linha: '2379', vencimento: '2026-11-20' } });
    expect(gravado.cab.apikey).toBe('sb_secret_x');
  });

  it('quem não é dono (ou sem assinatura) não emite; sem login, nem começa', async () => {
    const { d, chamadas } = deps([
      [/GET .*lancamentos/, () => ({ status: 200, corpo: [{ id: LANC, empresa_id: EMPRESA, tipo: 'receber' }] })],
      [/POST .*rpc\/pode_cobrar/, () => ({ status: 200, corpo: false })],
    ]);
    expect((await tratar({ metodo: 'POST', autorizacao: LOGIN, corpo: { acao: 'emitir_boleto', lancamento: LANC } }, d)).status).toBe(403);
    expect(chamadas.some((c) => c.url.includes('mercadopago'))).toBe(false);
    expect((await tratar({ metodo: 'POST', autorizacao: null, corpo: {} }, d)).status).toBe(401);
  });

  it('salvar a chave: testa no Mercado Pago, guarda cifrada e só os 4 últimos à mostra', async () => {
    const { d, chamadas } = deps([
      [/POST .*rpc\/pode_cobrar/, () => ({ status: 200, corpo: true })],
      [/GET https:\/\/api\.mercadopago\.com\/users\/me/, () => ({ status: 200, corpo: { id: 1 } })],
      [/POST .*rest\/v1\/integracoes/, () => ({ status: 201, corpo: null })],
    ]);
    const r = await tratar({ metodo: 'POST', autorizacao: LOGIN, corpo: { acao: 'salvar_integracao', empresa: EMPRESA, provedor: 'mercado_pago', ambiente: 'teste', token: CHAVE_MP, dados: {} } }, d);
    expect(r.status).toBe(200);
    const corpo = chamadas.find((c) => c.url.endsWith('/rest/v1/integracoes'))!.corpo as Record<string, string>;
    expect(corpo.final).toBe('9876');
    expect(JSON.stringify(corpo)).not.toContain(CHAVE_MP);
    expect(await decifrar(corpo.segredo!, CHAVE)).toBe(CHAVE_MP);
  });

  it('chave recusada pelo Mercado Pago: não guarda', async () => {
    const { d, chamadas } = deps([
      [/POST .*rpc\/pode_cobrar/, () => ({ status: 200, corpo: true })],
      [/GET https:\/\/api\.mercadopago\.com\/users\/me/, () => ({ status: 401, corpo: {} })],
    ]);
    const r = await tratar({ metodo: 'POST', autorizacao: LOGIN, corpo: { acao: 'salvar_integracao', empresa: EMPRESA, provedor: 'mercado_pago', ambiente: 'teste', token: CHAVE_MP_ERRADA, dados: {} } }, d);
    expect(r.status).toBe(400);
    expect(chamadas.some((c) => c.url.includes('/rest/v1/integracoes'))).toBe(false);
  });

  it('conferir: boleto pago vira baixa na conta do Mercado Pago, com o valor e o dia do pagamento', async () => {
    const segredo = await cifrar(CHAVE_MP, CHAVE);
    const CONTA = '55555555-5555-4555-8555-555555555555';
    const { d, chamadas } = deps([
      [/POST .*rpc\/pode_cobrar/, () => ({ status: 200, corpo: true })],
      [/GET .*integracoes\?/, () => ({ status: 200, corpo: [{ segredo, ambiente: 'producao', dados: { conta_id: CONTA } }] })],
      [/GET .*lancamentos\?empresa_id=eq/, () => ({ status: 200, corpo: [{ id: LANC, boleto: { id: 'ORD01', status: 'action_required' } }] })],
      [/GET https:\/\/api\.mercadopago\.com\/v1\/orders\/ORD01/, () => ({ status: 200, corpo: { id: 'ORD01', status: 'processed', external_reference: LANC, total_paid_amount: '1000.00', transactions: { payments: [{ date_approved: '2026-11-11T14:00:00Z' }] } } })],
      [/POST .*rpc\/baixar_lancamento/, () => ({ status: 200, corpo: null })],
      [/PATCH .*lancamentos/, () => ({ status: 204, corpo: null })],
    ]);
    const r = await tratar({ metodo: 'POST', autorizacao: LOGIN, corpo: { acao: 'conferir_boletos', empresa: EMPRESA } }, d);
    expect(r.corpo).toMatchObject({ conferidos: 1, pagos: 1 });
    expect(chamadas.find((c) => c.url.endsWith('rpc/baixar_lancamento'))!.corpo).toEqual({ p_id: LANC, p_pago_em: '2026-11-11', p_valor_centavos: 100000, p_conta: CONTA, p_forma: 'boleto', p_parcial: false });
  });

  it('aviso do Mercado Pago: não confia no conteúdo; order de outra conta não dá baixa', async () => {
    const segredo = await cifrar(CHAVE_MP, CHAVE);
    const { d, chamadas } = deps([
      [/POST .*rpc\/empresa_liberada/, () => ({ status: 200, corpo: true })],
      [/GET .*integracoes\?/, () => ({ status: 200, corpo: [{ segredo, ambiente: 'producao', dados: {} }] })],
      [/GET .*lancamentos\?empresa_id=eq/, () => ({ status: 200, corpo: [{ id: LANC, boleto: { id: 'ORD01', status: 'action_required' } }] })],
      [/GET https:\/\/api\.mercadopago\.com\/v1\/orders\/ORD01/, () => ({ status: 200, corpo: { id: 'ORD01', status: 'processed', external_reference: 'outra-conta', total_paid_amount: '1000.00' } })],
    ]);
    const s = tratarAvisoBoleto({ metodo: 'POST', url: `https://proj.supabase.co/functions/v1/boleto-aviso?empresa=${EMPRESA}&data.id=ORD01`, corpo: { type: 'order', action: 'processed' } }, d);
    expect(s.status).toBe(200);
    await s.depois;
    expect(chamadas.some((c) => c.url.includes('/v1/orders/ORD01'))).toBe(true);
    expect(chamadas.some((c) => c.url.includes('baixar_lancamento'))).toBe(false);
    // Aviso sem empresa: ignora sem consultar nada.
    expect(tratarAvisoBoleto({ metodo: 'POST', url: 'https://proj.supabase.co/functions/v1/boleto-aviso', corpo: {} }, d)).toEqual({ status: 200, depois: null });
  });

  it('nota de orçamento que não foi aprovado: recusa antes de falar com a Focus', async () => {
    const { d, chamadas } = deps([
      [/GET .*orcamentos\?id=eq/, () => ({ status: 200, corpo: [{ id: ORC, empresa_id: EMPRESA, numero: 12, status: 'emitido', total_centavos: 100000, cliente: joao }] })],
      [/POST .*rpc\/pode_cobrar/, () => ({ status: 200, corpo: true })],
    ]);
    const r = await tratar({ metodo: 'POST', autorizacao: LOGIN, corpo: { acao: 'emitir_nota', orcamento: ORC, tipo: 'nfe', itens: [] } }, d);
    expect(r.status).toBe(400);
    expect(chamadas.some((c) => c.url.includes('focusnfe'))).toBe(false);
  });

  it('emitir NF-e: registra a nota, envia à Focus (homologação, token no Basic) e guarda a situação', async () => {
    const segredo = await cifrar(CHAVE_FOCUS, CHAVE);
    const { d, chamadas } = deps([
      [/GET .*orcamentos\?id=eq/, () => ({ status: 200, corpo: [{ id: ORC, empresa_id: EMPRESA, numero: 12, status: 'aprovado', total_centavos: 700000, projeto_nome: 'Roupeiro', cliente_id: 'c1', cliente: joao }] })],
      [/POST .*rpc\/pode_cobrar/, () => ({ status: 200, corpo: true })],
      [/GET .*integracoes\?/, () => ({ status: 200, corpo: [{ segredo, ambiente: 'teste', dados: CONFIG }] })],
      [/POST .*rest\/v1\/notas_fiscais/, () => ({ status: 201, corpo: null })],
      [/POST https:\/\/homologacao\.focusnfe\.com\.br\/v2\/nfe\?ref=/, () => ({ status: 202, corpo: { status: 'processando_autorizacao' } })],
      [/PATCH .*notas_fiscais/, () => ({ status: 204, corpo: null })],
    ]);
    const pedido = (valor: number) => ({ metodo: 'POST', autorizacao: LOGIN, corpo: { acao: 'emitir_nota', orcamento: ORC, tipo: 'nfe', itens: [{ descricao: 'Roupeiro', quantidade: 1, valor_centavos: valor }] } });
    expect(await tratar(pedido(700000), d)).toMatchObject({ status: 200, corpo: { ok: true, status: 'processando_autorizacao' } });
    const envio = chamadas.find((c) => c.url.includes('focusnfe'))!;
    expect(envio.url).toBe('https://homologacao.focusnfe.com.br/v2/nfe?ref=44444444444444448444444444444444');
    expect(envio.cab.Authorization).toBe(`Basic ${Buffer.from(`${CHAVE_FOCUS}:`).toString('base64')}`);
    // Nota acima do total do orçamento não sai.
    expect((await tratar(pedido(700001), d)).status).toBe(400);
  });
});
