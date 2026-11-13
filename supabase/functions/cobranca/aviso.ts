/**
 * Aviso do Mercado Pago da marcenaria: só dispara a consulta da order.
 * A verdade vem sempre da API do Mercado Pago, com a chave da marcenaria.
 */
import { cabecalhosServico } from '../_shared/chaves.ts';
import { ehObjeto, UUID } from './montar.ts';
import { conferirBoletos, hojeSP, type Dependencias } from './tratar.ts';

export interface Aviso {
  metodo: string;
  url: string;
  corpo: unknown;
}

const ID_ORDER = /^[A-Za-z0-9_-]{4,64}$/;

export function tratarAvisoBoleto(a: Aviso, d: Dependencias): { status: number; depois: Promise<unknown> | null } {
  if (a.metodo !== 'POST') return { status: 405, depois: null };
  let empresa: string | null = null;
  let order: string | null = null;
  try {
    const u = new URL(a.url);
    empresa = u.searchParams.get('empresa');
    order = u.searchParams.get('data.id') ?? u.searchParams.get('id');
  } catch {
    return { status: 400, depois: null };
  }
  const c = ehObjeto(a.corpo) ? a.corpo : {};
  if (!order && ehObjeto(c.data) && typeof c.data.id === 'string') order = c.data.id;
  if (!empresa || !UUID.test(empresa) || !order || !ID_ORDER.test(order)) return { status: 200, depois: null };
  // Só avisos de order (o boleto é uma order). Outros tipos: ignora sem erro.
  if (typeof c.type === 'string' && c.type !== 'order') return { status: 200, depois: null };
  if (!d.chaveServico || !d.chaveCofre) return { status: 503, depois: null };
  const emp = empresa;
  const ord = order;
  const depois = (async () => {
    // Assinatura vencida: não dá baixa (o dono confere quando voltar).
    const r = await d.buscar(`${d.supabaseUrl}/rest/v1/rpc/empresa_liberada`, {
      method: 'POST',
      headers: { ...cabecalhosServico(d.chaveServico), 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_empresa: emp }),
    });
    if (!r.ok || (await r.json().catch(() => null)) !== true) return;
    await conferirBoletos(d, emp, hojeSP(d.agora()), ord);
  })().catch((e) => console.warn(`[boleto-aviso] ${e instanceof Error ? e.message : 'falha'}`));
  return { status: 200, depois };
}
