import {
  cancelarChamado,
  chamarGarcom,
  obterResumoDaConta,
  obterSituacaoDaSessao,
  pedirConta,
  type DependenciasDoAtendimento,
} from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarRepositorioDeAtendimento } from '../atendimento/repositorio-de-atendimento.ts';
import type { AcessoAoBanco } from '../banco.ts';
import { criarSessoesMesaVencidas } from '../filas/sessoes-mesa-vencidas.ts';
import { abrirBanco, consultarComoAdmin, criarRestauranteDeTeste } from './apoio.ts';

let banco: AcessoAoBanco;
let dependencias: DependenciasDoAtendimento;

beforeAll(() => {
  banco = abrirBanco('api', {}, 10);
  dependencias = { atendimento: criarRepositorioDeAtendimento(banco), relogio: { agora: () => new Date() } };
});

afterAll(async () => {
  await banco.encerrar();
});

async function mesaAberta() {
  const { id: restauranteId } = await criarRestauranteDeTeste(banco);
  const mesa = uuidv7();
  const sessao = uuidv7();
  await banco.comRestaurante(restauranteId, async (transacao) => {
    await transacao.execute(sql`INSERT INTO mesas (restaurante_id, id, numero, codigo)
      VALUES (${restauranteId}, ${mesa}, 1, ${uuidv7().replaceAll('-', '').slice(0, 22)})`);
    await transacao.execute(sql`INSERT INTO sessoes_mesa (restaurante_id, id, mesa_id, expira_em)
      VALUES (${restauranteId}, ${sessao}, ${mesa}, now() + interval '4 hours')`);
  });
  return { restauranteId, sessaoMesaId: sessao, mesa };
}

const contar = async (tabela: string, restauranteId: string) =>
  (
    await consultarComoAdmin<{ total: number }>(
      `SELECT count(*)::int AS total FROM ${tabela} WHERE restaurante_id = $1`,
      [restauranteId],
    )
  )[0]?.total;

describe('chamados no Postgres', () => {
  it('oito toques simultâneos em chamar garçom (chaves diferentes) criam um chamado e um evento', async () => {
    const sessao = await mesaAberta();
    const respostas = await Promise.all(
      Array.from({ length: 8 }, () => chamarGarcom(dependencias, sessao, uuidv7())),
    );

    expect(new Set(respostas.map((r) => (r.ok ? r.valor.chamado.id : 'falha'))).size).toBe(1);
    expect(respostas.filter((r) => r.ok && r.valor.novo)).toHaveLength(1);
    expect(await contar('chamados', sessao.restauranteId)).toBe(1);
    const eventos = await consultarComoAdmin<{ tipo_evento: string }>(
      'SELECT tipo_evento FROM caixa_saida WHERE restaurante_id = $1',
      [sessao.restauranteId],
    );
    expect(eventos).toEqual([{ tipo_evento: 'ChamadoCriado' }]);
  });

  it('garçom e conta ao mesmo tempo: dois chamados convivem', async () => {
    const sessao = await mesaAberta();
    await Promise.all([
      chamarGarcom(dependencias, sessao, uuidv7()),
      pedirConta(dependencias, sessao, uuidv7()),
    ]);

    const tipos = await consultarComoAdmin<{ tipo: string }>(
      'SELECT tipo FROM chamados WHERE restaurante_id = $1 ORDER BY tipo',
      [sessao.restauranteId],
    );
    expect(tipos.map((linha) => linha.tipo)).toEqual(['conta', 'garcom']);
  });

  it('cancelar só enquanto aguardando; o banco recusa transição fora da ordem', async () => {
    const sessao = await mesaAberta();
    const aberto = await chamarGarcom(dependencias, sessao, uuidv7());
    const id = aberto.ok ? aberto.valor.chamado.id : '';
    await expect(
      banco.comRestaurante(sessao.restauranteId, (t) =>
        t.execute(sql`UPDATE chamados SET situacao = 'concluido' WHERE id = ${id}`),
      ),
    ).rejects.toThrow();
    await banco.comRestaurante(sessao.restauranteId, (t) =>
      t.execute(sql`UPDATE chamados SET situacao = 'em_atendimento' WHERE id = ${id}`),
    );

    const resultado = await cancelarChamado(dependencias, sessao, id);
    expect(resultado.ok ? null : resultado.erro.codigo).toBe('CHAMADO_CANCELAR_FORA_DE_HORA');
  });

  it('o chamado de A nunca aparece para B', async () => {
    const a = await mesaAberta();
    const b = await mesaAberta();
    const aberto = await chamarGarcom(dependencias, a, uuidv7());
    const id = aberto.ok ? aberto.valor.chamado.id : '';
    const repositorio = criarRepositorioDeAtendimento(banco);

    expect(await repositorio.obterChamado(b, id, new Date())).toBeNull();
    expect(await repositorio.cancelarChamado(b, id, new Date(), () => true)).toBe('nao-encontrado');
  });
});

