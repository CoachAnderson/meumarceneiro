/**
 * Cobrança da marcenaria — lógica da função de servidor.
 *
 * Boleto pelo Mercado Pago da marcenaria e nota fiscal pela Focus NFe da
 * marcenaria. Cada marcenaria cola a própria chave; ela é guardada cifrada e
 * só esta função a lê. O dinheiro do boleto cai direto na conta da
 * marcenaria: nada passa pelo sistema.
 *
 * Ações (POST, com o login do dono; a assinatura precisa estar ativa):
 *   salvar_integracao   testa e guarda a chave (cifrada) e a configuração
 *   remover_integracao
 *   emitir_boleto       { lancamento }  boleto com o vencimento da conta a receber
 *   cancelar_boleto     { lancamento }
 *   conferir_boletos    { empresa }     consulta os boletos em aberto; pago vira baixa
 *   emitir_nota         { orcamento, tipo: 'nfe' | 'nfse', ... }
 *   consultar_nota      { nota }
 *   cancelar_nota       { nota, justificativa }
 */
import { cabecalhosServico } from '../_shared/chaves.ts';
import { cifrar, decifrar, finalDaChave } from '../_shared/cofre.ts';
import {
  BASE_FOCUS,
  conferirConfigFiscal,
  ehObjeto,
  lerNotaFocus,
  lerOrder,
  notaNfe,
  notaNfse,
  pagamentoDaOrder,
  pedidoDoBoleto,
  UUID,
  type Boleto,
  type ClienteCobranca,
  type ItemNota,
} from './montar.ts';

export interface Resposta {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type Buscar = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<Resposta>;

export interface Dependencias {
  buscar: Buscar;
  supabaseUrl: string;
  anonKey: string;
  chaveServico: string;
  /** Segredo INTEGRACOES_CHAVE (32 bytes em base64). */
  chaveCofre: string;
  agora: () => Date;
  novoId: () => string;
}

export interface Pedido {
  metodo: string;
  autorizacao: string | null;
  corpo: unknown;
}

export interface Saida {
  status: number;
  corpo: Record<string, unknown>;
}

const erro = (status: number, mensagem: string, codigo: string): Saida => ({ status, corpo: { erro: mensagem, codigo } });
const hojeSP = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const COLUNAS_CLIENTE = 'nome,documento,email,telefone,cep,logradouro,numero,complemento,bairro,cidade,uf,codigo_municipio,inscricao_estadual';
type Provedor = 'mercado_pago' | 'focus_nfe';

/** REST do Supabase: com o login de quem chamou (RLS vale) ou com a chave de serviço. */
function rest(d: Dependencias, autorizacao: string | null) {
  const cab: Record<string, string> = autorizacao
    ? { apikey: d.anonKey, Authorization: autorizacao, 'Content-Type': 'application/json' }
    : { ...cabecalhosServico(d.chaveServico), 'Content-Type': 'application/json' };
  return async (metodo: string, caminho: string, corpo?: unknown, extra: Record<string, string> = {}) => {
    const r = await d.buscar(`${d.supabaseUrl}/rest/v1/${caminho}`, { method: metodo, headers: { ...cab, ...extra }, ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }) });
    return { ok: r.ok, status: r.status, dados: await r.json().catch(() => null) };
  };
}

/** Chave e configuração da integração (só o servidor decifra). */
async function integracao(d: Dependencias, empresa: string, provedor: Provedor) {
  const r = await rest(d, null)('GET', `integracoes?empresa_id=eq.${empresa}&provedor=eq.${provedor}&select=segredo,ambiente,dados`);
  const linha = Array.isArray(r.dados) && ehObjeto(r.dados[0]) ? r.dados[0] : null;
  if (!r.ok || !linha || typeof linha.segredo !== 'string') return null;
  return { token: await decifrar(linha.segredo, d.chaveCofre), ambiente: linha.ambiente === 'producao' ? ('producao' as const) : ('teste' as const), dados: ehObjeto(linha.dados) ? linha.dados : {} };
}

