import {
  CODIGOS,
  ErroEstadoInconsistente,
  type ChamadoGuardado,
  type PedidoDaSessao,
  type RepositorioDeAtendimento,
  type SessaoDoCliente,
} from '@cardapio/aplicacao';
import type { SituacaoDoChamado, TipoDeChamado } from '@cardapio/dominio';
import { sql } from 'drizzle-orm';
import type { AcessoAoBanco, Transacao } from '../banco.ts';

interface LinhaDoChamado extends Record<string, unknown> {
  readonly id: string;
  readonly tipo: TipoDeChamado;
  readonly situacao: SituacaoDoChamado;
  readonly criado_em: string;
  readonly mesa_id: string;
}

const COLUNAS = sql.raw('id, tipo, situacao, criado_em, mesa_id');

const paraChamado = (linha: LinhaDoChamado): ChamadoGuardado => ({
  id: linha.id,
  tipo: linha.tipo,
  situacao: linha.situacao,
  criadoEm: new Date(linha.criado_em),
});

async function mesaDaSessaoValida(transacao: Transacao, sessao: SessaoDoCliente, agora: Date) {
  const { rows } = await transacao.execute<{ mesa_id: string }>(sql`
    SELECT mesa_id FROM sessoes_mesa
    WHERE id = ${sessao.sessaoMesaId} AND fechada_em IS NULL AND expira_em > ${agora.toISOString()}::timestamptz`);
  return rows[0]?.mesa_id ?? null;
}

async function umChamado(transacao: Transacao, sessao: SessaoDoCliente, filtro: ReturnType<typeof sql>) {
  const { rows } = await transacao.execute<LinhaDoChamado>(sql`
    SELECT ${COLUNAS} FROM chamados WHERE sessao_mesa_id = ${sessao.sessaoMesaId} AND ${filtro}
    ORDER BY criado_em DESC LIMIT 1`);
  return rows[0];
}

async function emitir(transacao: Transacao, tipo: string, linha: LinhaDoChamado) {
  const carga = { versao: 1, chamadoId: linha.id, tipo: linha.tipo, mesaId: linha.mesa_id };
  await transacao.execute(sql`
    INSERT INTO caixa_saida (restaurante_id, tipo_evento, carga)
    VALUES (app.restaurante_atual(), ${tipo}, ${JSON.stringify(carga)}::jsonb)`);
}

