import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { FUNCOES_PRIVILEGIADAS } from '../../../../../banco/funcoes-privilegiadas.ts';
import { TABELAS_DE_SISTEMA } from '../../../../../banco/tabelas-de-sistema.ts';
import * as esquema from '../esquema/index.ts';
import { consultarComoAdmin } from './apoio.ts';
import { FABRICAS } from './fabricas/index.ts';

const PAPEIS_DA_APLICACAO = [
  'app_runtime',
  'app_sistema',
  'cardapio_api',
  'cardapio_worker',
  'cardapio_migracao',
  'cardapio_dono',
];
const TABELAS_SO_POR_FUNCAO = [
  'usuarios',
  'administradores',
  'codigos_recuperacao_admin',
  'sessoes',
  'tokens_redefinicao_senha',
  'tentativas_login',
];
const NOMES_DE_SISTEMA = TABELAS_DE_SISTEMA.map((tabela) => tabela.tabela);

async function tabelasDeRestaurante(): Promise<string[]> {
  const linhas = await consultarComoAdmin<{ tabela: string }>(
    `SELECT DISTINCT table_name AS tabela FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'restaurante_id'
     UNION SELECT 'restaurantes' ORDER BY 1`,
  );
  return linhas.map((linha) => linha.tabela);
}

