/**
 * Marceneiro virtual — lógica da função de servidor.
 *
 * Não depende do Deno nem de biblioteca: as regras (ficha, instruções,
 * formato) chegam injetadas, vindas de ficha.ts (cópia gerada do motor), e a
 * busca também. packages/core/test/marceneiro-funcao.test.ts roda todos os
 * caminhos com a IA e o banco simulados.
 *
 * Dois modos:
 *  - abrir / link: o cliente abre o link do móvel, sem login. A ficha vem do
 *    banco (apresentação criada pela marcenaria), nunca do navegador. O banco
 *    confere validade, limite do link, ritmo e cota da empresa.
 *  - editor: um membro da marcenaria conversa com o cliente ao lado, no
 *    editor. A ficha vem do navegador (é o cálculo dele mesmo) e o banco
 *    confere login, papel e cota com o token do próprio usuário.
 *
 * O texto da conversa não é gravado: o banco guarda só que houve pergunta,
 * quando e quantos tokens.
 */
import { cabecalhosServico } from '../_shared/chaves.ts';

export interface Resposta {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type Buscar = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<Resposta>;

/** O que vem de ficha.ts (as mesmas funções do motor). */
export interface Regras {
  lerFicha(v: unknown): unknown | null;
  textoDaFicha(f: never): string;
  instrucoesMarceneiro(nome: string, modo: 'link' | 'editor'): string;
  montarConversa(historico: unknown, pergunta: unknown): { role: 'user' | 'assistant'; content: string }[] | null;
  lerRespostaMarceneiro(chamada: unknown, textoSolto?: string): { resposta: string; encaminhar: boolean; ajuste: { largura?: number; altura?: number; profundidade?: number } | null } | null;
  saudacaoMarceneiro(f: never, nome: string): string;
  FERRAMENTA_MARCENEIRO: { name: string; [k: string]: unknown };
  NOME_ASSISTENTE_MAX: number;
}

export interface Dependencias {
  buscar: Buscar;
  supabaseUrl: string;
  anonKey: string;
  /** Chave de serviço: só para os passos do link público (o cliente não tem login). */
  chaveServico: string;
  chaveIA: string;
  modelo: string;
  regras: Regras;
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const erro = (status: number, mensagem: string, codigo: string): Saida => ({ status, corpo: { erro: mensagem, codigo } });
const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** O link público traz a empresa e a apresentação; as duas precisam bater no banco. */
const linkValido = (c: Record<string, unknown>) =>
  typeof c.empresaId === 'string' && UUID.test(c.empresaId) && typeof c.apresentacaoId === 'string' && UUID.test(c.apresentacaoId);

/** Erros do banco que viram mensagem para o cliente (hint da exceção → resposta). */
const ERROS_BANCO: Record<string, [number, string]> = {
  marceneiro_indisponivel: [404, 'O marceneiro virtual não está disponível neste link. Fale direto com a marcenaria.'],
  limite_link: [429, 'Este link já respondeu todas as perguntas que podia. Fale direto com a marcenaria para continuar.'],
  cota_marceneiro: [429, 'O marceneiro virtual atingiu o limite de conversas deste mês. Fale direto com a marcenaria.'],
  devagar: [429, 'Muitas perguntas seguidas. Espere um minuto e pergunte de novo.'],
  assinatura: [403, 'O marceneiro virtual está pausado para esta marcenaria.'],
};

export async function tratar(pedido: Pedido, d: Dependencias): Promise<Saida> {
  if (pedido.metodo !== 'POST') return erro(405, 'Use POST.', 'metodo');
  const c = pedido.corpo;
  if (!ehObjeto(c) || typeof c.modo !== 'string') return erro(400, 'Pedido inválido.', 'pedido');
  const r = d.regras;

  // Chamada ao banco: com a chave de serviço (link público) ou com o token do usuário (editor).
  const rpc = (nome: string, args: Record<string, unknown>, comoServico: boolean) =>
    d.buscar(`${d.supabaseUrl}/rest/v1/rpc/${nome}`, {
      method: 'POST',
      headers: comoServico
        ? cabecalhosServico(d.chaveServico)
        : { 'content-type': 'application/json', apikey: d.anonKey, authorization: pedido.autorizacao as string },
      body: JSON.stringify(args),
    });

  const lerErroBanco = async (resp: Resposta): Promise<Saida> => {
    const e = (await resp.json().catch(() => null)) as { code?: string; hint?: string; message?: string } | null;
    const conhecido = e?.hint ? ERROS_BANCO[e.hint] : undefined;
    if (conhecido) return erro(conhecido[0], conhecido[1], e!.hint!);
    if (resp.status === 401 || e?.code === '28000' || e?.code === 'PGRST301') return erro(401, 'Sua sessão expirou. Entre de novo.', 'sem_login');
    if (e?.code === '42501') return erro(403, 'Sua função não permite usar o marceneiro virtual nesta empresa.', 'sem_permissao');
    return erro(502, 'Não foi possível registrar a pergunta. Tente de novo.', 'banco');
  };

  // ---- Abrir: só a saudação, sem IA e sem gastar cota.
  if (c.modo === 'abrir') {
    if (!linkValido(c)) return erro(400, 'Link inválido.', 'pedido');
    if (!d.chaveServico) return erro(503, 'O marceneiro virtual ainda não foi configurado neste sistema.', 'sem_chave');
    try {
      const resp = await rpc('abrir_apresentacao', { p_empresa: c.empresaId, p_id: c.apresentacaoId }, true);
      if (!resp.ok) return await lerErroBanco(resp);
      const dados = await resp.json();
      if (!ehObjeto(dados)) return erro(404, ERROS_BANCO.marceneiro_indisponivel![1], 'marceneiro_indisponivel');
      const ficha = r.lerFicha(dados.ficha);
      const nome = typeof dados.nome === 'string' ? dados.nome : '';
      if (!ficha || !nome) return erro(404, ERROS_BANCO.marceneiro_indisponivel![1], 'marceneiro_indisponivel');
      return {
        status: 200,
        corpo: {
          nome,
          saudacao: r.saudacaoMarceneiro(ficha as never, nome),
          temPreco: (ficha as { precoCentavos: number | null }).precoCentavos !== null,
          restantes: typeof dados.restantes === 'number' ? dados.restantes : null,
        },
      };
    } catch {
      return erro(502, 'Não foi possível abrir o marceneiro virtual. Tente de novo.', 'banco');
    }
  }

  if (c.modo !== 'link' && c.modo !== 'editor') return erro(400, 'Pedido inválido.', 'pedido');
  const link = c.modo === 'link';

  const mensagens = r.montarConversa(c.historico, c.pergunta);
  if (!mensagens) return erro(400, 'Escreva uma pergunta de até 400 letras.', 'pergunta');
  if (!d.chaveIA) return erro(503, 'O marceneiro virtual ainda não foi configurado neste sistema (falta a chave da IA no servidor).', 'sem_chave');

  // ---- Reserva da pergunta no banco e ficha
  let perguntaId: string;
  let ficha: unknown;
  let nome: string;
  let restantes: number | null = null;
  if (link) {
    if (!linkValido(c)) return erro(400, 'Link inválido.', 'pedido');
    if (!d.chaveServico) return erro(503, 'O marceneiro virtual ainda não foi configurado neste sistema.', 'sem_chave');
    try {
      const resp = await rpc('iniciar_pergunta_link', { p_empresa: c.empresaId, p_apresentacao: c.apresentacaoId }, true);
      if (!resp.ok) return await lerErroBanco(resp);
      const dados = await resp.json();
      if (!ehObjeto(dados) || typeof dados.pergunta_id !== 'string' || !UUID.test(dados.pergunta_id)) return erro(502, 'Não foi possível registrar a pergunta. Tente de novo.', 'banco');
      perguntaId = dados.pergunta_id;
      ficha = r.lerFicha(dados.ficha);
      nome = typeof dados.nome === 'string' ? dados.nome : '';
      restantes = typeof dados.restantes === 'number' ? dados.restantes : null;
    } catch {
      return erro(502, 'Não foi possível registrar a pergunta. Tente de novo.', 'banco');
    }
  } else {
    if (!pedido.autorizacao || !/^Bearer \S+$/.test(pedido.autorizacao)) return erro(401, 'Entre no sistema para usar o marceneiro virtual.', 'sem_login');
    if (typeof c.empresaId !== 'string' || !UUID.test(c.empresaId)) return erro(400, 'Empresa inválida.', 'pedido');
    ficha = r.lerFicha(c.ficha);
    if (!ficha) return erro(400, 'A ficha do móvel está incompleta. Calcule o móvel de novo.', 'ficha');
    nome = typeof c.nome === 'string' ? c.nome.trim() : '';
    if (!nome || nome.length > r.NOME_ASSISTENTE_MAX) return erro(400, `Dê um nome ao assistente (até ${r.NOME_ASSISTENTE_MAX} letras).`, 'nome');
    try {
      const resp = await rpc('iniciar_pergunta_editor', { p_empresa: c.empresaId }, false);
      if (!resp.ok) return await lerErroBanco(resp);
      const id = await resp.json();
      if (typeof id !== 'string' || !UUID.test(id)) return erro(502, 'Não foi possível registrar a pergunta. Tente de novo.', 'banco');
      perguntaId = id;
    } catch {
      return erro(502, 'Não foi possível registrar a pergunta. Tente de novo.', 'banco');
    }
  }

  const encerrar = async (status: 'concluida' | 'falhou', uso: { entrada?: number; saida?: number } = {}) => {
    // Falha ao encerrar não muda a resposta: a reserva expira sozinha em 5 minutos.
    await rpc(
      'concluir_pergunta_marceneiro',
      { p_id: perguntaId, p_status: status, p_modelo: d.modelo, p_tokens_entrada: uso.entrada ?? null, p_tokens_saida: uso.saida ?? null },
      link,
    ).catch(() => undefined);
  };

  if (!ficha || !nome) {
    await encerrar('falhou');
    return erro(502, 'A ficha deste móvel está com problema. Peça um novo link à marcenaria.', 'ficha');
  }

  // ---- IA
  let resposta: Resposta;
  try {
    resposta = await d.buscar('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': d.chaveIA, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: d.modelo,
        max_tokens: 600,
        system: `${r.instrucoesMarceneiro(nome, link ? 'link' : 'editor')}\n\nFICHA DO MÓVEL:\n${r.textoDaFicha(ficha as never)}`,
        tools: [r.FERRAMENTA_MARCENEIRO],
        tool_choice: { type: 'auto' },
        messages: mensagens,
      }),
    });
  } catch {
    await encerrar('falhou');
    return erro(502, 'O marceneiro virtual não respondeu. Tente de novo em instantes.', 'ia_indisponivel');
  }
  if (!resposta.ok) {
    await encerrar('falhou');
    return erro(502, 'O marceneiro virtual está ocupado agora. Tente de novo em instantes.', 'ia_erro');
  }

  const dados = (await resposta.json().catch(() => null)) as { content?: unknown; usage?: { input_tokens?: number; output_tokens?: number } } | null;
  const uso = { entrada: dados?.usage?.input_tokens, saida: dados?.usage?.output_tokens };
  const blocos = Array.isArray(dados?.content) ? (dados.content as unknown[]).filter(ehObjeto) : [];
  const chamada = blocos.find((b) => b.type === 'tool_use' && b.name === r.FERRAMENTA_MARCENEIRO.name);
  const solto = blocos
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join(' ');
  const lida = r.lerRespostaMarceneiro(chamada?.input, solto);
  if (!lida) {
    await encerrar('falhou', uso);
    return erro(502, 'O marceneiro virtual não conseguiu responder. Pergunte de outro jeito.', 'sem_resposta');
  }

  await encerrar('concluida', uso);
  return { status: 200, corpo: { ...lida, restantes } };
}
