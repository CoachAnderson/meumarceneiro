/**
 * Assinatura do sistema: plano, período de teste e leitura da situação.
 *
 * Este arquivo é a fonte do plano e do preço. A função de servidor usa uma
 * cópia gerada (supabase/functions/assinatura/oferta.ts) e o teste confere
 * que as duas estão iguais. O navegador nunca envia preço: só o código do plano.
 */

/** Dias de uso livre depois de criar a empresa. O banco usa o mesmo número. */
export const DIAS_TESTE = 14;
/** Dias de tolerância depois do vencimento, enquanto o Mercado Pago tenta cobrar de novo. */
export const DIAS_TOLERANCIA = 5;

export interface Oferta {
  codigo: string;
  nome: string;
  /** Texto que aparece para o assinante no Mercado Pago. */
  reason: string;
  valorCentavos: number;
  frequency: number;
  frequency_type: 'months';
  currency_id: 'BRL';
}

export const OFERTAS = {
  mensal: {
    codigo: 'mensal',
    nome: 'Plano mensal',
    reason: 'Meu Marceneiro - assinatura mensal',
    valorCentavos: 149_00,
    frequency: 1,
    frequency_type: 'months',
    currency_id: 'BRL',
  },
} as const satisfies Record<string, Oferta>;

export type CodigoOferta = keyof typeof OFERTAS;

export type StatusAssinatura = 'pendente' | 'ativa' | 'pausada' | 'cancelada';

/** O que o banco devolve em situacao_assinatura(). Datas em ISO. */
export interface SituacaoAssinatura {
  liberada: boolean;
  teste_ate: string;
  paga_ate: string | null;
  status: StatusAssinatura | null;
  agora: string;
}

export type TipoAcesso = 'teste' | 'ativa' | 'encerrando' | 'bloqueada';

export interface ResumoAcesso {
  tipo: TipoAcesso;
  /** Dias inteiros que faltam (arredondado para cima). 0 quando bloqueada. */
  diasRestantes: number;
  /** Até quando o acesso vale (ISO), quando há data. */
  ate: string | null;
}

const DIA_MS = 86_400_000;

function ms(iso: string | null): number | null {
  if (!iso) return null;
  const v = Date.parse(iso);
  return Number.isFinite(v) ? v : null;
}

/**
 * Resume a situação para a tela. Usa o relógio do banco (`agora`), não o do
 * aparelho, para o aviso bater com o que o banco vai aceitar.
 *
 *  - ativa: assinatura em dia;
 *  - encerrando: pausada ou cancelada, mas com período já pago em aberto;
 *  - teste: sem pagamento, dentro do período de teste;
 *  - bloqueada: nada disso — só consulta.
 */
export function resumirAcesso(s: SituacaoAssinatura): ResumoAcesso {
  const agora = ms(s.agora);
  if (agora === null) throw new Error('Situação da assinatura sem data de referência.');
  const pagaAte = ms(s.paga_ate);
  const testeAte = ms(s.teste_ate);
  const dias = (ate: number) => Math.max(1, Math.ceil((ate - agora) / DIA_MS));

  if (pagaAte !== null && pagaAte > agora) {
    return { tipo: s.status === 'ativa' ? 'ativa' : 'encerrando', diasRestantes: dias(pagaAte), ate: s.paga_ate };
  }
  if (testeAte !== null && testeAte > agora) return { tipo: 'teste', diasRestantes: dias(testeAte), ate: s.teste_ate };
  return { tipo: 'bloqueada', diasRestantes: 0, ate: null };
}
