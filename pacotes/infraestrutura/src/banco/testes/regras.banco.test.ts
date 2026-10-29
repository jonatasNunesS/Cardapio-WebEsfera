import { CODIGOS, ErroAplicacao, ErroIsolamentoInquilino } from '@cardapio/aplicacao';
import {
  aguardarEnvio,
  criarLogger,
  definirLoggerPadrao,
  executarComContexto,
  iniciarSentryNode,
  propagadorDeContexto,
  relatorDeErrosSentry,
} from '@cardapio/observabilidade/node';
import { criarTransporteFalso, DSN_DE_TESTE } from '@cardapio/observabilidade/teste';
import { and, eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AcessoAoBanco } from '../banco.ts';
import { historicoNumerosMesa, historicoSlugs, mesas, restaurantes, sessoesMesa } from '../esquema/index.ts';
import { gerarCodigoDeMesa } from '../mesas/codigo-de-mesa.ts';
import { criarRepositorioMesas } from '../mesas/repositorio-mesas.ts';
import { abrirBanco, consultarComoAdmin, criarRestauranteDeTeste, sufixoUnico } from './apoio.ts';

let banco: AcessoAoBanco;

beforeAll(() => {
  definirLoggerPadrao(criarLogger({ app: 'teste', nivel: 'silent' }));
  banco = abrirBanco('api', { propagador: propagadorDeContexto });
});

afterAll(async () => {
  await banco.encerrar();
});

async function criarMesaDeTeste(restauranteId: string, numero: number) {
  const mesa = { id: uuidv7(), restauranteId, numero, codigo: gerarCodigoDeMesa() };
  await banco.comRestaurante(restauranteId, (transacao) => transacao.insert(mesas).values(mesa));
  return mesa;
}

