import {
  avancarChamado,
  avancarPedido,
  cancelarPedidoPelaEquipe,
  encerrarSessaoDeMesa,
  obterFila,
  obterSituacaoDaSessao,
  type AcessoAoRestaurante,
  type DependenciasDaEquipe,
} from '@cardapio/aplicacao';
import { CODIGOS } from '@cardapio/dominio';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarRepositorioDeAtendimento } from '../atendimento/repositorio-de-atendimento.ts';
import type { AcessoAoBanco } from '../banco.ts';
import { criarRepositorioDaEquipe } from '../equipe/repositorio-da-equipe.ts';
import { abrirBanco, consultarComoAdmin, criarRestauranteDeTeste } from './apoio.ts';

let banco: AcessoAoBanco;
let dependencias: DependenciasDaEquipe;

beforeAll(() => {
  banco = abrirBanco('api', {}, 10);
  dependencias = { equipe: criarRepositorioDaEquipe(banco), relogio: { agora: () => new Date() } };
});

afterAll(async () => {
  await banco.encerrar();
});

interface Cenario {
  readonly acesso: AcessoAoRestaurante;
  readonly sessaoMesaId: string;
  readonly pedidoId: string;
  readonly chamadoId: string;
}

async function cenario(expiraEm = "now() + interval '4 hours'"): Promise<Cenario> {
  const { id: restauranteId } = await criarRestauranteDeTeste(banco);
  const [mesa, sessao, pedido, chamado] = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];
  await banco.comRestaurante(restauranteId, async (transacao) => {
    await transacao.execute(sql`INSERT INTO mesas (restaurante_id, id, numero, codigo)
      VALUES (${restauranteId}, ${mesa}, 7, ${uuidv7().replaceAll('-', '').slice(0, 22)})`);
    await transacao.execute(sql`INSERT INTO sessoes_mesa (restaurante_id, id, mesa_id, aberta_em, expira_em)
      VALUES (${restauranteId}, ${sessao}, ${mesa}, now() - interval '1 hour', ${sql.raw(expiraEm)})`);
    await transacao.execute(sql`INSERT INTO pedidos
      (restaurante_id, id, sessao_mesa_id, mesa_id, numero, total_centavos, chave_idempotencia, hash_conteudo)
      VALUES (${restauranteId}, ${pedido}, ${sessao}, ${mesa}, 1, 2500, ${uuidv7()}, ${'0'.repeat(64)})`);
    await transacao.execute(sql`INSERT INTO chamados
      (restaurante_id, id, sessao_mesa_id, mesa_id, tipo, chave_idempotencia)
      VALUES (${restauranteId}, ${chamado}, ${sessao}, ${mesa}, 'garcom', ${uuidv7()})`);
  });
  return {
    acesso: { restauranteId, papel: 'dono', usuarioId: undefined },
    sessaoMesaId: sessao,
    pedidoId: pedido,
    chamadoId: chamado,
  };
}

const linhas = <T extends Record<string, unknown>>(texto: string, restauranteId: string) =>
  consultarComoAdmin<T>(texto, [restauranteId]);

