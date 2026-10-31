import type {
  AcessoAoRestaurante,
  ChamadoNaFila,
  DesfechoDaMudanca,
  ItemNaFila,
  PedidoNaFila,
  RepositorioDaEquipe,
} from '@cardapio/aplicacao';
import type { SituacaoDoChamado, SituacaoDoPedido, TipoDeChamado } from '@cardapio/dominio';
import { sql } from 'drizzle-orm';
import type { AcessoAoBanco, Transacao } from '../banco.ts';

const JANELA_DOS_FINALIZADOS = "interval '3 hours'";
const LIMITE_DA_FILA = 200;

interface Registro {
  readonly acao: string;
  readonly entidade: 'pedido' | 'chamado' | 'sessao_mesa';
  readonly entidadeId: string;
  readonly antes: unknown;
  readonly depois: unknown;
  readonly motivo?: string | null;
}

async function auditar(transacao: Transacao, acesso: AcessoAoRestaurante, registro: Registro) {
  await transacao.execute(sql`
    INSERT INTO auditoria (restaurante_id, autor_tipo, autor_id, acao, entidade, entidade_id, antes, depois, motivo)
    VALUES (app.restaurante_atual(), 'usuario', ${acesso.usuarioId ?? null}, ${registro.acao},
            ${registro.entidade}, ${registro.entidadeId}, ${JSON.stringify(registro.antes)}::jsonb,
            ${JSON.stringify(registro.depois)}::jsonb, ${registro.motivo ?? null})`);
}

async function emitir(transacao: Transacao, tipo: string, carga: Record<string, unknown>) {
  await transacao.execute(sql`
    INSERT INTO caixa_saida (restaurante_id, tipo_evento, carga)
    VALUES (app.restaurante_atual(), ${tipo}, ${JSON.stringify({ versao: 1, ...carga })}::jsonb)`);
}

interface LinhaDoPedido extends Record<string, unknown> {
  readonly id: string;
  readonly numero: number;
  readonly situacao: SituacaoDoPedido;
  readonly mesa_numero: number;
  readonly sessao_mesa_id: string;
  readonly total_centavos: number;
  readonly criado_em: string;
  readonly itens: ItemNaFila[];
}

interface LinhaDoChamado extends Record<string, unknown> {
  readonly id: string;
  readonly tipo: TipoDeChamado;
  readonly situacao: SituacaoDoChamado;
  readonly mesa_numero: number;
  readonly sessao_mesa_id: string;
  readonly criado_em: string;
}

async function pedidosDaFila(transacao: Transacao, agora: Date): Promise<PedidoNaFila[]> {
  const { rows } = await transacao.execute<LinhaDoPedido>(sql`
    SELECT p.id, p.numero, p.situacao, m.numero AS mesa_numero, p.sessao_mesa_id, p.total_centavos, p.criado_em,
      (SELECT coalesce(json_agg(json_build_object('nome', i.nome_no_momento, 'quantidade', i.quantidade,
         'observacao', i.observacao) ORDER BY i.id), '[]'::json)
       FROM itens_pedido i WHERE i.pedido_id = p.id) AS itens
    FROM pedidos p JOIN mesas m ON m.id = p.mesa_id
    WHERE p.situacao IN ('enviado', 'em_preparo', 'pronto')
       OR (p.situacao = 'entregue'
           AND p.atualizado_em > ${agora.toISOString()}::timestamptz - ${sql.raw(JANELA_DOS_FINALIZADOS)})
    ORDER BY p.criado_em LIMIT ${LIMITE_DA_FILA}`);
  return rows.map((linha) => ({
    id: linha.id,
    numero: linha.numero,
    situacao: linha.situacao,
    mesaNumero: linha.mesa_numero,
    sessaoMesaId: linha.sessao_mesa_id,
    totalCentavos: linha.total_centavos,
    criadoEm: new Date(linha.criado_em),
    itens: linha.itens,
  }));
}

