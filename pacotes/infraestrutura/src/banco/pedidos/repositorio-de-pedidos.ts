import {
  CODIGOS,
  ErroEstadoInconsistente,
  type EstadoParaPedido,
  type Horario,
  type PedidoGuardado,
  type RepositorioDePedidos,
  type SessaoDoCliente,
} from '@cardapio/aplicacao';
import type {
  PedidoMontado,
  PratoParaPedido,
  SituacaoDoPedido,
  SituacaoDoRestaurante,
} from '@cardapio/dominio';
import { sql } from 'drizzle-orm';
import type { AcessoAoBanco, Transacao } from '../banco.ts';

interface LinhaDoPedido extends Record<string, unknown> {
  readonly id: string;
  readonly numero: number;
  readonly situacao: SituacaoDoPedido;
  readonly total_centavos: number;
  readonly criado_em: string;
  readonly hash_conteudo: string;
  readonly itens: readonly {
    readonly pratoId: string;
    readonly nome: string;
    readonly precoCentavos: number;
    readonly quantidade: number;
    readonly observacao: string;
  }[];
}

const COLUNAS_DO_PEDIDO = sql`p.id, p.numero, p.situacao, p.total_centavos, p.criado_em, p.hash_conteudo,
  (SELECT coalesce(json_agg(json_build_object('pratoId', i.prato_id, 'nome', i.nome_no_momento,
     'precoCentavos', i.preco_no_momento_centavos, 'quantidade', i.quantidade, 'observacao', i.observacao)
     ORDER BY i.id), '[]'::json)
   FROM itens_pedido i WHERE i.pedido_id = p.id) AS itens`;

function paraPedido(linha: LinhaDoPedido): PedidoGuardado {
  return {
    id: linha.id,
    numero: linha.numero,
    situacao: linha.situacao,
    totalCentavos: linha.total_centavos,
    criadoEm: new Date(linha.criado_em),
    itens: linha.itens,
  };
}

async function umPedido(transacao: Transacao, sessao: SessaoDoCliente, filtro: ReturnType<typeof sql>) {
  const { rows } = await transacao.execute<LinhaDoPedido>(sql`
    SELECT ${COLUNAS_DO_PEDIDO} FROM pedidos p
    WHERE p.sessao_mesa_id = ${sessao.sessaoMesaId} AND ${filtro}`);
  return rows[0];
}

async function mesaDaSessaoValida(transacao: Transacao, sessao: SessaoDoCliente, agora: Date) {
  const { rows } = await transacao.execute<{ mesa_id: string }>(sql`
    SELECT mesa_id FROM sessoes_mesa
    WHERE id = ${sessao.sessaoMesaId} AND fechada_em IS NULL AND expira_em > ${agora.toISOString()}::timestamptz`);
  return rows[0]?.mesa_id ?? null;
}

async function lerEstado(transacao: Transacao, pratoIds: readonly string[]): Promise<EstadoParaPedido> {
  const { rows } = await transacao.execute<{
    situacao: SituacaoDoRestaurante;
    fuso_horario: string;
    horarios: Horario[];
  }>(sql`
    SELECT r.situacao, r.fuso_horario,
      (SELECT coalesce(json_agg(json_build_object('diaSemana', h.dia_semana,
         'abre', to_char(h.abre, 'HH24:MI'), 'fecha', to_char(h.fecha, 'HH24:MI'))), '[]'::json)
       FROM horarios h) AS horarios
    FROM restaurantes r WHERE r.id = app.restaurante_atual()`);
  const pratos = await transacao.execute<{
    id: string;
    nome: string;
    preco_centavos: number;
    disponivel: boolean;
  }>(sql`
    SELECT id, nome, preco_centavos, disponivel FROM pratos
    WHERE id = ANY(${sql.param([...pratoIds])}::uuid[]) AND removido_em IS NULL`);
  const [restaurante] = rows;
  return {
    situacaoDoRestaurante: restaurante?.situacao ?? 'cancelado',
    fusoHorario: restaurante?.fuso_horario ?? 'America/Sao_Paulo',
    horarios: restaurante?.horarios ?? [],
    pratos: new Map<string, PratoParaPedido>(
      pratos.rows.map((prato) => [
        prato.id,
        { id: prato.id, nome: prato.nome, precoCentavos: prato.preco_centavos, disponivel: prato.disponivel },
      ]),
    ),
  };
}