describe('conta e situação da sessão', () => {
  it('a conta soma pedidos não cancelados com os preços copiados', async () => {
    const sessao = await mesaAberta();
    const { restauranteId, sessaoMesaId, mesa } = sessao;
    await banco.comRestaurante(restauranteId, async (t) => {
      const categoria = uuidv7();
      const prato = uuidv7();
      await t.execute(
        sql`INSERT INTO categorias (restaurante_id, id, nome, ordem) VALUES (${restauranteId}, ${categoria}, 'C', 1)`,
      );
      await t.execute(sql`INSERT INTO pratos (restaurante_id, id, categoria_id, nome, preco_centavos, ordem)
        VALUES (${restauranteId}, ${prato}, ${categoria}, 'Costela', 8900, 1)`);
      for (const [numero, situacao, total] of [
        [1, 'entregue', 11300],
        [2, 'cancelado', 5000],
      ] as const) {
        const pedido = uuidv7();
        await t.execute(sql`INSERT INTO pedidos (restaurante_id, id, sessao_mesa_id, mesa_id, numero, situacao, total_centavos, chave_idempotencia, hash_conteudo)
          VALUES (${restauranteId}, ${pedido}, ${sessaoMesaId}, ${mesa}, ${numero}, 'enviado', ${total}, ${uuidv7()}, ${'0'.repeat(64)})`);
        await t.execute(sql`INSERT INTO itens_pedido (restaurante_id, pedido_id, prato_id, nome_no_momento, preco_no_momento_centavos, quantidade)
          VALUES (${restauranteId}, ${pedido}, ${prato}, 'Costela', ${total}, 1)`);
        if (situacao === 'cancelado') {
          await t.execute(sql`UPDATE pedidos SET situacao = 'cancelado' WHERE id = ${pedido}`);
        }
      }
    });
    const resultado = await obterResumoDaConta(dependencias, sessao);

    expect(resultado.ok && resultado.valor).toMatchObject({
      subtotalCentavos: 11300,
      taxaCentavos: 1130,
      totalComTaxaCentavos: 12430,
      itens: [{ nome: 'Costela', quantidade: 1, precoCentavos: 11300 }],
    });
  });

  it('aberta, encerrada pela equipe ou expirada', async () => {
    const aberta = await mesaAberta();
    const encerrada = await mesaAberta();
    const expirada = await mesaAberta();
    await consultarComoAdmin(
      "UPDATE sessoes_mesa SET fechada_em = now(), motivo_fechamento = 'encerrada' WHERE id = $1",
      [encerrada.sessaoMesaId],
    );
    await consultarComoAdmin(
      "UPDATE sessoes_mesa SET fechada_em = now(), motivo_fechamento = 'expirada' WHERE id = $1",
      [expirada.sessaoMesaId],
    );

    expect(await obterSituacaoDaSessao(dependencias, aberta)).toBe('aberta');
    expect(await obterSituacaoDaSessao(dependencias, encerrada)).toBe('encerrada');
    expect(await obterSituacaoDaSessao(dependencias, expirada)).toBe('expirada');
    expect(
      await obterSituacaoDaSessao(dependencias, { ...encerrada, restauranteId: aberta.restauranteId }),
    ).toBe('expirada');
    const recusado = await chamarGarcom(dependencias, encerrada, uuidv7());
    expect(recusado.ok ? null : recusado.erro.codigo).toBe('PEDIDO_SESSAO_MESA_EXPIRADA');
  });

  it('a rotina de expiração marca o motivo como expirada', async () => {
    const sessao = await mesaAberta();
    await consultarComoAdmin(
      "UPDATE sessoes_mesa SET aberta_em = now() - interval '5 hours', expira_em = now() - interval '1 hour' WHERE id = $1",
      [sessao.sessaoMesaId],
    );
    const worker = abrirBanco('worker');
    await criarSessoesMesaVencidas(worker).fechar(sessao.restauranteId, [sessao.sessaoMesaId], new Date());
    await worker.encerrar();
    const [linha] = await consultarComoAdmin<{ motivo_fechamento: string }>(
      'SELECT motivo_fechamento FROM sessoes_mesa WHERE id = $1',
      [sessao.sessaoMesaId],
    );
    expect(linha?.motivo_fechamento).toBe('expirada');
  });
});