describe('11. resolver_mesa', () => {
  const repositorio = () => criarRepositorioMesas(banco);

  it('devolve valida com os ids certos', async () => {
    const restaurante = await criarRestauranteDeTeste(banco);
    const mesa = await criarMesaDeTeste(restaurante.id, 12);

    await expect(repositorio().resolverMesa(restaurante.slug, 12, mesa.codigo)).resolves.toEqual({
      situacao: 'valida',
      restauranteId: restaurante.id,
      mesaId: mesa.id,
      slugAtual: restaurante.slug,
      numeroAtual: 12,
    });
  });

  it('diz o motivo da recusa: código inexistente, mesa inativa e restaurante cancelado', async () => {
    const restaurante = await criarRestauranteDeTeste(banco);
    const inativa = await criarMesaDeTeste(restaurante.id, 3);
    await banco.comRestaurante(restaurante.id, (transacao) =>
      transacao.update(mesas).set({ ativa: false }).where(eq(mesas.id, inativa.id)),
    );
    const cancelado = await criarRestauranteDeTeste(banco, 'cancelado');
    const mesaDoCancelado = await criarMesaDeTeste(cancelado.id, 1);

    await expect(repositorio().resolverMesa(restaurante.slug, 1, gerarCodigoDeMesa())).resolves.toEqual({
      situacao: 'desconhecido',
    });
    await expect(repositorio().resolverMesa(restaurante.slug, 3, inativa.codigo)).resolves.toEqual({
      situacao: 'inativa',
    });
    await expect(repositorio().resolverMesa(cancelado.slug, 1, mesaDoCancelado.codigo)).resolves.toEqual({
      situacao: 'cancelado',
    });
  });

  it('o código acha a mesa: slug de outro restaurante ou número de outra mesa redireciona para o link atual', async () => {
    const restauranteA = await criarRestauranteDeTeste(banco);
    const restauranteB = await criarRestauranteDeTeste(banco);
    const mesa = await criarMesaDeTeste(restauranteA.id, 5);
    await criarMesaDeTeste(restauranteA.id, 6);

    for (const [slug, numero] of [
      [restauranteB.slug, 5],
      [restauranteA.slug, 6],
    ] as const) {
      await expect(repositorio().resolverMesa(slug, numero, mesa.codigo)).resolves.toEqual({
        situacao: 'redirecionar',
        restauranteId: restauranteA.id,
        mesaId: mesa.id,
        slugAtual: restauranteA.slug,
        numeroAtual: 5,
      });
    }
  });

  it('devolve redirecionar depois de renumerar a mesa e depois de trocar o slug', async () => {
    const restaurante = await criarRestauranteDeTeste(banco);
    const mesa = await criarMesaDeTeste(restaurante.id, 7);
    await banco.comRestaurante(restaurante.id, async (transacao) => {
      await transacao
        .insert(historicoNumerosMesa)
        .values({ restauranteId: restaurante.id, mesaId: mesa.id, numero: 7 });
      await transacao
        .update(mesas)
        .set({ numero: 17 })
        .where(and(eq(mesas.restauranteId, restaurante.id), eq(mesas.id, mesa.id)));
    });

    await expect(repositorio().resolverMesa(restaurante.slug, 7, mesa.codigo)).resolves.toMatchObject({
      situacao: 'redirecionar',
      numeroAtual: 17,
      slugAtual: restaurante.slug,
    });

    const slugNovo = `novo-${sufixoUnico()}`;
    await banco.comRestaurante(restaurante.id, async (transacao) => {
      await transacao.insert(historicoSlugs).values({ restauranteId: restaurante.id, slug: slugNovo });
      await transacao.update(restaurantes).set({ slug: slugNovo }).where(eq(restaurantes.id, restaurante.id));
    });

    await expect(repositorio().resolverMesa(restaurante.slug, 7, mesa.codigo)).resolves.toMatchObject({
      situacao: 'redirecionar',
      slugAtual: slugNovo,
      numeroAtual: 17,
    });
    await expect(repositorio().resolverMesa(slugNovo, 17, mesa.codigo)).resolves.toMatchObject({
      situacao: 'valida',
    });
  });

  it('um slug antigo nunca pode ser usado por outro restaurante', async () => {
    const restauranteA = await criarRestauranteDeTeste(banco);
    const outroId = uuidv7();

    await expect(
      banco.comRestaurante(outroId, async (transacao) => {
        await transacao.insert(restaurantes).values({ id: outroId, slug: restauranteA.slug, nome: 'Copia' });
        await transacao.insert(historicoSlugs).values({ restauranteId: outroId, slug: restauranteA.slug });
      }),
    ).rejects.toMatchObject({ codigo: CODIGOS.BANCO_CONSULTA_FALHOU });
  });
});