describe('catálogo do banco', () => {
  it('1. toda tabela de restaurante tem RLS ligado, forçado e política com USING e WITH CHECK para app_runtime', async () => {
    const linhas = await consultarComoAdmin<{
      tabela: string;
      rls: boolean;
      forcado: boolean;
      politicas: number;
    }>(
      `SELECT c.relname AS tabela, c.relrowsecurity AS rls, c.relforcerowsecurity AS forcado,
              (SELECT count(*)::int FROM pg_policy p
                WHERE p.polrelid = c.oid AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL
                  AND 'app_runtime'::regrole::oid = ANY (p.polroles)) AS politicas
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY ($1)`,
      [await tabelasDeRestaurante()],
    );
    expect(linhas.length).toBeGreaterThan(0);
    for (const linha of linhas) {
      expect(linha, linha.tabela).toMatchObject({ rls: true, forcado: true });
      expect(linha.politicas, linha.tabela).toBeGreaterThanOrEqual(1);
    }
  });

  it('1b. toda política declara o papel (TO) e tem USING e WITH CHECK', async () => {
    const politicas = await consultarComoAdmin<{
      nome: string;
      publico: boolean;
      usando: boolean;
      checa: boolean;
    }>(
      `SELECT polname AS nome, 0::oid = ANY (polroles) AS publico, polqual IS NOT NULL AS usando, polwithcheck IS NOT NULL AS checa
         FROM pg_policy`,
    );
    for (const politica of politicas) {
      expect(politica, politica.nome).toMatchObject({ publico: false, usando: true, checa: true });
    }
  });

  it('2. USING (true) só existe para app_sistema nas tabelas de sistema', async () => {
    const abertas = await consultarComoAdmin<{ tabela: string; papeis: string[] }>(
      `SELECT tablename AS tabela, roles::text[] AS papeis FROM pg_policies WHERE qual = 'true'`,
    );
    for (const politica of abertas) {
      expect(politica.papeis, politica.tabela).toEqual(['app_sistema']);
      expect(NOMES_DE_SISTEMA, politica.tabela).toContain(politica.tabela);
    }
  });

  it('3. papéis da aplicação não são superusuários nem têm BYPASSRLS, e as tabelas são do cardapio_dono', async () => {
    const papeis = await consultarComoAdmin<{
      nome: string;
      superusuario: boolean;
      ignoraRls: boolean;
      login: boolean;
    }>(
      `SELECT rolname AS nome, rolsuper AS superusuario, rolbypassrls AS "ignoraRls", rolcanlogin AS login
         FROM pg_roles WHERE rolname = ANY ($1) OR rolname = 'funcoes_privilegiadas'`,
      [PAPEIS_DA_APLICACAO],
    );
    expect(papeis).toHaveLength(PAPEIS_DA_APLICACAO.length + 1);
    for (const papel of papeis) {
      const esperado =
        papel.nome === 'funcoes_privilegiadas' ? { ignoraRls: true, login: false } : { ignoraRls: false };
      expect(papel, papel.nome).toMatchObject({ superusuario: false, ...esperado });
    }
    const donos = await consultarComoAdmin<{ dono: string }>(
      `SELECT DISTINCT tableowner AS dono FROM pg_tables WHERE schemaname IN ('public', 'app', 'migracoes')`,
    );
    expect(donos).toEqual([{ dono: 'cardapio_dono' }]);
  });

  it.each(['cardapio_api', 'cardapio_worker'])(
    '3b. %s não é membro, direto ou indireto, de cardapio_dono, cardapio_migracao nem funcoes_privilegiadas',
    async (usuario) => {
      const linhas = await consultarComoAdmin<{ papel: string }>(
        `WITH RECURSIVE herdados (papel) AS (
           SELECT m.roleid FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = $1
           UNION
           SELECT m.roleid FROM pg_auth_members m JOIN herdados h ON m.member = h.papel
         )
         SELECT r.rolname::text AS papel FROM herdados h JOIN pg_roles r ON r.oid = h.papel ORDER BY 1`,
        [usuario],
      );
      const papeis = linhas.map((linha) => linha.papel);
      const esperados = usuario === 'cardapio_api' ? ['app_runtime'] : ['app_runtime', 'app_sistema'];

      expect(papeis).toEqual(esperados);
      for (const proibido of ['cardapio_dono', 'cardapio_migracao', 'funcoes_privilegiadas']) {
        const [membro] = await consultarComoAdmin<{ membro: boolean }>(
          "SELECT pg_has_role($1, $2, 'MEMBER') AS membro",
          [usuario, proibido],
        );
        expect(membro?.membro, `${usuario} em ${proibido}`).toBe(false);
      }
    },
  );

  it('4. app_sistema só tem permissão nas tabelas de sistema', async () => {
    const permissoes = await consultarComoAdmin<{ tabela: string }>(
      `SELECT table_name AS tabela FROM information_schema.role_table_grants WHERE grantee = 'app_sistema'
       UNION SELECT table_name FROM information_schema.column_privileges WHERE grantee = 'app_sistema'`,
    );
    expect(permissoes.length).toBeGreaterThan(0);
    for (const permissao of permissoes) {
      expect(NOMES_DE_SISTEMA).toContain(permissao.tabela);
    }
  });

  it('5. as funções SECURITY DEFINER são exatamente as da lista, com search_path fixo e execução restrita', async () => {
    const funcoes = await consultarComoAdmin<{
      assinatura: string;
      dono: string;
      configuracao: string[] | null;
      publico: boolean;
    }>(
      `SELECT p.oid::regprocedure::text AS assinatura, pg_get_userbyid(p.proowner) AS dono, p.proconfig AS configuracao,
              has_function_privilege('public', p.oid, 'EXECUTE') AS publico
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema')`,
    );
    const esperadas = FUNCOES_PRIVILEGIADAS.map((funcao) => funcao.nome);
    expect(funcoes.map((funcao) => funcao.assinatura.split('(')[0]).sort()).toEqual([...esperadas].sort());
    for (const funcao of funcoes) {
      const declarada = FUNCOES_PRIVILEGIADAS.find((item) => funcao.assinatura.startsWith(`${item.nome}(`));
      expect(funcao, funcao.assinatura).toMatchObject({ dono: 'funcoes_privilegiadas', publico: false });
      expect(
        funcao.configuracao?.some((item) => item.startsWith('search_path=')),
        funcao.assinatura,
      ).toBe(true);
      const [executores] = await consultarComoAdmin<{ papeis: string[] }>(
        `SELECT array_agg(r.rolname::text ORDER BY r.rolname) AS papeis FROM pg_roles r
          WHERE r.rolname IN ('app_runtime', 'app_sistema') AND has_function_privilege(r.oid, $1::regprocedure, 'EXECUTE')`,
        [funcao.assinatura],
      );
      expect(executores?.papeis, funcao.assinatura).toEqual([declarada?.papel]);
    }
  });

  it.each(TABELAS_SO_POR_FUNCAO)(
    '7. app_runtime e app_sistema não têm permissão nenhuma em %s: só as funções privilegiadas chegam nela',
    async (tabela) => {
      const permissoes = await consultarComoAdmin<{ papel: string; permissao: string }>(
        `SELECT grantee AS papel, privilege_type AS permissao FROM information_schema.role_table_grants
          WHERE table_schema = 'public' AND table_name = $1 AND grantee IN ('app_runtime', 'app_sistema', 'PUBLIC')
         UNION
         SELECT grantee, privilege_type FROM information_schema.column_privileges
          WHERE table_schema = 'public' AND table_name = $1 AND grantee IN ('app_runtime', 'app_sistema', 'PUBLIC')`,
        [tabela],
      );
      expect(permissoes).toEqual([]);
    },
  );

  it('6. toda tabela de restaurante tem uma fábrica de dados de teste', async () => {
    const semFabrica = (await tabelasDeRestaurante()).filter(
      (tabela) => !FABRICAS.some((fabrica) => fabrica.tabela === tabela),
    );
    expect(semFabrica, `Tabelas sem fábrica em testes/fabricas: ${semFabrica.join(', ')}`).toEqual([]);
  });

  it('toda tabela do esquema public tem esquema Drizzle', async () => {
    const tabelas = await consultarComoAdmin<{ tabela: string }>(
      `SELECT table_name AS tabela FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`,
    );
    const noDrizzle = Object.values(esquema).map((tabela) => getTableConfig(tabela).name);
    expect(tabelas.map((linha) => linha.tabela)).toEqual([...noDrizzle].sort());
  });

  it('o esquema Drizzle tem as mesmas colunas do banco', async () => {
    for (const tabela of Object.values(esquema)) {
      const configuracao = getTableConfig(tabela);
      const colunas = await consultarComoAdmin<{ coluna: string }>(
        `SELECT column_name AS coluna FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY 1`,
        [configuracao.name],
      );
      expect(configuracao.columns.map((coluna) => coluna.name).sort(), configuracao.name).toEqual(
        colunas.map((linha) => linha.coluna),
      );
    }
  });
});
