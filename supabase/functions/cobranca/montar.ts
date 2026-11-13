/**
 * Cobrança da marcenaria — o que vai para o Mercado Pago (boleto) e para a
 * Focus NFe (nota fiscal), e como ler a resposta. Só funções puras: testadas
 * fora do Supabase (packages/core/test/cobranca-funcao.test.ts).
 *
 * Nenhum código fiscal é inventado aqui: CFOP, NCM, CSOSN/CST, PIS, COFINS,
 * item da lista de serviço e alíquota vêm da configuração que o dono preenche
 * (com o contador). Falta algum? A nota não sai, e a mensagem diz qual.
 */

export const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Montado<T> = { ok: true; valor: T } | { ok: false; erro: string };
const falha = <T>(erro: string): Montado<T> => ({ ok: false, erro });

/** Cliente como vem do banco (colunas usadas pela cobrança). */
export interface ClienteCobranca {
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  codigo_municipio: string | null;
  inscricao_estadual: string | null;
}

const reais = (centavos: number) => (centavos / 100).toFixed(2);

function diasAte(hoje: string, data: string): number {
  const [a1, m1, d1] = hoje.split('-').map(Number) as [number, number, number];
  const [a2, m2, d2] = data.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/** O que falta no cadastro do cliente para boleto ou nota. */
export function faltasDoCliente(c: ClienteCobranca, comMunicipio = false): string[] {
  const f: string[] = [];
  if (!c.documento) f.push('CPF ou CNPJ');
  if (!c.cep) f.push('CEP');
  if (!c.logradouro) f.push('rua');
  if (!c.bairro) f.push('bairro');
  if (!c.cidade) f.push('cidade');
  if (!c.uf) f.push('UF');
  if (comMunicipio && !c.codigo_municipio) f.push('código IBGE do município');
  return f;
}

// ---------------------------------------------------------------------------
// Boleto (Mercado Pago, API de Orders)
// ---------------------------------------------------------------------------

export interface LancamentoCobranca {
  id: string;
  descricao: string;
  valor_centavos: number;
  vencimento: string;
  status: string;
}

/** Corpo do POST /v1/orders para um boleto com vencimento no dia da conta. */
export function pedidoDoBoleto(l: LancamentoCobranca, c: ClienteCobranca | null, hoje: string): Montado<Record<string, unknown>> {
  if (l.status !== 'aberto') return falha('Só conta em aberto recebe boleto.');
  if (!c) return falha('Ligue a conta a um cliente para gerar o boleto.');
  const faltas = faltasDoCliente(c);
  if (!c.email) faltas.push('e-mail');
  if (faltas.length) return falha(`Complete o cadastro do cliente: ${faltas.join(', ')}.`);
  const dias = diasAte(hoje, l.vencimento);
  if (dias < 1) return falha('O vencimento precisa ser a partir de amanhã. Mude o vencimento da conta.');
  if (dias > 30) return falha('O Mercado Pago aceita boleto com até 30 dias. Gere o boleto mais perto do vencimento.');
  const nome = c.nome.trim().split(/\s+/);
  const valor = reais(l.valor_centavos);
  return {
    ok: true,
    valor: {
      type: 'online',
      processing_mode: 'automatic',
      external_reference: l.id,
      total_amount: valor,
      description: l.descricao.slice(0, 200),
      payer: {
        email: c.email,
        first_name: nome[0],
        last_name: nome.length > 1 ? nome.slice(1).join(' ') : nome[0],
        identification: { type: c.documento!.length === 11 ? 'CPF' : 'CNPJ', number: c.documento },
        address: {
          street_name: c.logradouro,
          street_number: c.numero?.trim() || 'N/A',
          zip_code: c.cep,
          neighborhood: c.bairro,
          state: c.uf,
          city: c.cidade,
        },
      },
      transactions: { payments: [{ amount: valor, payment_method: { id: 'boleto', type: 'ticket' }, expiration_time: `P${dias}D` }] },
    },
  };
}

export interface Boleto {
  id: string;
  status: string;
  url: string | null;
  linha: string | null;
  vencimento: string | null;
  emitido_em: string;
}

const textoOu = (v: unknown, max = 500) => (typeof v === 'string' && v.length <= max ? v : null);
const httpsOu = (v: unknown) => {
  const t = textoOu(v, 2000);
  if (!t) return null;
  try {
    return new URL(t).protocol === 'https:' ? t : null;
  } catch {
    return null;
  }
};

/** Primeiro pagamento da order (o boleto). */
function pagamento(order: Record<string, unknown>): Record<string, unknown> {
  const t = ehObjeto(order.transactions) ? order.transactions : {};
  const p = Array.isArray(t.payments) && ehObjeto(t.payments[0]) ? t.payments[0] : {};
  return p;
}

/** Lê a order devolvida pelo Mercado Pago. null se não for a order esperada. */
export function lerOrder(order: unknown, lancamentoId: string, vencimento: string | null, agora: string): Boleto | null {
  if (!ehObjeto(order) || typeof order.id !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(order.id)) return null;
  if (order.external_reference !== lancamentoId) return null;
  const p = pagamento(order);
  const m = ehObjeto(p.payment_method) ? p.payment_method : {};
  return {
    id: order.id,
    status: textoOu(order.status, 40) ?? 'desconhecido',
    url: httpsOu(m.ticket_url),
    linha: textoOu(m.digitable_line, 80),
    vencimento,
    emitido_em: agora,
  };
}

/** Pago? Valor e dia do pagamento (dia de São Paulo; sem data, o dia de hoje). */
export function pagamentoDaOrder(order: Record<string, unknown>, hoje: string): { centavos: number; dia: string } | null {
  if (order.status !== 'processed') return null;
  const p = pagamento(order);
  const bruto = order.total_paid_amount ?? p.paid_amount ?? order.total_amount ?? p.amount;
  const valor = typeof bruto === 'string' || typeof bruto === 'number' ? Math.round(Number(bruto) * 100) : NaN;
  if (!Number.isFinite(valor) || valor <= 0) return null;
  const quando = textoOu(p.date_approved, 40) ?? textoOu(order.last_updated_date, 40);
  const dia = quando && Number.isFinite(Date.parse(quando))
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(quando))
    : hoje;
  return { centavos: valor, dia };
}