describe('regras de contexto', () => {
  it('12. comRestaurante com UUID inválido falha antes de abrir a transação', () => {
    const operacao = vi.fn();

    expect(() => banco.comRestaurante('nao-e-uuid', operacao)).toThrow(ErroAplicacao);
    expect(operacao).not.toHaveBeenCalled();
  });

  it('13. a violação de RLS chega ao relator de erros como fatal, com restaurante_id e tabela', async () => {
    const transporte = criarTransporteFalso();
    iniciarSentryNode({
      app: 'api',
      dsn: DSN_DE_TESTE,
      release: 'api@0.0.0+teste',
      ambiente: 'local',
      transporte: transporte.fabrica,
    });
    const restauranteA = await criarRestauranteDeTeste(banco);
    const restauranteB = await criarRestauranteDeTeste(banco);

    const erro = await executarComContexto({ idRastreio: uuidv7(), app: 'api' }, async () => {
      const falha: unknown = await banco
        .comRestaurante(restauranteA.id, (transacao) =>
          transacao
            .insert(mesas)
            .values({ restauranteId: restauranteB.id, numero: 1, codigo: gerarCodigoDeMesa() }),
        )
        .catch((motivo: unknown) => motivo);
      relatorDeErrosSentry.reportar(falha);
      return falha;
    });
    await aguardarEnvio(1000);

    expect(erro).toBeInstanceOf(ErroIsolamentoInquilino);
    expect(transporte.eventos).toHaveLength(1);
    expect(transporte.eventos[0]).toMatchObject({
      level: 'fatal',
      tags: { restaurante_id: restauranteA.id, codigo: CODIGOS.BANCO_ISOLAMENTO_VIOLADO, modulo: 'banco' },
      contexts: { negocio: { entidade: 'mesas' } },
    });
  });

  it('14. só uma sessão aberta por mesa', async () => {
    const restaurante = await criarRestauranteDeTeste(banco);
    const mesa = await criarMesaDeTeste(restaurante.id, 9);
    const abrir = () =>
      banco.comRestaurante(restaurante.id, (transacao) =>
        transacao.insert(sessoesMesa).values({
          restauranteId: restaurante.id,
          mesaId: mesa.id,
          expiraEm: new Date(Date.now() + 3_600_000),
        }),
      );

    await abrir();
    await expect(abrir()).rejects.toMatchObject({
      codigo: CODIGOS.BANCO_CONSULTA_FALHOU,
      contexto: { dados: { sqlstate: '23505', restricao: 'sessoes_mesa_uma_aberta_idx' } },
    });
  });

  it('10. a FK composta recusa uma sessão de A apontando para uma mesa de B', async () => {
    const restauranteA = await criarRestauranteDeTeste(banco);
    const restauranteB = await criarRestauranteDeTeste(banco);
    const mesaDeB = await criarMesaDeTeste(restauranteB.id, 4);

    await expect(
      banco.comRestaurante(restauranteA.id, (transacao) =>
        transacao.insert(sessoesMesa).values({
          restauranteId: restauranteA.id,
          mesaId: mesaDeB.id,
          expiraEm: new Date(Date.now() + 3_600_000),
        }),
      ),
    ).rejects.toMatchObject({
      codigo: CODIGOS.BANCO_CONSULTA_FALHOU,
      contexto: { dados: { sqlstate: '23503' } },
    });
  });

  it('15. app_runtime não lê auditoria com restaurante_id nulo', async () => {
    const restaurante = await criarRestauranteDeTeste(banco);
    await consultarComoAdmin(
      `INSERT INTO auditoria (restaurante_id, autor_tipo, acao, entidade) VALUES (NULL, 'administrador', 'acessar', 'suporte')`,
    );

    const visiveis = await banco.comRestaurante(restaurante.id, (transacao) =>
      transacao.execute(sql`SELECT count(*)::int AS total FROM auditoria WHERE restaurante_id IS NULL`),
    );

    expect(visiveis.rows[0]).toEqual({ total: 0 });
    await expect(
      banco.comRestaurante(restaurante.id, (transacao) =>
        transacao.execute(
          sql`INSERT INTO auditoria (restaurante_id, autor_tipo, acao, entidade) VALUES (NULL, 'sistema', 'x', 'y')`,
        ),
      ),
    ).rejects.toBeInstanceOf(ErroIsolamentoInquilino);
  });
});

describe('comSistema', () => {
  it('o worker no modo sistema lê a caixa de saída de todos os restaurantes, mas não as mesas', async () => {
    const worker = abrirBanco('worker');
    const restauranteA = await criarRestauranteDeTeste(worker);
    await worker.comRestaurante(restauranteA.id, (transacao) =>
      transacao.execute(
        sql`INSERT INTO caixa_saida (restaurante_id, tipo_evento, carga) VALUES (${restauranteA.id}, 'MesaCriada', '{}')`,
      ),
    );

    const pendentes = await worker.comSistema((transacao) =>
      transacao.execute(
        sql`SELECT count(*)::int AS total FROM caixa_saida WHERE restaurante_id = ${restauranteA.id}`,
      ),
    );
    const mesasNoSistema = worker.comSistema((transacao) =>
      transacao.execute(sql`SELECT count(*) FROM mesas`),
    );

    expect(pendentes.rows[0]).toEqual({ total: 1 });
    await expect(mesasNoSistema).rejects.toBeInstanceOf(ErroIsolamentoInquilino);
    await worker.encerrar();
  });

  it('a API não tem o pool de sistema', () => {
    expect(() => banco.comSistema(() => Promise.resolve(1))).toThrow(ErroAplicacao);
  });
});
