/** Converte erros do Supabase (Auth e banco) em mensagens para o usuário. */

const POR_CODIGO_AUTH: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  user_already_exists: 'Já existe uma conta com este e-mail.',
  email_exists: 'Já existe uma conta com este e-mail.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar. Procure a mensagem na sua caixa de entrada.',
  weak_password: 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.',
  same_password: 'A nova senha precisa ser diferente da atual.',
  over_email_send_rate_limit: 'Muitos e-mails enviados. Aguarde alguns minutos e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  signup_disabled: 'Novos cadastros estão desativados.',
  session_not_found: 'Sua sessão expirou. Entre novamente.',
};

const POR_CODIGO_BANCO: Record<string, string> = {
  '42501': 'Você não tem permissão para esta ação.',
  '23505': 'Já existe um registro com esses dados.',
  '23514': 'Algum campo tem um valor inválido.',
  '23503': 'Este registro está ligado a outro e não pode ser alterado assim.',
  '28000': 'É preciso entrar para continuar.',
};

interface ErroComCodigo {
  code?: unknown;
  message?: unknown;
  status?: unknown;
}

export function mensagemDeErro(erro: unknown, contexto?: { duplicado?: string }): string {
  if (!erro) return 'Erro desconhecido.';
  if (typeof erro === 'string') return erro;

  const e = erro as ErroComCodigo;
  const codigo = typeof e.code === 'string' ? e.code : undefined;
  const mensagem = typeof e.message === 'string' ? e.message : undefined;

  if (codigo === '23505' && contexto?.duplicado) return contexto.duplicado;
  // Erros levantados pelas nossas funções no banco já vêm em português.
  if (codigo === 'P0001' && mensagem) return mensagem;
  if (codigo && POR_CODIGO_BANCO[codigo]) return POR_CODIGO_BANCO[codigo];
  if (codigo && POR_CODIGO_AUTH[codigo]) return POR_CODIGO_AUTH[codigo];

  if (mensagem?.includes('Failed to fetch') || mensagem?.includes('NetworkError')) {
    return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  }
  return mensagem ?? 'Não foi possível concluir a operação.';
}