// ---------------------------------------------------------------------------
// Nota fiscal (Focus NFe)
// ---------------------------------------------------------------------------

export interface ConfigFiscal {
  cnpj: string;
  uf: string;
  natureza_operacao: string;
  cfop_estadual: string;
  cfop_interestadual: string;
  ncm: string;
  unidade: string;
  icms_situacao_tributaria: string;
  icms_origem: string;
  pis_situacao_tributaria: string;
  cofins_situacao_tributaria: string;
  /** 0 a 9 (9 = sem frete). */
  modalidade_frete: string;
  /** Presença do comprador (código da NF-e). */
  presenca_comprador: string;
  nfse?: {
    inscricao_municipal: string;
    codigo_municipio: string;
    item_lista_servico: string;
    codigo_tributario_municipio: string;
    /** Em %, com ponto: "2.00". */
    aliquota: string;
    iss_retido: boolean;
  };
}

const ROTULO_FISCAL: Record<string, string> = {
  cnpj: 'CNPJ da marcenaria',
  uf: 'UF da marcenaria',
  natureza_operacao: 'natureza da operação',
  cfop_estadual: 'CFOP dentro do estado',
  cfop_interestadual: 'CFOP para fora do estado',
  ncm: 'NCM',
  unidade: 'unidade',
  icms_situacao_tributaria: 'situação tributária do ICMS (CSOSN ou CST)',
  icms_origem: 'origem da mercadoria',
  pis_situacao_tributaria: 'situação tributária do PIS',
  cofins_situacao_tributaria: 'situação tributária do COFINS',
  modalidade_frete: 'modalidade do frete',
  presenca_comprador: 'presença do comprador',
};

const FORMATO_FISCAL: Record<string, RegExp> = {
  cnpj: /^[0-9A-Z]{12}[0-9]{2}$/,
  uf: /^[A-Z]{2}$/,
  natureza_operacao: /^.{3,60}$/,
  cfop_estadual: /^5[0-9]{3}$/,
  cfop_interestadual: /^6[0-9]{3}$/,
  ncm: /^[0-9]{8}$/,
  unidade: /^[A-Za-z0-9]{1,6}$/,
  icms_situacao_tributaria: /^[0-9]{2,3}$/,
  icms_origem: /^[0-8]$/,
  pis_situacao_tributaria: /^[0-9]{2}$/,
  cofins_situacao_tributaria: /^[0-9]{2}$/,
  modalidade_frete: /^[0-49]$/,
  presenca_comprador: /^[0-59]$/,
};

