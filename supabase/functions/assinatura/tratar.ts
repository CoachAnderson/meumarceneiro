/**
 * Assinatura do sistema — lógica da função de servidor.
 *
 * Modelo do Mercado Pago: assinatura sem plano associado, com pagamento
 * pendente. O servidor cria a assinatura (status pending) e devolve o
 * init_point; o dono paga na página do Mercado Pago. Nenhum dado de cartão
 * passa por este sistema.
 *
 * Ações (POST, com o login do usuário):
 *   assinar    cria a assinatura no Mercado Pago e devolve o endereço de pagamento
 *   consultar  equivale a GET /api/subscriptions/:id — busca a situação no Mercado Pago e grava no banco
 *   pausar | reativar | cancelar   muda a situação (lista fechada)
 *
 * O navegador envia só a empresa, o código do plano e o e-mail de quem paga.
 * Preço, moeda, frequência, descrição e referência saem do servidor.
 */
import { clienteMP, ehObjeto, ID_MP, rpcServico, sincronizar, UUID, type Base } from '../_shared/mp.ts';

export interface OfertaServidor {
  codigo: string;
  reason: string;
  valorCentavos: number;
  frequency: number;
  frequency_type: string;
  currency_id: string;
}

export interface Dependencias extends Base {
  anonKey: string;
  /** Endereço público do site (segredo APP_URL), para a volta do pagamento. */
  appUrl: string;
  /** Catálogo de ofertas do servidor (gerado do motor: oferta.json). */
  offerCatalog: Record<string, OfertaServidor>;
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

/** pause → paused, reactivate → authorized, cancel → cancelled (canceled). Nenhum outro valor é aceito. */
const CICLO = { pausar: 'paused', reativar: 'authorized', cancelar: 'cancelled' } as const;

const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,180}\.[^@\s]{2,}$/;
const erro = (status: number, mensagem: string, codigo: string): Saida => ({ status, corpo: { erro: mensagem, codigo } });

/** O endereço de pagamento só pode ser do Mercado Pago, em HTTPS. */
export function enderecoDoMercadoPago(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  try {
    const u = new URL(valor);
    const ok = u.protocol === 'https:' && /(^|\.)mercadopago\.com(\.br)?$/.test(u.hostname);
    return ok ? u.toString() : null;
  } catch {
    return null;
  }
}

function subscriptionBackUrl(appUrl: string): string | null {
  try {
    const u = new URL(appUrl);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null;
    return `${u.origin}/assinatura`;
  } catch {
    return null;
  }
}

