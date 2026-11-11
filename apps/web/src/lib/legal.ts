/**
 * Dados da empresa responsável pelo sistema e versão dos documentos legais.
 * Os dados vêm de variáveis de ambiente (veja .env.example), para o texto
 * não sair publicado com dados de outra pessoa.
 */

/** Data da versão em vigor. Mude sempre que o texto dos Termos ou da Política mudar. */
export const VERSAO_TERMOS = '2026-11-11';

const ler = (nome: string): string | null => {
  const v = (import.meta.env[nome] as string | undefined)?.trim();
  return v ? v : null;
};

const campos = {
  razaoSocial: ler('VITE_LEGAL_RAZAO_SOCIAL'),
  cnpj: ler('VITE_LEGAL_CNPJ'),
  endereco: ler('VITE_LEGAL_ENDERECO'),
  emailContato: ler('VITE_LEGAL_EMAIL_CONTATO'),
  emailPrivacidade: ler('VITE_LEGAL_EMAIL_PRIVACIDADE'),
  foro: ler('VITE_LEGAL_FORO'),
};

/** Falta algum dado: as páginas avisam que o documento ainda não está completo. */
export const legalIncompleto = Object.values(campos).some((v) => v === null);

export const RESPONSAVEL = {
  razaoSocial: campos.razaoSocial ?? '[razão social da empresa]',
  cnpj: campos.cnpj ?? '[CNPJ]',
  endereco: campos.endereco ?? '[endereço]',
  emailContato: campos.emailContato ?? '[e-mail de contato]',
  emailPrivacidade: campos.emailPrivacidade ?? campos.emailContato ?? '[e-mail para assuntos de privacidade]',
  foro: campos.foro ?? '[cidade/UF]',
};

export const dataDaVersao = () => {
  const [a, m, d] = VERSAO_TERMOS.split('-');
  return `${d}/${m}/${a}`;
};
