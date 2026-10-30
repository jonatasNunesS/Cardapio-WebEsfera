import { criarPedido, type DependenciasDosPedidos, type SessaoDoCliente } from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AcessoAoBanco } from '../banco.ts';
import { criarRepositorioDePedidos } from '../pedidos/repositorio-de-pedidos.ts';
import { abrirBanco, consultarComoAdmin, criarRestauranteDeTeste } from './apoio.ts';

let banco: AcessoAoBanco;
const relogio = { agora: () => new Date() };
const resumidor = { resumo: (texto: string) => createHash('sha256').update(texto).digest('hex') };

beforeAll(() => {
  banco = abrirBanco('api', {}, 20);
});

afterAll(async () => {
  await banco.encerrar();
});

const dependencias = (acesso: AcessoAoBanco = banco): DependenciasDosPedidos => ({
  pedidos: criarRepositorioDePedidos(acesso),
  resumidor,
  relogio,
});

async function mesaComCardapio() {
  const { id: restauranteId } = await criarRestauranteDeTeste(banco);
  const ids = { categoria: uuidv7(), picanha: uuidv7(), suco: uuidv7(), mesa: uuidv7(), sessao: uuidv7() };
  await banco.comRestaurante(restauranteId, async (transacao) => {
    await transacao.execute(sql`INSERT INTO categorias (restaurante_id, id, nome, ordem)
      VALUES (${restauranteId}, ${ids.categoria}, 'Principais', 1024)`);
    await transacao.execute(sql`INSERT INTO pratos (restaurante_id, id, categoria_id, nome, preco_centavos, ordem) VALUES
      (${restauranteId}, ${ids.picanha}, ${ids.categoria}, 'Picanha', 8900, 1024),
      (${restauranteId}, ${ids.suco}, ${ids.categoria}, 'Suco', 1200, 2048)`);
    await transacao.execute(sql`INSERT INTO mesas (restaurante_id, id, numero, codigo)
      VALUES (${restauranteId}, ${ids.mesa}, 1, ${uuidv7().replaceAll('-', '').slice(0, 22)})`);
    await transacao.execute(sql`INSERT INTO sessoes_mesa (restaurante_id, id, mesa_id, expira_em)
      VALUES (${restauranteId}, ${ids.sessao}, ${ids.mesa}, now() + interval '4 hours')`);
  });
  const sessao: SessaoDoCliente = { restauranteId, sessaoMesaId: ids.sessao };
  const itens = [
    { pratoId: ids.picanha, quantidade: 2, observacao: '' },
    { pratoId: ids.suco, quantidade: 1, observacao: 'sem gelo' },
  ];
  return { restauranteId, sessao, ids, itens };
}

const contar = async (tabela: string, restauranteId: string) =>
  (
    await consultarComoAdmin<{ total: number }>(
      `SELECT count(*)::int AS total FROM ${tabela} WHERE restaurante_id = $1`,
      [restauranteId],
    )
  )[0]?.total;