async function gravar(
  transacao: Transacao,
  sessao: SessaoDoCliente,
  mesaId: string,
  chave: { readonly chave: string; readonly hashDoConteudo: string },
  montado: PedidoMontado,
): Promise<string> {
  const contador = await transacao.execute<{ numero: number }>(sql`
    INSERT INTO contadores_pedido (restaurante_id, ultimo_numero) VALUES (app.restaurante_atual(), 1)
    ON CONFLICT (restaurante_id) DO UPDATE SET ultimo_numero = contadores_pedido.ultimo_numero + 1
    RETURNING ultimo_numero AS numero`);
  const numero = contador.rows[0]?.numero ?? 0;
  const inserido = await transacao.execute<{ id: string }>(sql`
    INSERT INTO pedidos (restaurante_id, sessao_mesa_id, mesa_id, numero, total_centavos, chave_idempotencia, hash_conteudo)
    VALUES (app.restaurante_atual(), ${sessao.sessaoMesaId}, ${mesaId}, ${numero}, ${montado.totalCentavos},
            ${chave.chave}, ${chave.hashDoConteudo})
    RETURNING id`);
  const pedidoId = inserido.rows[0]?.id ?? '';
  for (const item of montado.itens) {
    await transacao.execute(sql`
      INSERT INTO itens_pedido (restaurante_id, pedido_id, prato_id, nome_no_momento, preco_no_momento_centavos,
                                quantidade, observacao)
      VALUES (app.restaurante_atual(), ${pedidoId}, ${item.pratoId}, ${item.nome}, ${item.precoCentavos},
              ${item.quantidade}, ${item.observacao})`);
  }
  await emitir(transacao, 'PedidoCriado', { versao: 1, pedidoId, numero, mesaId });
  return pedidoId;
}

async function emitir(transacao: Transacao, tipo: string, carga: Readonly<Record<string, unknown>>) {
  await transacao.execute(sql`
    INSERT INTO caixa_saida (restaurante_id, tipo_evento, carga)
    VALUES (app.restaurante_atual(), ${tipo}, ${JSON.stringify(carga)}::jsonb)`);
}

export function criarRepositorioDePedidos(banco: AcessoAoBanco): RepositorioDePedidos {
  return {
    criar: (sessao, novo, agora, decidir) =>
      banco.comRestaurante(sessao.restauranteId, async (transacao) => {
        const mesaId = await mesaDaSessaoValida(transacao, sessao, agora);
        if (mesaId === null) {
          return { tipo: 'sessao-expirada' } as const;
        }
        await transacao.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${novo.chave}, 0))`);
        const existente = await transacao.execute<LinhaDoPedido>(sql`
          SELECT ${COLUNAS_DO_PEDIDO} FROM pedidos p WHERE p.chave_idempotencia = ${novo.chave}::uuid`);
        const [anterior] = existente.rows;
        if (anterior !== undefined) {
          return anterior.hash_conteudo === novo.hashDoConteudo
            ? ({ tipo: 'existente', pedido: paraPedido(anterior) } as const)
            : ({ tipo: 'chave-reusada' } as const);
        }
        const montado = decidir(await lerEstado(transacao, novo.pratoIds));
        if (!montado.ok) {
          return { tipo: 'recusado', erro: montado.erro } as const;
        }
        const pedidoId = await gravar(transacao, sessao, mesaId, novo, montado.valor);
        const criado = await umPedido(transacao, sessao, sql`p.id = ${pedidoId}`);
        if (criado === undefined) {
          throw new ErroEstadoInconsistente(CODIGOS.BANCO_CONSULTA_FALHOU, 'O pedido gravado não voltou', {
            modulo: 'pedidos',
            casoDeUso: 'criarPedido',
            restauranteId: sessao.restauranteId,
          });
        }
        return { tipo: 'criado', pedido: paraPedido(criado) } as const;
      }),
    obter: (sessao, pedidoId, agora) =>
      banco.comRestaurante(sessao.restauranteId, async (transacao) => {
        if ((await mesaDaSessaoValida(transacao, sessao, agora)) === null) {
          return 'sessao-expirada' as const;
        }
        const linha = await umPedido(transacao, sessao, sql`p.id = ${pedidoId}`);
        return linha === undefined ? null : paraPedido(linha);
      }),
    cancelar: (sessao, pedidoId, agora, podeCancelar) =>
      banco.comRestaurante(sessao.restauranteId, async (transacao) => {
        if ((await mesaDaSessaoValida(transacao, sessao, agora)) === null) {
          return 'sessao-expirada' as const;
        }
        const { rows } = await transacao.execute<{
          situacao: SituacaoDoPedido;
          numero: number;
          mesa_id: string;
        }>(sql`
          SELECT situacao, numero, mesa_id FROM pedidos
          WHERE id = ${pedidoId} AND sessao_mesa_id = ${sessao.sessaoMesaId} FOR UPDATE`);
        const [pedido] = rows;
        if (pedido === undefined) {
          return 'nao-encontrado' as const;
        }
        if (!podeCancelar(pedido.situacao)) {
          return 'fora-de-hora' as const;
        }
        await transacao.execute(sql`
          UPDATE pedidos SET situacao = 'cancelado', atualizado_em = ${agora.toISOString()}::timestamptz
          WHERE id = ${pedidoId}`);
        await emitir(transacao, 'PedidoCancelado', {
          versao: 1,
          pedidoId,
          numero: pedido.numero,
          mesaId: pedido.mesa_id,
        });
        return 'cancelado' as const;
      }),
  };
}