async function abrir(
  transacao: Transacao,
  sessao: SessaoDoCliente,
  tipo: TipoDeChamado,
  chave: string,
  mesaId: string,
) {
  await transacao.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${sessao.sessaoMesaId}:${tipo}`}, 0))`,
  );
  await transacao.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${chave}, 0))`);
  const pelaChave = await transacao.execute<LinhaDoChamado>(
    sql`SELECT ${COLUNAS} FROM chamados WHERE chave_idempotencia = ${chave}::uuid`,
  );
  const repetido =
    pelaChave.rows[0] ??
    (await umChamado(
      transacao,
      sessao,
      sql`tipo = ${tipo} AND situacao IN ('aguardando', 'em_atendimento')`,
    ));
  if (repetido !== undefined) {
    return { tipo: 'existente', chamado: paraChamado(repetido) } as const;
  }
  const { rows } = await transacao.execute<LinhaDoChamado>(sql`
    INSERT INTO chamados (restaurante_id, sessao_mesa_id, mesa_id, tipo, chave_idempotencia)
    VALUES (app.restaurante_atual(), ${sessao.sessaoMesaId}, ${mesaId}, ${tipo}, ${chave})
    RETURNING ${COLUNAS}`);
  const [criado] = rows;
  if (criado === undefined) {
    throw new ErroEstadoInconsistente(CODIGOS.BANCO_CONSULTA_FALHOU, 'O chamado gravado não voltou', {
      modulo: 'atendimento',
      casoDeUso: 'abrirChamado',
      restauranteId: sessao.restauranteId,
    });
  }
  await emitir(transacao, 'ChamadoCriado', criado);
  return { tipo: 'criado', chamado: paraChamado(criado) } as const;
}

interface LinhaDoPedido extends Record<string, unknown> {
  readonly situacao: PedidoDaSessao['situacao'];
  readonly total_centavos: number;
  readonly itens: PedidoDaSessao['itens'];
}

export function criarRepositorioDeAtendimento(banco: AcessoAoBanco): RepositorioDeAtendimento {
  return {
    abrirChamado: (sessao, tipo, chave, agora) =>
      banco.comRestaurante(sessao.restauranteId, async (transacao) => {
        const mesaId = await mesaDaSessaoValida(transacao, sessao, agora);
        return mesaId === null
          ? ({ tipo: 'sessao-expirada' } as const)
          : abrir(transacao, sessao, tipo, chave, mesaId);
      }),
    obterChamado: (sessao, id, agora) =>
      banco.comRestaurante(sessao.restauranteId, async (transacao) => {
        if ((await mesaDaSessaoValida(transacao, sessao, agora)) === null) {
          return 'sessao-expirada' as const;
        }
        const linha = await umChamado(transacao, sessao, sql`id = ${id}`);
        return linha === undefined ? null : paraChamado(linha);
      }),
    cancelarChamado: (sessao, id, agora, podeCancelar) =>
      banco.comRestaurante(sessao.restauranteId, async (transacao) => {
        if ((await mesaDaSessaoValida(transacao, sessao, agora)) === null) {
          return 'sessao-expirada' as const;
        }
        const { rows } = await transacao.execute<LinhaDoChamado>(sql`
          SELECT ${COLUNAS} FROM chamados WHERE id = ${id} AND sessao_mesa_id = ${sessao.sessaoMesaId} FOR UPDATE`);
        const [chamado] = rows;
        if (chamado === undefined) {
          return 'nao-encontrado' as const;
        }
        if (!podeCancelar(chamado.situacao)) {
          return 'fora-de-hora' as const;
        }
        await transacao.execute(sql`
          UPDATE chamados SET situacao = 'cancelado', atualizado_em = ${agora.toISOString()}::timestamptz
          WHERE id = ${id}`);
        await emitir(transacao, 'ChamadoCancelado', chamado);
        return 'cancelado' as const;
      }),
    pedidosDaSessao: (sessao, agora) =>
      banco.comRestaurante(sessao.restauranteId, async (transacao) => {
        if ((await mesaDaSessaoValida(transacao, sessao, agora)) === null) {
          return 'sessao-expirada' as const;
        }
        const { rows } = await transacao.execute<LinhaDoPedido>(sql`
          SELECT p.situacao, p.total_centavos,
            (SELECT coalesce(json_agg(json_build_object('nome', i.nome_no_momento, 'quantidade', i.quantidade,
               'precoCentavos', i.preco_no_momento_centavos) ORDER BY i.id), '[]'::json)
             FROM itens_pedido i WHERE i.pedido_id = p.id) AS itens
          FROM pedidos p WHERE p.sessao_mesa_id = ${sessao.sessaoMesaId} ORDER BY p.numero`);
        return rows.map((linha) => ({
          situacao: linha.situacao,
          totalCentavos: linha.total_centavos,
          itens: linha.itens,
        }));
      }),
    situacaoDaSessao: (sessao, agora) =>
      banco.comRestaurante(sessao.restauranteId, async (transacao) => {
        const { rows } = await transacao.execute<{
          fechada: boolean;
          motivo: string | null;
          vencida: boolean;
        }>(sql`
          SELECT fechada_em IS NOT NULL AS fechada, motivo_fechamento AS motivo,
                 expira_em <= ${agora.toISOString()}::timestamptz AS vencida
          FROM sessoes_mesa WHERE id = ${sessao.sessaoMesaId}`);
        const [linha] = rows;
        if (linha?.motivo === 'encerrada') {
          return 'encerrada' as const;
        }
        return linha === undefined || linha.fechada || linha.vencida
          ? ('expirada' as const)
          : ('aberta' as const);
      }),
  };
}