function chamarMP(d: Dependencias, token: string) {
  return async (metodo: 'GET' | 'POST', caminho: string, corpo?: unknown, idempotencia?: string) => {
    const r = await d.buscar(`https://api.mercadopago.com${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(idempotencia ? { 'X-Idempotency-Key': idempotencia } : {}) },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });
    return { ok: r.ok, status: r.status, dados: await r.json().catch(() => null) };
  };
}

function chamarFocus(d: Dependencias, token: string, ambiente: 'teste' | 'producao') {
  const base = BASE_FOCUS[ambiente];
  return {
    base,
    pedir: async (metodo: 'GET' | 'POST' | 'DELETE', caminho: string, corpo?: unknown) => {
      const r = await d.buscar(`${base}${caminho}`, {
        method: metodo,
        headers: { Authorization: `Basic ${btoa(`${token}:`)}`, 'Content-Type': 'application/json' },
        ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      });
      return { ok: r.ok, status: r.status, dados: await r.json().catch(() => null) };
    },
  };
}

/** Mensagem do Mercado Pago para mostrar ao dono (sem expor a chave). */
function mensagemMP(dados: unknown): string {
  if (!ehObjeto(dados)) return '';
  const lista = Array.isArray(dados.errors) ? dados.errors.filter(ehObjeto).map((e) => (typeof e.message === 'string' ? e.message : '')).filter(Boolean) : [];
  const m = typeof dados.message === 'string' ? dados.message : '';
  return [m, ...lista].join(' · ').slice(0, 400);
}

export async function tratar(pedido: Pedido, d: Dependencias): Promise<Saida> {
  if (pedido.metodo !== 'POST') return erro(405, 'Use POST.', 'metodo');
  if (!pedido.autorizacao || !/^Bearer \S+$/.test(pedido.autorizacao)) return erro(401, 'Entre no sistema.', 'sem_login');
  if (!d.chaveServico || !d.chaveCofre) return erro(503, 'Boleto e nota ainda não foram configurados neste sistema (falta o segredo INTEGRACOES_CHAVE).', 'sem_cofre');
  const c = ehObjeto(pedido.corpo) ? pedido.corpo : {};
  const acao = c.acao;
  const doUsuario = rest(d, pedido.autorizacao);
  const servico = rest(d, null);
  const agora = d.agora();
  const hoje = hojeSP(agora);

  /** Dono da empresa, com assinatura ativa. */
  const podeCobrar = async (empresa: string) => {
    const r = await doUsuario('POST', 'rpc/pode_cobrar', { p_empresa: empresa });
    return r.ok && r.dados === true;
  };
  const negado = erro(403, 'Só o dono, com a assinatura ativa, usa boleto e nota fiscal.', 'sem_permissao');

  // -------------------------------------------------------------------------
  if (acao === 'salvar_integracao' || acao === 'remover_integracao') {
    const empresa = typeof c.empresa === 'string' && UUID.test(c.empresa) ? c.empresa : null;
    const provedor = c.provedor === 'mercado_pago' || c.provedor === 'focus_nfe' ? (c.provedor as Provedor) : null;
    if (!empresa || !provedor) return erro(400, 'Pedido inválido.', 'pedido');
    if (!(await podeCobrar(empresa))) return negado;
    if (acao === 'remover_integracao') {
      const r = await servico('DELETE', `integracoes?empresa_id=eq.${empresa}&provedor=eq.${provedor}`);
      return r.ok ? { status: 200, corpo: { ok: true } } : erro(502, 'Não foi possível remover.', 'banco');
    }
    const ambiente = c.ambiente === 'producao' ? 'producao' : c.ambiente === 'teste' ? 'teste' : null;
    if (!ambiente) return erro(400, 'Escolha teste ou produção.', 'ambiente');
    const dados = ehObjeto(c.dados) ? c.dados : {};
    if (JSON.stringify(dados).length > 8000) return erro(400, 'Configuração grande demais.', 'dados');
    const token = typeof c.token === 'string' ? c.token.trim() : '';
    let segredo: string | null = null;
    if (token) {
      if (token.length < 10 || token.length > 400 || /\s/.test(token)) return erro(400, 'A chave colada não parece válida.', 'token');
      // Testa a chave antes de guardar.
      if (provedor === 'mercado_pago') {
        const t = await chamarMP(d, token)('GET', '/users/me');
        if (!t.ok) return erro(400, 'O Mercado Pago não aceitou esta chave (Access Token). Confira se copiou a chave inteira.', 'token_invalido');
      } else {
        const t = await chamarFocus(d, token, ambiente).pedir('GET', '/v2/nfe/teste-de-conexao-meu-marceneiro');
        if (t.status === 401 || t.status === 403) return erro(400, `A Focus NFe não aceitou este token no ambiente de ${ambiente === 'teste' ? 'homologação' : 'produção'}.`, 'token_invalido');
      }
      segredo = await cifrar(token, d.chaveCofre);
    }
    if (provedor === 'focus_nfe' && Object.keys(dados).length) {
      const conf = conferirConfigFiscal(dados, ehObjeto(dados.nfse));
      if (!conf.ok) return erro(400, conf.erro, 'config_fiscal');
    }
    if (provedor === 'mercado_pago' && dados.conta_id !== undefined && dados.conta_id !== null && !(typeof dados.conta_id === 'string' && UUID.test(dados.conta_id))) {
      return erro(400, 'Conta inválida.', 'dados');
    }
    if (segredo) {
      const r = await servico(
        'POST',
        'integracoes',
        { empresa_id: empresa, provedor, ambiente, segredo, final: finalDaChave(token), dados, updated_at: agora.toISOString() },
        { Prefer: 'resolution=merge-duplicates,return=minimal' },
      );
      if (!r.ok) return erro(502, 'Não foi possível guardar a chave.', 'banco');
    } else {
      const r = await servico('PATCH', `integracoes?empresa_id=eq.${empresa}&provedor=eq.${provedor}`, { ambiente, dados, updated_at: agora.toISOString() }, { Prefer: 'return=representation' });
      if (!r.ok || !Array.isArray(r.dados) || r.dados.length === 0) return erro(400, 'Cole a chave para ligar a integração.', 'sem_token');
    }
    return { status: 200, corpo: { ok: true } };
  }

  // -------------------------------------------------------------------------
  if (acao === 'emitir_boleto' || acao === 'cancelar_boleto') {
    const id = typeof c.lancamento === 'string' && UUID.test(c.lancamento) ? c.lancamento : null;
    if (!id) return erro(400, 'Pedido inválido.', 'pedido');
    // Lido com o login do dono: a RLS garante que a conta é da empresa dele.
    const r = await doUsuario('GET', `lancamentos?id=eq.${id}&select=id,empresa_id,tipo,descricao,valor_centavos,vencimento,status,boleto,cliente:clientes(${COLUNAS_CLIENTE})`);
    const l = Array.isArray(r.dados) && ehObjeto(r.dados[0]) ? r.dados[0] : null;
    if (!l || l.tipo !== 'receber') return erro(404, 'Conta a receber não encontrada.', 'nao_encontrado');
    const empresa = l.empresa_id as string;
    if (!(await podeCobrar(empresa))) return negado;
    const mp = await integracao(d, empresa, 'mercado_pago');
    if (!mp) return erro(400, 'Ligue o Mercado Pago da marcenaria em Financeiro → Boleto e nota.', 'sem_integracao');
    const chamar = chamarMP(d, mp.token);
    const atual = ehObjeto(l.boleto) ? (l.boleto as unknown as Boleto) : null;

    if (acao === 'cancelar_boleto') {
      if (!atual) return erro(400, 'Esta conta não tem boleto.', 'sem_boleto');
      const x = await chamar('POST', `/v1/orders/${encodeURIComponent(atual.id)}/cancel`, undefined, d.novoId());
      if (!x.ok && x.status !== 409) return erro(502, `O Mercado Pago não cancelou: ${mensagemMP(x.dados) || x.status}.`, 'mp');
      const novo = { ...atual, status: 'canceled' };
      await servico('PATCH', `lancamentos?id=eq.${id}`, { boleto: novo });
      return { status: 200, corpo: { ok: true, boleto: novo } };
    }

    if (atual && !['canceled', 'cancelled', 'expired', 'failed'].includes(atual.status)) return erro(409, 'Esta conta já tem boleto. Cancele o anterior para gerar outro.', 'ja_tem');
    const montado = pedidoDoBoleto(
      { id, descricao: String(l.descricao), valor_centavos: Number(l.valor_centavos), vencimento: String(l.vencimento), status: String(l.status) },
      ehObjeto(l.cliente) ? (l.cliente as unknown as ClienteCobranca) : null,
      hoje,
    );
    if (!montado.ok) return erro(400, montado.erro, 'dados');
    const x = await chamar('POST', '/v1/orders', montado.valor, d.novoId());
    if (!x.ok) return erro(502, `O Mercado Pago recusou o boleto: ${mensagemMP(x.dados) || x.status}.`, 'mp');
    const boleto = lerOrder(x.dados, id, String(l.vencimento), agora.toISOString());
    if (!boleto) return erro(502, 'Resposta inesperada do Mercado Pago.', 'mp');
    const g = await servico('PATCH', `lancamentos?id=eq.${id}`, { boleto, forma: 'boleto' });
    if (!g.ok) return erro(502, 'O boleto foi gerado, mas não deu para guardar. Confira no Mercado Pago.', 'banco');
    return { status: 200, corpo: { ok: true, boleto } };
  }

  // -------------------------------------------------------------------------
  if (acao === 'conferir_boletos') {
    const empresa = typeof c.empresa === 'string' && UUID.test(c.empresa) ? c.empresa : null;
    if (!empresa) return erro(400, 'Pedido inválido.', 'pedido');
    if (!(await podeCobrar(empresa))) return negado;
    const resultado = await conferirBoletos(d, empresa, hoje);
    return { status: 200, corpo: { ok: true, ...resultado } };
  }

  // -------------------------------------------------------------------------
  if (acao === 'emitir_nota') {
    const orc = typeof c.orcamento === 'string' && UUID.test(c.orcamento) ? c.orcamento : null;
    const tipo = c.tipo === 'nfe' || c.tipo === 'nfse' ? c.tipo : null;
    if (!orc || !tipo) return erro(400, 'Pedido inválido.', 'pedido');
    const r = await doUsuario('GET', `orcamentos?id=eq.${orc}&select=id,empresa_id,numero,status,total_centavos,projeto_nome,cliente_id,cliente:clientes(${COLUNAS_CLIENTE})`);
    const o = Array.isArray(r.dados) && ehObjeto(r.dados[0]) ? r.dados[0] : null;
    if (!o) return erro(404, 'Orçamento não encontrado.', 'nao_encontrado');
    const empresa = o.empresa_id as string;
    if (!(await podeCobrar(empresa))) return negado;
    if (o.status !== 'aprovado') return erro(400, 'Só se emite nota de orçamento aprovado.', 'status');
    const cliente = ehObjeto(o.cliente) ? (o.cliente as unknown as ClienteCobranca) : null;
    if (!cliente) return erro(400, 'O orçamento não tem cliente cadastrado.', 'sem_cliente');
    const focus = await integracao(d, empresa, 'focus_nfe');
    if (!focus) return erro(400, 'Ligue a Focus NFe da marcenaria em Financeiro → Boleto e nota.', 'sem_integracao');
    const conf = conferirConfigFiscal(focus.dados, tipo === 'nfse');
    if (!conf.ok) return erro(400, conf.erro, 'config_fiscal');

    let corpo: Record<string, unknown>;
    let valor: number;
    if (tipo === 'nfe') {
      const itens: ItemNota[] = Array.isArray(c.itens)
        ? c.itens.filter(ehObjeto).map((i) => ({
            codigo: typeof i.codigo === 'string' ? i.codigo : `ORC${o.numero}`,
            descricao: typeof i.descricao === 'string' ? i.descricao : '',
            quantidade: typeof i.quantidade === 'number' ? i.quantidade : 1,
            valorCentavos: typeof i.valor_centavos === 'number' ? i.valor_centavos : 0,
            ncm: typeof i.ncm === 'string' ? i.ncm : undefined,
          }))
        : [];
      valor = itens.reduce((s, i) => s + i.valorCentavos, 0);
      const m = notaNfe(conf.valor, cliente, itens, agora);
      if (!m.ok) return erro(400, m.erro, 'dados');
      corpo = m.valor;
    } else {
      valor = typeof c.valor_centavos === 'number' ? c.valor_centavos : 0;
      const m = notaNfse(conf.valor, cliente, typeof c.discriminacao === 'string' ? c.discriminacao : '', valor, agora);
      if (!m.ok) return erro(400, m.erro, 'dados');
      corpo = m.valor;
    }
    if (valor > Number(o.total_centavos)) return erro(400, 'A nota passa do total do orçamento.', 'valor');

    const notaId = d.novoId();
    const ref = notaId.replace(/-/g, '');
    const ins = await servico(
      'POST',
      'notas_fiscais',
      { id: notaId, empresa_id: empresa, tipo, ambiente: focus.ambiente, ref, orcamento_id: orc, cliente_id: o.cliente_id, valor_centavos: valor, status: 'enviando', envio: corpo },
      { Prefer: 'return=minimal' },
    );
    if (!ins.ok) return erro(502, 'Não foi possível registrar a nota.', 'banco');
    const api = chamarFocus(d, focus.token, focus.ambiente);
    const x = await api.pedir('POST', `/v2/${tipo}?ref=${ref}`, corpo);
    const sit = lerNotaFocus(x.dados, api.base);
    const status = sit?.status ?? (x.ok ? 'processando_autorizacao' : 'erro_envio');
    await servico('PATCH', `notas_fiscais?id=eq.${notaId}`, { ...(sit ?? {}), status, mensagem: sit?.mensagem ?? (x.ok ? null : `A Focus NFe respondeu ${x.status}.`) });
    return { status: x.ok ? 200 : 400, corpo: x.ok ? { ok: true, nota: notaId, status } : { erro: sit?.mensagem ?? `A Focus NFe recusou a nota (${x.status}).`, codigo: 'focus', nota: notaId } };
  }

  // -------------------------------------------------------------------------
  if (acao === 'consultar_nota' || acao === 'cancelar_nota') {
    const id = typeof c.nota === 'string' && UUID.test(c.nota) ? c.nota : null;
    if (!id) return erro(400, 'Pedido inválido.', 'pedido');
    const r = await doUsuario('GET', `notas_fiscais?id=eq.${id}&select=id,empresa_id,tipo,ref,ambiente,status`);
    const n = Array.isArray(r.dados) && ehObjeto(r.dados[0]) ? r.dados[0] : null;
    if (!n) return erro(404, 'Nota não encontrada.', 'nao_encontrado');
    if (!(await podeCobrar(n.empresa_id as string))) return negado;
    const focus = await integracao(d, n.empresa_id as string, 'focus_nfe');
    if (!focus) return erro(400, 'Ligue a Focus NFe da marcenaria em Financeiro → Boleto e nota.', 'sem_integracao');
    if (focus.ambiente !== n.ambiente) return erro(400, `Esta nota foi emitida em ${n.ambiente === 'teste' ? 'homologação' : 'produção'}; a integração agora está no outro ambiente.`, 'ambiente');
    const api = chamarFocus(d, focus.token, focus.ambiente);
    let x;
    if (acao === 'cancelar_nota') {
      const just = typeof c.justificativa === 'string' ? c.justificativa.trim() : '';
      if (just.length < 15 || just.length > 255) return erro(400, 'A justificativa precisa ter de 15 a 255 letras.', 'justificativa');
      x = await api.pedir('DELETE', `/v2/${n.tipo}/${n.ref}`, { justificativa: just });
      if (!x.ok) {
        const s = lerNotaFocus(x.dados, api.base);
        return erro(400, s?.mensagem ?? `A Focus NFe não cancelou (${x.status}).`, 'focus');
      }
    }
    x = await api.pedir('GET', `/v2/${n.tipo}/${n.ref}`);
    const sit = lerNotaFocus(x.dados, api.base);
    if (!sit) return erro(502, 'Resposta inesperada da Focus NFe.', 'focus');
    await servico('PATCH', `notas_fiscais?id=eq.${id}`, sit);
    return { status: 200, corpo: { ok: true, ...sit } };
  }

  return erro(400, 'Ação desconhecida.', 'acao');
}

/**
 * Consulta no Mercado Pago os boletos em aberto da empresa (ou um só). Pago
 * vira baixa (conta do Mercado Pago escolhida na configuração); cancelado ou
 * vencido fica anotado no boleto. Também chamada pelo aviso do Mercado Pago.
 */
export async function conferirBoletos(d: Dependencias, empresa: string, hoje: string, soOrder?: string): Promise<{ conferidos: number; pagos: number }> {
  const servico = rest(d, null);
  const mp = await integracao(d, empresa, 'mercado_pago');
  if (!mp) return { conferidos: 0, pagos: 0 };
  const filtro = soOrder ? `&boleto->>id=eq.${encodeURIComponent(soOrder)}` : '';
  const r = await servico('GET', `lancamentos?empresa_id=eq.${empresa}&status=eq.aberto&boleto=not.is.null${filtro}&select=id,boleto&limit=50`);
  const lista = Array.isArray(r.dados) ? r.dados.filter(ehObjeto) : [];
  const chamar = chamarMP(d, mp.token);
  const conta = typeof mp.dados.conta_id === 'string' && UUID.test(mp.dados.conta_id) ? mp.dados.conta_id : null;
  let pagos = 0;
  let conferidos = 0;
  for (const l of lista) {
    const b = ehObjeto(l.boleto) ? (l.boleto as unknown as Boleto) : null;
    if (!b || ['canceled', 'cancelled', 'expired'].includes(b.status) || !/^[A-Za-z0-9_-]{4,64}$/.test(b.id)) continue;
    const x = await chamar('GET', `/v1/orders/${encodeURIComponent(b.id)}`);
    if (!x.ok || !ehObjeto(x.dados) || x.dados.external_reference !== l.id) continue;
    conferidos++;
    const status = typeof x.dados.status === 'string' ? x.dados.status.slice(0, 40) : b.status;
    const pago = pagamentoDaOrder(x.dados, hoje);
    if (pago) {
      const baixa = await servico('POST', 'rpc/baixar_lancamento', { p_id: l.id, p_pago_em: pago.dia, p_valor_centavos: pago.centavos, p_conta: conta, p_forma: 'boleto', p_parcial: false });
      if (baixa.ok) pagos++;
    }
    if (status !== b.status) await servico('PATCH', `lancamentos?id=eq.${l.id}`, { boleto: { ...b, status } });
  }
  return { conferidos, pagos };
}

export { hojeSP };