describe('pedidos no Postgres', () => {
  it('a mesma chave em requisições simultâneas gera um pedido só e a mesma resposta', async () => {
    const { restauranteId, sessao, itens } = await mesaComCardapio();
    const chave = uuidv7();
    const respostas = await Promise.all(
      Array.from({ length: 8 }, () => criarPedido(dependencias(), sessao, { chave, itens })),
    );

    expect(new Set(respostas.map((r) => (r.ok ? r.valor.pedido.id : 'falha'))).size).toBe(1);
    expect(respostas.filter((r) => r.ok && r.valor.novo)).toHaveLength(1);
    expect(await contar('pedidos', restauranteId)).toBe(1);
    expect(await contar('caixa_saida', restauranteId)).toBe(1);
    const outro = await criarPedido(dependencias(), sessao, { chave: uuidv7(), itens });
    expect(outro.ok && outro.valor.pedido.numero).toBe(2);
  });

  it('o item guarda nome e preço do momento: mudar o cardápio não muda o pedido antigo', async () => {
    const { restauranteId, sessao, ids, itens } = await mesaComCardapio();
    const criado = await criarPedido(dependencias(), sessao, { chave: uuidv7(), itens });
    await consultarComoAdmin(`UPDATE pratos SET preco_centavos = 1, nome = 'Outro' WHERE id = $1`, [
      ids.picanha,
    ]);
    const [item] = await consultarComoAdmin<{ nome_no_momento: string; preco_no_momento_centavos: number }>(
      'SELECT nome_no_momento, preco_no_momento_centavos FROM itens_pedido WHERE restaurante_id = $1 AND prato_id = $2',
      [restauranteId, ids.picanha],
    );

    expect(criado.ok && criado.valor.pedido.totalCentavos).toBe(8900 * 2 + 1200);
    expect(item).toEqual({ nome_no_momento: 'Picanha', preco_no_momento_centavos: 8900 });
  });

  it('a aplicação não altera nem apaga item gravado, e a situação só anda na ordem', async () => {
    const { restauranteId, sessao, itens } = await mesaComCardapio();
    const criado = await criarPedido(dependencias(), sessao, { chave: uuidv7(), itens });
    const pedidoId = criado.ok ? criado.valor.pedido.id : '';
    const executar = (consulta: ReturnType<typeof sql>) =>
      banco.comRestaurante(restauranteId, (transacao) => transacao.execute(consulta));

    await expect(executar(sql`UPDATE itens_pedido SET quantidade = 9`)).rejects.toThrow();
    await expect(executar(sql`DELETE FROM itens_pedido`)).rejects.toThrow();
    await expect(executar(sql`UPDATE pedidos SET total_centavos = 1`)).rejects.toThrow();
    await expect(
      executar(sql`UPDATE pedidos SET situacao = 'entregue' WHERE id = ${pedidoId}`),
    ).rejects.toThrow();
    for (const situacao of ['em_preparo', 'pronto', 'entregue']) {
      await executar(sql`UPDATE pedidos SET situacao = ${situacao} WHERE id = ${pedidoId}`);
    }
    await expect(
      executar(sql`UPDATE pedidos SET situacao = 'enviado' WHERE id = ${pedidoId}`),
    ).rejects.toThrow();
  });

  it('pedido, itens, número e PedidoCriado são atômicos: uma falha no meio não deixa nada', async () => {
    const { restauranteId, sessao, itens } = await mesaComCardapio();
    const quebrado: AcessoAoBanco = {
      ...banco,
      comRestaurante: (id, operacao) =>
        banco.comRestaurante(id, async (transacao) => {
          await operacao(transacao);
          throw new Error('processo caiu antes do commit');
        }),
    };

    await expect(criarPedido(dependencias(quebrado), sessao, { chave: uuidv7(), itens })).rejects.toThrow();
    expect(await contar('pedidos', restauranteId)).toBe(0);
    expect(await contar('itens_pedido', restauranteId)).toBe(0);
    expect(await contar('caixa_saida', restauranteId)).toBe(0);
    expect(await contar('contadores_pedido', restauranteId)).toBe(0);
    const depois = await criarPedido(dependencias(), sessao, { chave: uuidv7(), itens });
    expect(depois.ok && depois.valor.pedido.numero).toBe(1);
    const [evento] = await consultarComoAdmin<{ tipo_evento: string; carga: { numero: number } }>(
      'SELECT tipo_evento, carga FROM caixa_saida WHERE restaurante_id = $1',
      [restauranteId],
    );
    expect(evento).toMatchObject({ tipo_evento: 'PedidoCriado', carga: { numero: 1 } });
  });

  it('o pedido de A nunca aparece na sessão de B', async () => {
    const a = await mesaComCardapio();
    const b = await mesaComCardapio();
    const criado = await criarPedido(dependencias(), a.sessao, { chave: uuidv7(), itens: a.itens });
    const pedidoId = criado.ok ? criado.valor.pedido.id : '';
    const repositorio = criarRepositorioDePedidos(banco);

    expect(await repositorio.obter(b.sessao, pedidoId, new Date())).toBeNull();
    expect(
      await repositorio.obter({ ...a.sessao, restauranteId: b.restauranteId }, pedidoId, new Date()),
    ).toBe('sessao-expirada');
    expect(await repositorio.cancelar(b.sessao, pedidoId, new Date(), () => true)).toBe('nao-encontrado');
  });
});

describe('carga: numeração por restaurante', () => {
  it(
    '50 restaurantes com pedidos simultâneos numeram de 1 a N, sem salto nem colisão',
    { timeout: 120_000 },
    async () => {
      const POR_RESTAURANTE = 8;
      const mesas = await Promise.all(Array.from({ length: 50 }, () => mesaComCardapio()));
      const pedidos = mesas.flatMap((mesa) =>
        Array.from(
          { length: POR_RESTAURANTE },
          () => () => criarPedido(dependencias(), mesa.sessao, { chave: uuidv7(), itens: mesa.itens }),
        ),
      );
      const embaralhados = pedidos.sort(() => Math.random() - 0.5);
      const resultados = await Promise.all(embaralhados.map((pedir) => pedir()));

      expect(resultados.every((resultado) => resultado.ok)).toBe(true);
      const linhas = await consultarComoAdmin<{ restaurante_id: string; numeros: number[] }>(
        `SELECT restaurante_id, array_agg(numero ORDER BY numero) AS numeros FROM pedidos
        WHERE restaurante_id = ANY($1) GROUP BY restaurante_id`,
        [mesas.map((mesa) => mesa.restauranteId)],
      );
      expect(linhas).toHaveLength(50);
      for (const linha of linhas) {
        expect(linha.numeros).toEqual(Array.from({ length: POR_RESTAURANTE }, (_, indice) => indice + 1));
      }
    },
  );
});
