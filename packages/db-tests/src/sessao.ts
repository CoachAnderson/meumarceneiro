import pg from 'pg';

export interface Usuario {
  id: string;
  email: string;
}

/** Quem executa: um usuário autenticado ou um visitante anônimo. */
/** 'servico': o servidor com a chave de serviço (funções e webhooks). */
export type Ator = Usuario | 'anon' | 'servico';

export interface ErroBanco {
  code: string;
  message: string;
  hint?: string;
}

export type Resultado<T> =
  | { ok: true; rows: T[]; rowCount: number }
  | { ok: false; erro: ErroBanco };

const AJUDA_CONEXAO = `
Defina DATABASE_URL apontando para um banco com as migrations aplicadas.
Com o Supabase local (supabase start):
  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
`;

/**
 * Sessão de teste: uma única transação que é desfeita no final, então nada
 * do que os testes criam fica no banco. Cada comando roda dentro de um
 * savepoint, com o papel e o JWT do ator, como o PostgREST faz.
 */
export class SessaoTeste {
  private contador = 0;

  private constructor(private readonly cliente: pg.Client) {}

  static async abrir(): Promise<SessaoTeste> {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(`DATABASE_URL não definida.${AJUDA_CONEXAO}`);
    }
    const cliente = new pg.Client({ connectionString: url });
    await cliente.connect();
    await cliente.query('begin');
    return new SessaoTeste(cliente);
  }

  async fechar(): Promise<void> {
    try {
      await this.cliente.query('rollback');
    } finally {
      await this.cliente.end();
    }
  }

  /** Cria um usuário como o Supabase Auth faria (dispara o trigger de perfil). */
  async criarUsuario(email: string, nome: string): Promise<Usuario> {
    const r = await this.cliente.query<{ id: string }>(
      `insert into auth.users (id, email, raw_user_meta_data, aud, role)
       values (gen_random_uuid(), $1, jsonb_build_object('nome', $2::text), 'authenticated', 'authenticated')
       returning id`,
      [email, nome],
    );
    const id = r.rows[0]?.id;
    if (!id) throw new Error('Falha ao criar usuário de teste.');
    return { id, email: email.toLowerCase() };
  }

  /** Executa SQL como o ator, sem nunca derrubar a transação externa. */
  async como<T extends pg.QueryResultRow = pg.QueryResultRow>(
    ator: Ator,
    sql: string,
    parametros: unknown[] = [],
  ): Promise<Resultado<T>> {
    const ponto = `sp_${++this.contador}`;
    await this.cliente.query(`savepoint ${ponto}`);
    try {
      if (ator === 'anon') {
        await this.cliente.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ role: 'anon' }),
        ]);
        await this.cliente.query('set local role anon');
      } else if (ator === 'servico') {
        await this.cliente.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ role: 'service_role' }),
        ]);
        await this.cliente.query('set local role service_role');
      } else {
        await this.cliente.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: ator.id, email: ator.email, role: 'authenticated' }),
        ]);
        await this.cliente.query('set local role authenticated');
      }

      const r = await this.cliente.query<T>(sql, parametros);
      await this.cliente.query('reset role');
      await this.cliente.query(`select set_config('request.jwt.claims', '', true)`);
      await this.cliente.query(`release savepoint ${ponto}`);
      return { ok: true, rows: r.rows, rowCount: r.rowCount ?? 0 };
    } catch (e) {
      await this.cliente.query(`rollback to savepoint ${ponto}`);
      await this.cliente.query('reset role');
      const erro = e as { code?: string; message?: string; hint?: string };
      return {
        ok: false,
        erro: { code: erro.code ?? '?', message: erro.message ?? String(e), hint: erro.hint },
      };
    }
  }

  /** Executa como o ator e exige sucesso; devolve as linhas. */
  async exigir<T extends pg.QueryResultRow = pg.QueryResultRow>(
    ator: Ator,
    sql: string,
    parametros: unknown[] = [],
  ): Promise<T[]> {
    const r = await this.como<T>(ator, sql, parametros);
    if (!r.ok) {
      throw new Error(`Esperava sucesso, veio erro ${r.erro.code}: ${r.erro.message}\nSQL: ${sql}`);
    }
    return r.rows;
  }

  /** Lê como superusuário (fora da RLS), para conferir o estado real do banco. */
  async lerDireto<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    parametros: unknown[] = [],
  ): Promise<T[]> {
    const r = await this.cliente.query<T>(sql, parametros);
    return r.rows;
  }
}