/** Confere a configuração fiscal que o dono salvou. Devolve a lista do que falta ou está errado. */
export function conferirConfigFiscal(v: unknown, comNfse: boolean): Montado<ConfigFiscal> {
  if (!ehObjeto(v)) return falha('Preencha os dados fiscais da marcenaria (Financeiro → Boleto e nota).');
  const ruins = Object.keys(FORMATO_FISCAL).filter((k) => typeof v[k] !== 'string' || !FORMATO_FISCAL[k]!.test(v[k] as string));
  if (comNfse) {
    const n = ehObjeto(v.nfse) ? v.nfse : {};
    if (typeof n.inscricao_municipal !== 'string' || !/^[0-9A-Za-z.-]{1,20}$/.test(n.inscricao_municipal)) ruins.push('inscrição municipal');
    if (typeof n.codigo_municipio !== 'string' || !/^[0-9]{7}$/.test(n.codigo_municipio)) ruins.push('código IBGE do município da marcenaria');
    if (typeof n.item_lista_servico !== 'string' || !/^[0-9.]{2,8}$/.test(n.item_lista_servico)) ruins.push('item da lista de serviço');
    if (typeof n.codigo_tributario_municipio !== 'string' || n.codigo_tributario_municipio.length > 20) ruins.push('código tributário do município');
    if (typeof n.aliquota !== 'string' || !/^[0-9]{1,2}(\.[0-9]{1,4})?$/.test(n.aliquota)) ruins.push('alíquota do ISS');
    if (typeof n.iss_retido !== 'boolean') ruins.push('ISS retido (sim ou não)');
  }
  if (ruins.length) return falha(`Confira nos dados fiscais: ${ruins.map((k) => ROTULO_FISCAL[k] ?? k).join(', ')}.`);
  return { ok: true, valor: v as unknown as ConfigFiscal };
}

export interface ItemNota {
  codigo: string;
  descricao: string;
  quantidade: number;
  valorCentavos: number;
  /** Se vazio, o NCM padrão da configuração. */
  ncm?: string;
}

