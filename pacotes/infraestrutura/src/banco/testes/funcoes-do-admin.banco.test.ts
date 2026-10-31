import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AcessoAoBanco } from '../banco.ts';
import { abrirBanco, consultarComoAdmin, criarRestauranteDeTeste, sufixoUnico } from './apoio.ts';

const HASH = '$argon2id$v=19$m=19456,t=2,p=1$ZmFicmljYQ$ZmFicmljYQ';

// INTERMEDIARIO: funções privilegiadas da 0901: docs/adr/0017-intermediario-essencial.md
const FUNCOES = [
  'app.admin_valido',
  'app.admin_listar_restaurantes',
  'app.admin_resolver_restaurante',
  'app.admin_criar_restaurante',
  'app.admin_dono_do_restaurante',
  'app.admin_indicadores',
  'app.aceitar_convite',
];

let banco: AcessoAoBanco;
let restaurante = { id: '', slug: '' };
const naoAdmins: Record<string, string> = {};

async function novoAdmin(segredo: string | null, ativo: boolean) {
  const [linha] = await consultarComoAdmin<{ id: string }>(
    `INSERT INTO administradores (nome, email, hash_senha, papel, segredo_totp_cifrado, ativo)
     VALUES ('Ops', $1, $2, 'suporte', $3, $4) RETURNING id`,
    [`ops-${sufixoUnico()}@webesfera.com.br`, HASH, segredo, ativo],
  );
  return linha?.id ?? '';
}

beforeAll(async () => {
  banco = abrirBanco('api');
  restaurante = await criarRestauranteDeTeste(banco);
  const dono = await consultarComoAdmin<{ id: string }>(
    'INSERT INTO usuarios (nome, email, hash_senha) VALUES ($1, $2, $3) RETURNING id',
    ['Dono', `dono-${sufixoUnico()}@exemplo.com.br`, HASH],
  );
  await consultarComoAdmin(
    "INSERT INTO vinculos (restaurante_id, usuario_id, papel) VALUES ($1, $2, 'dono')",
    [restaurante.id, dono[0]?.id],
  );
  naoAdmins.inexistente = uuidv7();
  naoAdmins['sem segundo fator'] = await novoAdmin(null, true);
  naoAdmins.inativo = await novoAdmin('cifrado', false);
});

afterAll(async () => {
  await banco.encerrar();
});

describe('funções privilegiadas do admin', () => {
  it('as 7 são SECURITY DEFINER, com search_path fixo e sem EXECUTE para PUBLIC', async () => {
    const linhas = await consultarComoAdmin<{
      nome: string;
      definer: boolean;
      config: string[];
      publico: boolean;
    }>(
      `SELECT n.nspname || '.' || p.proname AS nome, p.prosecdef AS definer, p.proconfig AS config,
              EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS publico
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname || '.' || p.proname = ANY($1)`,
      [FUNCOES],
    );
    expect(linhas.map((linha) => linha.nome).sort()).toEqual([...FUNCOES].sort());
    for (const linha of linhas) {
      expect(linha, linha.nome).toMatchObject({
        definer: true,
        config: ['search_path=pg_catalog, pg_temp'],
        publico: false,
      });
    }
  });

  describe.each(['inexistente', 'sem segundo fator', 'inativo'])('com admin %s', (caso) => {
    const admin = () => naoAdmins[caso] ?? '';

    it('admin_valido diz não; listar, resolver, indicadores e dono do restaurante voltam vazios', async () => {
      const lido = await banco.semRestaurante('teste', async (transacao) => ({
        valido: (await transacao.execute<{ v: boolean }>(sql`SELECT app.admin_valido(${admin()}) AS v`))
          .rows[0]?.v,
        lista: (await transacao.execute(sql`SELECT * FROM app.admin_listar_restaurantes(${admin()})`)).rows,
        id: (
          await transacao.execute<{ id: string | null }>(
            sql`SELECT app.admin_resolver_restaurante(${admin()}, ${restaurante.slug}) AS id`,
          )
        ).rows[0]?.id,
        indicadores: (await transacao.execute(sql`SELECT * FROM app.admin_indicadores(${admin()}, now())`))
          .rows,
      }));
      const dono = await banco.comRestaurante(
        restaurante.id,
        async (transacao) =>
          (await transacao.execute(sql`SELECT * FROM app.admin_dono_do_restaurante(${admin()})`)).rows,
      );
      expect(lido).toEqual({ valido: false, lista: [], id: null, indicadores: [] });
      expect(dono).toEqual([]);
    });

    it('admin_criar_restaurante recusa e não grava nada', async () => {
      const id = uuidv7();
      const email = `recusado-${sufixoUnico()}@exemplo.com.br`;
      const [linha] = await banco.comRestaurante(
        id,
        async (transacao) =>
          (
            await transacao.execute<{ desfecho: string }>(sql`
            SELECT * FROM app.admin_criar_restaurante(${admin()}, 'Recusado', ${`recusado-${sufixoUnico()}`},
              now() + interval '10 days', 'Dono', ${email}, ${HASH})`)
          ).rows,
      );
      expect(linha?.desfecho).toBe('proibido');
      expect(await consultarComoAdmin('SELECT 1 FROM restaurantes WHERE id = $1', [id])).toEqual([]);
      expect(await consultarComoAdmin('SELECT 1 FROM usuarios WHERE email = $1', [email])).toEqual([]);
    });
  });

  it('aceitar_convite sem convite válido recusa e não muda senha', async () => {
    const aceito = await banco.semRestaurante(
      'teste',
      async (transacao) =>
        (
          await transacao.execute<{ aceito: boolean }>(
            sql`SELECT app.aceitar_convite(${'0'.repeat(64)}, ${HASH}, now()) AS aceito`,
          )
        ).rows[0]?.aceito,
    );
    expect(aceito).toBe(false);
  });

  it('admin_dono_do_restaurante devolve só nome e e-mail, e só do restaurante do contexto', async () => {
    const admin = await novoAdmin('cifrado', true);
    const outro = await criarRestauranteDeTeste(banco);
    const doContexto = await banco.comRestaurante(
      restaurante.id,
      async (transacao) =>
        (await transacao.execute(sql`SELECT * FROM app.admin_dono_do_restaurante(${admin})`)).rows,
    );
    const doOutro = await banco.comRestaurante(
      outro.id,
      async (transacao) =>
        (await transacao.execute(sql`SELECT * FROM app.admin_dono_do_restaurante(${admin})`)).rows,
    );
    expect(doContexto).toHaveLength(1);
    expect(Object.keys(doContexto[0] ?? {}).sort()).toEqual(['email', 'nome']);
    expect(doOutro).toEqual([]);
  });
});