export async function tratar(pedido: Pedido, d: Dependencias): Promise<Saida> {
  if (pedido.metodo !== 'POST') return erro(405, 'Use POST.', 'metodo');
  if (!pedido.autorizacao || !/^Bearer \S+$/.test(pedido.autorizacao)) return erro(401, 'Entre no sistema para ver a assinatura.', 'sem_login');
  if (!d.credencialMP || !d.chaveServico) return erro(503, 'A cobrança ainda não foi configurada neste sistema.', 'sem_cobranca');
  const autorizacao = pedido.autorizacao;

  const c = pedido.corpo;
  if (!ehObjeto(c) || typeof c.acao !== 'string') return erro(400, 'Pedido inválido.', 'pedido');
  if (typeof c.empresaId !== 'string' || !UUID.test(c.empresaId)) return erro(400, 'Empresa inválida.', 'pedido');
  const empresaId = c.empresaId;
  const mpFetch = clienteMP(d);
  const cabecalhosUsuario = { 'content-type': 'application/json', apikey: d.anonKey, authorization: autorizacao };

  /** Assinatura mais recente da empresa, lida com o login do usuário: a RLS só mostra ao dono. */
  const lerAssinatura = async (filtro: string): Promise<{ id: string; mp_preapproval_id: string | null; status: string } | null | 'erro'> => {
    const r = await d.buscar(`${d.supabaseUrl}/rest/v1/assinaturas?empresa_id=eq.${empresaId}${filtro}&select=id,mp_preapproval_id,status&order=created_at.desc&limit=1`, { method: 'GET', headers: cabecalhosUsuario });
    if (!r.ok) return 'erro';
    const l = await r.json().catch(() => null);
    if (!Array.isArray(l)) return 'erro';
    const a = l[0];
    if (!ehObjeto(a) || typeof a.id !== 'string' || typeof a.status !== 'string') return null;
    return { id: a.id, mp_preapproval_id: typeof a.mp_preapproval_id === 'string' ? a.mp_preapproval_id : null, status: a.status };
  };

  try {
    // ---- Consultar: reconciliação com o Mercado Pago.
    if (c.acao === 'consultar') {
      const a = await lerAssinatura('');
      if (a === 'erro') return erro(502, 'Não foi possível ler a assinatura. Tente de novo.', 'banco');
      if (!a?.mp_preapproval_id) return { status: 200, corpo: { sincronizada: false } };
      const s = await sincronizar(d, a.mp_preapproval_id, a.id);
      if (!s.ok) return erro(502, 'O Mercado Pago não respondeu agora. A situação mostrada pode estar desatualizada; tente de novo em instantes.', 'mp');
      return { status: 200, corpo: { sincronizada: true, status: s.status } };
    }

    // ---- Pausar, reativar, cancelar.
    if (c.acao === 'pausar' || c.acao === 'reativar' || c.acao === 'cancelar') {
      const novo = CICLO[c.acao];
      const a = await lerAssinatura('&status=in.(ativa,pausada,pendente)');
      if (a === 'erro') return erro(502, 'Não foi possível ler a assinatura. Tente de novo.', 'banco');
      if (!a?.mp_preapproval_id || !ID_MP.test(a.mp_preapproval_id)) return erro(404, 'Não há assinatura em aberto para alterar. Só o dono da empresa altera a assinatura.', 'sem_assinatura');
      if (c.acao === 'pausar' && a.status !== 'ativa') return erro(409, 'Só uma assinatura ativa pode ser pausada.', 'situacao');
      if (c.acao === 'reativar' && a.status !== 'pausada') return erro(409, 'Só uma assinatura pausada pode ser reativada.', 'situacao');
      const r = await mpFetch('PUT', '/preapproval/' + encodeURIComponent(a.mp_preapproval_id), { status: novo });
      if (!r.ok) return erro(502, 'O Mercado Pago não aceitou a alteração agora. Tente de novo em instantes.', 'mp');
      const s = await sincronizar(d, a.mp_preapproval_id, a.id);
      if (!s.ok) return erro(502, 'A alteração foi enviada, mas não deu para confirmar a situação. Atualize a página em instantes.', 'mp');
      return { status: 200, corpo: { status: s.status } };
    }

    if (c.acao !== 'assinar') return erro(400, 'Ação desconhecida.', 'pedido');

    // ---- Assinar.
    const trustedOffer = typeof c.plano === 'string' && Object.hasOwn(d.offerCatalog, c.plano) ? d.offerCatalog[c.plano] : undefined;
    if (!trustedOffer) return erro(400, 'Plano desconhecido.', 'plano');
    if (typeof c.email !== 'string' || c.email.length > 254 || !EMAIL.test(c.email.trim())) return erro(400, 'Informe o e-mail da conta do Mercado Pago que vai pagar.', 'email');
    const email = c.email.trim().toLowerCase();
    const backUrl = subscriptionBackUrl(d.appUrl);
    if (!backUrl) return erro(503, 'A cobrança ainda não foi configurada neste sistema (falta o endereço do site no servidor).', 'sem_cobranca');

    // Reserva no banco com o login do usuário: vale a regra dele (só o dono, uma assinatura por empresa).
    const reserva = await d.buscar(`${d.supabaseUrl}/rest/v1/rpc/iniciar_assinatura`, { method: 'POST', headers: cabecalhosUsuario, body: JSON.stringify({ p_empresa: empresaId, p_plano: trustedOffer.codigo }) });
    const dadosReserva = await reserva.json().catch(() => null);
    if (!reserva.ok) {
      const e = ehObjeto(dadosReserva) ? dadosReserva : {};
      if (e.hint === 'ja_assinante') return erro(409, 'Esta empresa já tem uma assinatura.', 'ja_assinante');
      if (reserva.status === 401 || e.code === '28000' || e.code === 'PGRST301') return erro(401, 'Sua sessão expirou. Entre de novo.', 'sem_login');
      if (e.code === '42501') return erro(403, 'Só o dono da empresa pode assinar o plano.', 'sem_permissao');
      return erro(502, 'Não foi possível iniciar a assinatura. Tente de novo.', 'banco');
    }
    if (!ehObjeto(dadosReserva) || typeof dadosReserva.id !== 'string' || !UUID.test(dadosReserva.id)) return erro(502, 'Não foi possível iniciar a assinatura. Tente de novo.', 'banco');
    const referencia = dadosReserva.id;

    // Tentativas anteriores que ficaram sem pagar: cancela no Mercado Pago para o link antigo deixar de valer.
    for (const anterior of Array.isArray(dadosReserva.anteriores) ? dadosReserva.anteriores : []) {
      if (typeof anterior === 'string' && ID_MP.test(anterior)) await mpFetch('PUT', '/preapproval/' + encodeURIComponent(anterior), { status: CICLO.cancelar }).catch(() => null);
    }

    const criada = await mpFetch('POST', '/preapproval', {
      reason: trustedOffer.reason,
      external_reference: referencia,
      payer_email: email,
      auto_recurring: {
        frequency: trustedOffer.frequency,
        frequency_type: trustedOffer.frequency_type,
        transaction_amount: trustedOffer.valorCentavos / 100,
        currency_id: trustedOffer.currency_id,
      },
      back_url: backUrl,
      status: 'pending',
    });
    if (!criada.ok) {
      if (criada.status === 401 || criada.status === 403) return erro(503, 'A cobrança não está configurada corretamente (credencial do Mercado Pago recusada).', 'sem_cobranca');
      return erro(502, 'O Mercado Pago não aceitou criar a assinatura. Confira o e-mail informado e tente de novo.', 'mp');
    }
    const p = criada.dados;
    const pagamento = ehObjeto(p) ? enderecoDoMercadoPago(p.init_point) : null;
    if (!ehObjeto(p) || typeof p.id !== 'string' || !ID_MP.test(p.id) || !pagamento) return erro(502, 'O Mercado Pago respondeu de forma inesperada. Tente de novo.', 'mp');

    const vinculo = await rpcServico(d, 'vincular_assinatura_mp', { p_id: referencia, p_mp_id: p.id, p_valor_centavos: trustedOffer.valorCentavos, p_email: email });
    if (!vinculo.ok) {
      // Sem o vínculo o sistema não reconheceria o pagamento: desfaz no Mercado Pago.
      await mpFetch('PUT', '/preapproval/' + encodeURIComponent(p.id), { status: CICLO.cancelar }).catch(() => null);
      return erro(502, 'Não foi possível registrar a assinatura. Nada foi cobrado; tente de novo.', 'banco');
    }
    return { status: 200, corpo: { status: 'pending', init_point: pagamento } };
  } catch {
    return erro(502, 'Não foi possível falar com o Mercado Pago. Tente de novo em instantes.', 'rede');
  }
}