async function chamadosDaFila(transacao: Transacao, agora: Date): Promise<ChamadoNaFila[]> {
  const { rows } = await transacao.execute<LinhaDoChamado>(sql`
    SELECT c.id, c.tipo, c.situacao, m.numero AS mesa_numero, c.sessao_mesa_id, c.criado_em
    FROM chamados c JOIN mesas m ON m.id = c.mesa_id
    WHERE c.situacao IN ('aguardando', 'em_atendimento')
       OR (c.situacao = 'concluido'
           AND c.atualizado_em > ${agora.toISOString()}::timestamptz - ${sql.raw(JANELA_DOS_FINALIZADOS)})
    ORDER BY c.criado_em LIMIT ${LIMITE_DA_FILA}`);
  return rows.map((linha) => ({
    id: linha.id,
    tipo: linha.tipo,
    situacao: linha.situacao,
    mesaNumero: linha.mesa_numero,
    sessaoMesaId: linha.sessao_mesa_id,
    criadoEm: new Date(linha.criado_em),
  }));
}

async function sessoesAbertas(transacao: Transacao, agora: Date) {
  const { rows } = await transacao.execute<{ id: string; mesa_numero: number; aberta_em: string }>(sql`
    SELECT s.id, m.numero AS mesa_numero, s.aberta_em
    FROM sessoes_mesa s JOIN mesas m ON m.id = s.mesa_id
    WHERE s.fechada_em IS NULL AND s.expira_em > ${agora.toISOString()}::timestamptz
    ORDER BY m.numero LIMIT ${LIMITE_DA_FILA}`);
  return rows.map((linha) => ({
    id: linha.id,
    mesaNumero: linha.mesa_numero,
    abertaEm: new Date(linha.aberta_em),
  }));
}

function conferir<S>(atual: S | undefined, esperada: S): DesfechoDaMudanca<S> | null {
  if (atual === undefined) {
    return { tipo: 'nao-encontrado' };
  }
  return atual === esperada ? null : { tipo: 'desatualizado', atual };
}