/** Data e hora de agora no fuso de Brasília, como a NF-e pede (AAAA-MM-DDTHH:MM:SS-03:00). */
export function agoraBrasilia(agora: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(agora)
    .reduce<Record<string, string>>((a, x) => ({ ...a, [x.type]: x.value }), {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-03:00`;
}

/** Corpo do POST /v2/nfe da Focus NFe (venda de móvel, um ou mais itens). */
export function notaNfe(cfg: ConfigFiscal, c: ClienteCobranca, itens: readonly ItemNota[], agora: Date): Montado<Record<string, unknown>> {
  const faltas = faltasDoCliente(c);
  if (faltas.length) return falha(`Complete o cadastro do cliente: ${faltas.join(', ')}.`);
  if (itens.length === 0 || itens.length > 50) return falha('A nota precisa de 1 a 50 itens.');
  for (const i of itens) {
    if (!i.descricao.trim() || i.descricao.length > 120) return falha('Cada item precisa de descrição (até 120 letras).');
    if (!Number.isInteger(i.quantidade) || i.quantidade < 1 || i.quantidade > 9999) return falha('Quantidade de 1 a 9999.');
    if (!Number.isInteger(i.valorCentavos) || i.valorCentavos < 1) return falha('Valor do item inválido.');
    if (i.ncm && !/^[0-9]{8}$/.test(i.ncm)) return falha('NCM com 8 números.');
  }
  const pj = c.documento!.length === 14;
  const ie = c.inscricao_estadual;
  const mesmoEstado = c.uf === cfg.uf;
  const total = itens.reduce((s, i) => s + i.valorCentavos, 0);
  return {
    ok: true,
    valor: {
      natureza_operacao: cfg.natureza_operacao,
      data_emissao: agoraBrasilia(agora),
      tipo_documento: 1,
      finalidade_emissao: 1,
      cnpj_emitente: cfg.cnpj,
      nome_destinatario: c.nome.slice(0, 60),
      ...(pj ? { cnpj_destinatario: c.documento } : { cpf_destinatario: c.documento }),
      indicador_inscricao_estadual_destinatario: pj && ie && ie !== 'ISENTO' ? 1 : pj && ie === 'ISENTO' ? 2 : 9,
      ...(pj && ie && ie !== 'ISENTO' ? { inscricao_estadual_destinatario: ie } : {}),
      logradouro_destinatario: c.logradouro,
      numero_destinatario: c.numero?.trim() || 'S/N',
      ...(c.complemento ? { complemento_destinatario: c.complemento } : {}),
      bairro_destinatario: c.bairro,
      municipio_destinatario: c.cidade,
      uf_destinatario: c.uf,
      cep_destinatario: c.cep,
      pais_destinatario: 'Brasil',
      ...(c.telefone ? { telefone_destinatario: c.telefone.replace(/\D/g, '').slice(0, 14) } : {}),
      ...(c.email ? { email_destinatario: c.email } : {}),
      consumidor_final: 1,
      presenca_comprador: Number(cfg.presenca_comprador),
      local_destino: mesmoEstado ? 1 : 2,
      modalidade_frete: Number(cfg.modalidade_frete),
      valor_produtos: reais(total),
      valor_total: reais(total),
      items: itens.map((i, k) => {
        const unitario = (i.valorCentavos / 100 / i.quantidade).toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
        return {
          numero_item: k + 1,
          codigo_produto: i.codigo.slice(0, 60),
          descricao: i.descricao.trim(),
          cfop: mesmoEstado ? cfg.cfop_estadual : cfg.cfop_interestadual,
          unidade_comercial: cfg.unidade,
          quantidade_comercial: i.quantidade,
          valor_unitario_comercial: unitario,
          unidade_tributavel: cfg.unidade,
          quantidade_tributavel: i.quantidade,
          valor_unitario_tributavel: unitario,
          valor_bruto: reais(i.valorCentavos),
          codigo_ncm: i.ncm || cfg.ncm,
          icms_situacao_tributaria: cfg.icms_situacao_tributaria,
          icms_origem: Number(cfg.icms_origem),
          pis_situacao_tributaria: cfg.pis_situacao_tributaria,
          cofins_situacao_tributaria: cfg.cofins_situacao_tributaria,
        };
      }),
    },
  };
}

/** Corpo do POST /v2/nfse da Focus NFe (montagem ou outro serviço). */
export function notaNfse(cfg: ConfigFiscal, c: ClienteCobranca, discriminacao: string, valorCentavos: number, agora: Date): Montado<Record<string, unknown>> {
  if (!cfg.nfse) return falha('Preencha os dados da NFS-e (inscrição municipal, item da lista de serviço, alíquota).');
  const faltas = faltasDoCliente(c, true);
  if (faltas.length) return falha(`Complete o cadastro do cliente: ${faltas.join(', ')}.`);
  if (!discriminacao.trim() || discriminacao.length > 2000) return falha('Descreva o serviço (até 2000 letras).');
  if (!Number.isInteger(valorCentavos) || valorCentavos < 1) return falha('Valor do serviço inválido.');
  const n = cfg.nfse;
  return {
    ok: true,
    valor: {
      data_emissao: agoraBrasilia(agora),
      prestador: { cnpj: cfg.cnpj, inscricao_municipal: n.inscricao_municipal, codigo_municipio: n.codigo_municipio },
      tomador: {
        ...(c.documento!.length === 14 ? { cnpj: c.documento } : { cpf: c.documento }),
        razao_social: c.nome.slice(0, 115),
        ...(c.email ? { email: c.email } : {}),
        endereco: {
          logradouro: c.logradouro,
          numero: c.numero?.trim() || 'S/N',
          ...(c.complemento ? { complemento: c.complemento } : {}),
          bairro: c.bairro,
          codigo_municipio: c.codigo_municipio,
          uf: c.uf,
          cep: c.cep,
        },
      },
      servico: {
        aliquota: n.aliquota,
        discriminacao: discriminacao.trim(),
        iss_retido: n.iss_retido,
        item_lista_servico: n.item_lista_servico,
        ...(n.codigo_tributario_municipio ? { codigo_tributario_municipio: n.codigo_tributario_municipio } : {}),
        valor_servicos: reais(valorCentavos),
      },
    },
  };
}

export const BASE_FOCUS = { teste: 'https://homologacao.focusnfe.com.br', producao: 'https://api.focusnfe.com.br' } as const;

export interface SituacaoNota {
  status: string;
  numero: string | null;
  serie: string | null;
  chave: string | null;
  url_pdf: string | null;
  url_xml: string | null;
  mensagem: string | null;
}

/** Caminho de arquivo devolvido pela Focus ("/arquivos/…"): vira endereço completo no mesmo ambiente. */
function arquivo(base: string, v: unknown): string | null {
  const t = textoOu(v, 1000);
  if (!t) return null;
  if (/^https:\/\//.test(t)) return t;
  return t.startsWith('/') ? `${base}${t}` : null;
}

/** Lê a resposta da Focus (emissão, consulta ou cancelamento) de NF-e ou NFS-e. */
export function lerNotaFocus(dados: unknown, base: string): SituacaoNota | null {
  if (!ehObjeto(dados) || typeof dados.status !== 'string') return null;
  const erros = Array.isArray(dados.erros) ? dados.erros.filter(ehObjeto).map((e) => textoOu(e.mensagem, 300)).filter(Boolean) : [];
  const mensagem = [textoOu(dados.mensagem_sefaz, 500), textoOu(dados.mensagem, 500), ...erros].filter(Boolean).join(' · ').slice(0, 2000) || null;
  return {
    status: dados.status.slice(0, 40),
    numero: textoOu(dados.numero, 20) ?? (typeof dados.numero === 'number' ? String(dados.numero) : null),
    serie: textoOu(dados.serie, 10) ?? (typeof dados.serie === 'number' ? String(dados.serie) : null),
    chave: textoOu(dados.chave_nfe, 60) ?? textoOu(dados.codigo_verificacao, 60),
    url_pdf: arquivo(base, dados.caminho_danfe) ?? arquivo(base, dados.url_danfse) ?? httpsOu(dados.url),
    url_xml: arquivo(base, dados.caminho_xml_nota_fiscal),
    mensagem,
  };
}
