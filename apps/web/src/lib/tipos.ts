// Tipos das tabelas usadas na Fase 1.
// Quando o banco crescer, gere os tipos completos com `npm run db:types`.

export type Papel = 'dono' | 'projetista' | 'vendas' | 'producao';

export const PAPEIS: readonly Papel[] = ['dono', 'projetista', 'vendas', 'producao'];

export const NOME_PAPEL: Record<Papel, string> = {
  dono: 'Dono',
  projetista: 'Projetista',
  vendas: 'Vendas',
  producao: 'Produção',
};

export const DESCRICAO_PAPEL: Record<Papel, string> = {
  dono: 'Acesso total, inclusive equipe e dados da empresa',
  projetista: 'Cria e edita clientes e projetos',
  vendas: 'Cria e edita clientes e orçamentos',
  producao: 'Consulta dados; não altera cadastros',
};

export interface Empresa {
  id: string;
  nome: string;
  cnpj: string | null;
}

export interface Vinculo {
  papel: Papel;
  empresa: Empresa;
}

export interface Membro {
  usuario_id: string;
  papel: Papel;
  created_at: string;
  usuario: { nome: string; email: string } | null;
}

export interface Convite {
  id: string;
  email: string;
  papel: Papel;
  token: string;
  expira_em: string;
  created_at: string;
}

export interface ConvitePublico {
  empresa_nome: string;
  email: string;
  papel: Papel;
  expira_em: string;
  estado: 'pendente' | 'aceito' | 'revogado' | 'expirado';
}

export interface Cliente {
  id: string;
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export const podeEditarCadastros = (papel: Papel): boolean =>
  papel === 'dono' || papel === 'projetista' || papel === 'vendas';
