import type { Autoria, DesfechoDaMesa, MesaGuardada, RepositorioDeMesas } from '@cardapio/aplicacao';
import { sql, type SQL } from 'drizzle-orm';
import type { AcessoAoBanco, Transacao } from '../banco.ts';

interface LinhaDeMesa extends Record<string, unknown> {
  readonly id: string;
  readonly numero: number;
  readonly nome: string | null;
  readonly area: string | null;
  readonly codigo: string;
  readonly ativa: boolean;
}

const COLUNAS = sql.raw('id, numero, nome, area, codigo, ativa');

function paraMesa(linha: LinhaDeMesa): MesaGuardada {
  return {
    id: linha.id,
    numero: linha.numero,
    nome: linha.nome,
    area: linha.area,
    codigo: linha.codigo,
    ativa: linha.ativa,
  };
}

async function umaMesa(transacao: Transacao, consulta: SQL): Promise<MesaGuardada | undefined> {
  const { rows } = await transacao.execute<LinhaDeMesa>(consulta);
  const [linha] = rows;
  return linha === undefined ? undefined : paraMesa(linha);
}

function travarMesa(transacao: Transacao, mesaId: string) {
  return umaMesa(transacao, sql`SELECT ${COLUNAS} FROM mesas WHERE id = ${mesaId} FOR UPDATE`);
}

async function contarAtivas(transacao: Transacao): Promise<number> {
  await transacao.execute(sql`SELECT 1 FROM restaurantes WHERE id = app.restaurante_atual() FOR UPDATE`);
  const { rows } = await transacao.execute<{ total: number }>(
    sql`SELECT count(*)::integer AS total FROM mesas WHERE ativa`,
  );
  return rows[0]?.total ?? 0;
}

async function numeroOcupado(transacao: Transacao, numero: number, outra: string | null): Promise<boolean> {
  const { rows } = await transacao.execute(
    sql`SELECT 1 FROM mesas WHERE numero = ${numero} AND id IS DISTINCT FROM ${outra}`,
  );
  return rows.length > 0;
}

async function auditar(
  transacao: Transacao,
  mesaId: string,
  acao: string,
  autoria: Autoria,
  mudanca: { readonly antes?: unknown; readonly depois?: unknown } = {},
): Promise<void> {
  await transacao.execute(sql`
    INSERT INTO auditoria (restaurante_id, autor_tipo, autor_id, acao, entidade, entidade_id, antes, depois)
    VALUES (app.restaurante_atual(), 'usuario', ${autoria.usuarioId}, ${acao}, 'mesa', ${mesaId},
            ${mudanca.antes === undefined ? null : JSON.stringify(mudanca.antes)}::jsonb,
            ${mudanca.depois === undefined ? null : JSON.stringify(mudanca.depois)}::jsonb)`);
}

function ok(mesa: MesaGuardada | undefined): DesfechoDaMesa {
  return mesa === undefined ? { tipo: 'nao-encontrada' } : { tipo: 'ok', mesa };
}

export function criarRepositorioDeMesas(banco: AcessoAoBanco): RepositorioDeMesas {
  return {
    listar: (restauranteId) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const { rows } = await transacao.execute<{ slug: string; nome: string }>(
          sql`SELECT slug, nome FROM restaurantes WHERE id = app.restaurante_atual()`,
        );
        const mesas = await transacao.execute<LinhaDeMesa>(sql`SELECT ${COLUNAS} FROM mesas ORDER BY numero`);
        return {
          slug: rows[0]?.slug ?? '',
          nomeDoRestaurante: rows[0]?.nome ?? '',
          mesas: mesas.rows.map(paraMesa),
        };
      }),
    criar: (restauranteId, nova, limite, autoria) =>
      banco.comRestaurante(restauranteId, async (transacao): Promise<DesfechoDaMesa> => {
        if ((await contarAtivas(transacao)) >= limite) {
          return { tipo: 'limite' };
        }
        const mesa = await umaMesa(
          transacao,
          sql`INSERT INTO mesas (restaurante_id, numero, nome, area, codigo)
              VALUES (app.restaurante_atual(), ${nova.numero}, ${nova.nome}, ${nova.area}, ${nova.codigo})
              ON CONFLICT DO NOTHING
              RETURNING ${COLUNAS}`,
        );
        if (mesa === undefined) {
          return {
            tipo: (await numeroOcupado(transacao, nova.numero, null)) ? 'numero-repetido' : 'codigo-repetido',
          };
        }
        await auditar(transacao, mesa.id, 'criar', autoria, { depois: { numero: mesa.numero } });
        return { tipo: 'ok', mesa };
      }),
    editar: (restauranteId, mesaId, dados) =>
      banco.comRestaurante(restauranteId, async (transacao) =>
        ok(
          await umaMesa(
            transacao,
            sql`UPDATE mesas SET nome = ${dados.nome}, area = ${dados.area}, atualizado_em = now()
                 WHERE id = ${mesaId} RETURNING ${COLUNAS}`,
          ),
        ),
      ),
    renumerar: (restauranteId, mesaId, numero, autoria) =>
      banco.comRestaurante(restauranteId, async (transacao): Promise<DesfechoDaMesa> => {
        const atual = await travarMesa(transacao, mesaId);
        if (atual === undefined || atual.numero === numero) {
          return ok(atual);
        }
        if (await numeroOcupado(transacao, numero, mesaId)) {
          return { tipo: 'numero-repetido' };
        }
        await transacao.execute(sql`
          INSERT INTO historico_numeros_mesa (restaurante_id, mesa_id, numero)
          VALUES (app.restaurante_atual(), ${mesaId}, ${atual.numero})
          ON CONFLICT DO NOTHING`);
        const mesa = await umaMesa(
          transacao,
          sql`UPDATE mesas SET numero = ${numero}, atualizado_em = now() WHERE id = ${mesaId} RETURNING ${COLUNAS}`,
        );
        await auditar(transacao, mesaId, 'renumerar', autoria, {
          antes: { numero: atual.numero },
          depois: { numero },
        });
        return ok(mesa);
      }),
    alterarAtiva: (restauranteId, mesaId, ativa, limite, autoria) =>
      banco.comRestaurante(restauranteId, async (transacao): Promise<DesfechoDaMesa> => {
        const ativas = await contarAtivas(transacao);
        const atual = await travarMesa(transacao, mesaId);
        if (atual === undefined || atual.ativa === ativa) {
          return ok(atual);
        }
        if (ativa && ativas >= limite) {
          return { tipo: 'limite' };
        }
        const mesa = await umaMesa(
          transacao,
          sql`UPDATE mesas SET ativa = ${ativa}, atualizado_em = now() WHERE id = ${mesaId} RETURNING ${COLUNAS}`,
        );
        await auditar(transacao, mesaId, ativa ? 'ativar' : 'desativar', autoria);
        return ok(mesa);
      }),
    trocarCodigo: (restauranteId, mesaId, codigo, autoria) =>
      banco.comRestaurante(restauranteId, async (transacao) => {
        const mesa = await umaMesa(
          transacao,
          sql`UPDATE mesas SET codigo = ${codigo}, codigo_gerado_em = now(), atualizado_em = now()
               WHERE id = ${mesaId} RETURNING ${COLUNAS}`,
        );
        if (mesa !== undefined) {
          await auditar(transacao, mesaId, 'trocar_codigo', autoria);
        }
        return ok(mesa);
      }),
  };
}