describe('fila da equipe no Postgres', () => {
  it('lista pedido, chamado e sessão abertos com o número da mesa', async () => {
    const { acesso, pedidoId, chamadoId, sessaoMesaId } = await cenario();
    const fila = await obterFila(dependencias, acesso);

    expect(fila.ok && fila.valor.pedidos.map((p) => [p.id, p.mesaNumero, p.situacao])).toEqual([
      [pedidoId, 7, 'enviado'],
    ]);
    expect(fila.ok && fila.valor.chamados.map((c) => c.id)).toEqual([chamadoId]);
    expect(fila.ok && fila.valor.sessoes.map((s) => s.id)).toEqual([sessaoMesaId]);
  });

  it('oito avanços simultâneos do mesmo pedido: um aplica, os outros recebem 409 com o estado atual', async () => {
    const { acesso, pedidoId } = await cenario();
    const respostas = await Promise.all(
      Array.from({ length: 8 }, () => avancarPedido(dependencias, acesso, pedidoId, 'enviado')),
    );

    expect(respostas.map((r) => (r.ok ? null : r.erro.detalhes)).filter((d) => d !== null)).toEqual(
      Array.from({ length: 7 }, () => ({ situacaoAtual: 'em_preparo' })),
    );
    const eventos = await linhas<{ tipo_evento: string; carga: { para: string } }>(
      'SELECT tipo_evento, carga FROM caixa_saida WHERE restaurante_id = $1',
      acesso.restauranteId,
    );
    expect(eventos.map((e) => [e.tipo_evento, e.carga.para])).toEqual([
      ['PedidoSituacaoAlterada', 'em_preparo'],
    ]);
    const auditoria = await linhas<{ acao: string }>(
      'SELECT acao FROM auditoria WHERE restaurante_id = $1',
      acesso.restauranteId,
    );
    expect(auditoria).toEqual([{ acao: 'pedido.avancar' }]);
  });

  it('cancelar pela equipe grava motivo, auditoria com motivo e evento', async () => {
    const { acesso, pedidoId } = await cenario();
    const resultado = await cancelarPedidoPelaEquipe(dependencias, acesso, pedidoId, {
      situacaoEsperada: 'enviado',
      motivo: 'acabou o peixe',
    });

    expect(resultado.ok).toBe(true);
    const [pedido] = await linhas<{ situacao: string; motivo_cancelamento: string }>(
      'SELECT situacao, motivo_cancelamento FROM pedidos WHERE restaurante_id = $1',
      acesso.restauranteId,
    );
    expect(pedido).toEqual({ situacao: 'cancelado', motivo_cancelamento: 'acabou o peixe' });
    const [registro] = await linhas<{ acao: string; motivo: string }>(
      'SELECT acao, motivo FROM auditoria WHERE restaurante_id = $1',
      acesso.restauranteId,
    );
    expect(registro).toEqual({ acao: 'pedido.cancelar', motivo: 'acabou o peixe' });
  });

  it('assume e conclui o chamado; repetir a conclusão não muda nada', async () => {
    const { acesso, chamadoId } = await cenario();

    expect((await avancarChamado(dependencias, acesso, chamadoId, 'aguardando')).ok).toBe(true);
    expect((await avancarChamado(dependencias, acesso, chamadoId, 'em_atendimento')).ok).toBe(true);
    expect(await avancarChamado(dependencias, acesso, chamadoId, 'em_atendimento')).toMatchObject({
      ok: false,
      erro: { detalhes: { situacaoAtual: 'concluido' } },
    });
    const acoes = await linhas<{ acao: string }>(
      'SELECT acao FROM auditoria WHERE restaurante_id = $1 ORDER BY id',
      acesso.restauranteId,
    );
    expect(acoes.map((a) => a.acao)).toEqual(['chamado.assumir', 'chamado.concluir']);
  });

  it('restaurante B não alcança o pedido nem a sessão de A', async () => {
    const a = await cenario();
    const b = await cenario();

    expect(await avancarPedido(dependencias, b.acesso, a.pedidoId, 'enviado')).toMatchObject({
      ok: false,
      erro: { codigo: CODIGOS.EQUIPE_ACAO_NAO_ENCONTRADO },
    });
    expect(await encerrarSessaoDeMesa(dependencias, b.acesso, a.sessaoMesaId, true)).toMatchObject({
      ok: false,
      erro: { codigo: CODIGOS.EQUIPE_ACAO_NAO_ENCONTRADO },
    });
  });
});

describe('encerrar a sessão pela equipe', () => {
  const atendimento = () => ({
    atendimento: criarRepositorioDeAtendimento(banco),
    relogio: { agora: () => new Date() },
  });

  it('com pedido aberto pede confirmação; confirmado, grava encerrada e o cliente vê o agradecimento', async () => {
    const { acesso, sessaoMesaId } = await cenario();

    expect(await encerrarSessaoDeMesa(dependencias, acesso, sessaoMesaId, false)).toMatchObject({
      ok: false,
      erro: { detalhes: { pedidosAbertos: 1, chamadosAbertos: 1 } },
    });
    expect((await encerrarSessaoDeMesa(dependencias, acesso, sessaoMesaId, true)).ok).toBe(true);

    const [sessao] = await linhas<{ motivo_fechamento: string }>(
      'SELECT motivo_fechamento FROM sessoes_mesa WHERE restaurante_id = $1',
      acesso.restauranteId,
    );
    expect(sessao?.motivo_fechamento).toBe('encerrada');
    expect(
      await obterSituacaoDaSessao(atendimento(), { restauranteId: acesso.restauranteId, sessaoMesaId }),
    ).toBe('encerrada');
    const eventos = await linhas<{ tipo_evento: string }>(
      "SELECT tipo_evento FROM caixa_saida WHERE restaurante_id = $1 AND tipo_evento = 'SessaoMesaEncerrada'",
      acesso.restauranteId,
    );
    expect(eventos).toHaveLength(1);
    expect(await encerrarSessaoDeMesa(dependencias, acesso, sessaoMesaId, true)).toMatchObject({
      ok: false,
      erro: { codigo: CODIGOS.EQUIPE_ENCERRAR_SESSAO_FECHADA },
    });
  });

  it('a sessão que só expirou continua expirada (escaneie), não agradecimento', async () => {
    const { acesso, sessaoMesaId } = await cenario("now() - interval '1 minute'");

    expect(
      await obterSituacaoDaSessao(atendimento(), { restauranteId: acesso.restauranteId, sessaoMesaId }),
    ).toBe('expirada');
    expect(await encerrarSessaoDeMesa(dependencias, acesso, sessaoMesaId, true)).toMatchObject({
      ok: false,
      erro: { codigo: CODIGOS.EQUIPE_ENCERRAR_SESSAO_FECHADA },
    });
  });
});