export function criarRepositorioDaEquipe(banco: AcessoAoBanco): RepositorioDaEquipe {
  return {
    fila: (acesso, agora) =>
      banco.comRestaurante(acesso.restauranteId, async (transacao) => ({
        pedidos: await pedidosDaFila(transacao, agora),
        chamados: await chamadosDaFila(transacao, agora),
        sessoes: await sessoesAbertas(transacao, agora),
      })),
    mudarPedido: (acesso, mudanca, agora) =>
      banco.comRestaurante(acesso.restauranteId, async (transacao) => {
        const { rows } = await transacao.execute<{
          situacao: SituacaoDoPedido;
          numero: number;
          mesa_id: string;
          sessao_mesa_id: string;
        }>(
          sql`SELECT situacao, numero, mesa_id, sessao_mesa_id FROM pedidos WHERE id = ${mudanca.id} FOR UPDATE`,
        );
        const [pedido] = rows;
        const recusa = conferir(pedido?.situacao, mudanca.de);
        if (recusa !== null || pedido === undefined) {
          return recusa ?? { tipo: 'nao-encontrado' };
        }
        await transacao.execute(sql`
          UPDATE pedidos SET situacao = ${mudanca.para}, motivo_cancelamento = ${mudanca.motivo},
            atualizado_em = ${agora.toISOString()}::timestamptz
          WHERE id = ${mudanca.id}`);
        await auditar(transacao, acesso, {
          acao: mudanca.para === 'cancelado' ? 'pedido.cancelar' : 'pedido.avancar',
          entidade: 'pedido',
          entidadeId: mudanca.id,
          antes: { situacao: mudanca.de },
          depois: { situacao: mudanca.para },
          motivo: mudanca.motivo,
        });
        await emitir(transacao, 'PedidoSituacaoAlterada', {
          pedidoId: mudanca.id,
          numero: pedido.numero,
          mesaId: pedido.mesa_id,
          sessaoMesaId: pedido.sessao_mesa_id,
          de: mudanca.de,
          para: mudanca.para,
        });
        return { tipo: 'alterado' };
      }),
    mudarChamado: (acesso, mudanca, agora) =>
      banco.comRestaurante(acesso.restauranteId, async (transacao) => {
        const { rows } = await transacao.execute<{
          situacao: SituacaoDoChamado;
          tipo: TipoDeChamado;
          mesa_id: string;
          sessao_mesa_id: string;
        }>(
          sql`SELECT situacao, tipo, mesa_id, sessao_mesa_id FROM chamados WHERE id = ${mudanca.id} FOR UPDATE`,
        );
        const [chamado] = rows;
        const recusa = conferir(chamado?.situacao, mudanca.de);
        if (recusa !== null || chamado === undefined) {
          return recusa ?? { tipo: 'nao-encontrado' };
        }
        const assumidoPor =
          mudanca.para === 'em_atendimento' ? sql`${acesso.usuarioId ?? null}` : sql`assumido_por`;
        await transacao.execute(sql`
          UPDATE chamados SET situacao = ${mudanca.para}, assumido_por = ${assumidoPor},
            atualizado_em = ${agora.toISOString()}::timestamptz
          WHERE id = ${mudanca.id}`);
        await auditar(transacao, acesso, {
          acao: mudanca.para === 'em_atendimento' ? 'chamado.assumir' : 'chamado.concluir',
          entidade: 'chamado',
          entidadeId: mudanca.id,
          antes: { situacao: mudanca.de },
          depois: { situacao: mudanca.para },
        });
        await emitir(transacao, 'ChamadoSituacaoAlterada', {
          chamadoId: mudanca.id,
          tipo: chamado.tipo,
          mesaId: chamado.mesa_id,
          sessaoMesaId: chamado.sessao_mesa_id,
          de: mudanca.de,
          para: mudanca.para,
        });
        return { tipo: 'alterado' };
      }),
    encerrarSessao: (acesso, sessaoMesaId, confirmado, agora) =>
      banco.comRestaurante(acesso.restauranteId, async (transacao) => {
        const { rows } = await transacao.execute<{ mesa_id: string; aberta: boolean }>(sql`
          SELECT mesa_id, fechada_em IS NULL AND expira_em > ${agora.toISOString()}::timestamptz AS aberta
          FROM sessoes_mesa WHERE id = ${sessaoMesaId} FOR UPDATE`);
        const [sessao] = rows;
        if (sessao === undefined) {
          return { tipo: 'nao-encontrada' };
        }
        if (!sessao.aberta) {
          return { tipo: 'ja-fechada' };
        }
        const pendencias = await contarPendencias(transacao, sessaoMesaId);
        if (!confirmado && pendencias.pedidos + pendencias.chamados > 0) {
          return { tipo: 'pendencias', ...pendencias };
        }
        await transacao.execute(sql`
          UPDATE sessoes_mesa SET fechada_em = ${agora.toISOString()}::timestamptz, motivo_fechamento = 'encerrada'
          WHERE id = ${sessaoMesaId}`);
        await auditar(transacao, acesso, {
          acao: 'sessao_mesa.encerrar',
          entidade: 'sessao_mesa',
          entidadeId: sessaoMesaId,
          antes: { aberta: true, pedidosAbertos: pendencias.pedidos, chamadosAbertos: pendencias.chamados },
          depois: { motivoFechamento: 'encerrada' },
        });
        await emitir(transacao, 'SessaoMesaEncerrada', { sessaoMesaId, mesaId: sessao.mesa_id });
        return { tipo: 'encerrada' };
      }),
  };
}

async function contarPendencias(transacao: Transacao, sessaoMesaId: string) {
  const { rows } = await transacao.execute<{ pedidos: number; chamados: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM pedidos
        WHERE sessao_mesa_id = ${sessaoMesaId} AND situacao IN ('enviado', 'em_preparo', 'pronto')) AS pedidos,
      (SELECT count(*)::int FROM chamados
        WHERE sessao_mesa_id = ${sessaoMesaId} AND situacao IN ('aguardando', 'em_atendimento')) AS chamados`);
  return rows[0] ?? { pedidos: 0, chamados: 0 };
}
