import { expirarSessoesMesa, type SessoesMesaVencidas } from '@cardapio/aplicacao';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AcessoAoBanco } from '../../banco/banco.ts';
import { mesas, sessoesMesa } from '../../banco/esquema/index.ts';
import { criarSessoesMesaVencidas } from '../../banco/filas/sessoes-mesa-vencidas.ts';
import { gerarCodigoDeMesa } from '../../banco/mesas/codigo-de-mesa.ts';
import { abrirBanco, consultarComoAdmin, criarRestauranteDeTeste } from '../../banco/testes/apoio.ts';

const HORA_MS = 3600_000;
let numero = 0;

async function criarSessao(banco: AcessoAoBanco, restauranteId: string, expiraEm: Date, fechadaEm?: Date) {
  const [mesaId, id] = [uuidv7(), uuidv7()];
  numero += 1;
  await banco.comRestaurante(restauranteId, async (transacao) => {
    await transacao.insert(mesas).values({ id: mesaId, restauranteId, numero, codigo: gerarCodigoDeMesa() });
    await transacao.insert(sessoesMesa).values({
      id,
      restauranteId,
      mesaId,
      abertaEm: new Date(expiraEm.getTime() - 4 * HORA_MS),
      expiraEm,
      fechadaEm: fechadaEm ?? null,
      motivoFechamento: fechadaEm === undefined ? null : 'expirada',
    });
  });
  return { id, mesaId };
}

interface LinhaDaSessao {
  readonly id: string;
  readonly fechada_em: Date | null;
}

describe('rotina expirar-sessoes-mesa', () => {
  let api: AcessoAoBanco;
  let worker: AcessoAoBanco;

  beforeAll(() => {
    api = abrirBanco('api');
    worker = abrirBanco('worker');
  });

  afterAll(async () => {
    await Promise.all([api.encerrar(), worker.encerrar()]);
  });

  it('fecha só as vencidas, em lotes, grava um evento por sessão e é idempotente', async () => {
    const agora = new Date();
    const [primeiro, segundo] = [await criarRestauranteDeTeste(api), await criarRestauranteDeTeste(api)];
    const vencidas = [
      await criarSessao(api, primeiro.id, new Date(agora.getTime() - HORA_MS)),
      await criarSessao(api, primeiro.id, new Date(agora.getTime() - 2 * HORA_MS)),
      await criarSessao(api, primeiro.id, new Date(agora.getTime() - 3 * HORA_MS)),
      await criarSessao(api, segundo.id, new Date(agora.getTime() - HORA_MS)),
      await criarSessao(api, segundo.id, new Date(agora.getTime() - 1000)),
    ];
    const aberta = await criarSessao(api, primeiro.id, new Date(agora.getTime() + HORA_MS));
    const fechadaAntes = new Date(agora.getTime() - 5 * HORA_MS);
    const jaFechada = await criarSessao(
      api,
      segundo.id,
      new Date(agora.getTime() - 4 * HORA_MS),
      fechadaAntes,
    );
    const real = criarSessoesMesaVencidas(worker);
    const lotes: number[] = [];
    const contador: SessoesMesaVencidas = {
      async listar(momento, limite) {
        const lista = await real.listar(momento, limite);
        lotes.push(lista.length);
        return lista;
      },
      fechar: (restauranteId, ids, momento) => real.fechar(restauranteId, ids, momento),
    };
    const dependencias = { sessoesMesa: contador, relogio: { agora: () => agora } };

    const fechadas = await expirarSessoesMesa(dependencias, 2);
    const deNovo = await expirarSessoesMesa(dependencias, 2);

    const nossas = [...vencidas, aberta, jaFechada].map((sessao) => sessao.id);
    const linhas = await consultarComoAdmin<LinhaDaSessao>(
      'SELECT id, fechada_em FROM sessoes_mesa WHERE id = ANY($1::uuid[])',
      [nossas],
    );
    const porId = new Map(linhas.map((linha) => [linha.id, linha.fechada_em]));
    expect(vencidas.every((sessao) => porId.get(sessao.id)?.getTime() === agora.getTime())).toBe(true);
    expect(porId.get(aberta.id)).toBeNull();
    expect(porId.get(jaFechada.id)?.getTime()).toBe(fechadaAntes.getTime());
    expect(fechadas).toBeGreaterThanOrEqual(5);
    expect(lotes[0]).toBe(2);
    expect(lotes.length).toBeGreaterThanOrEqual(3);
    expect(deNovo).toBe(0);

    const eventos = await consultarComoAdmin<{ restaurante_id: string; carga: Record<string, unknown> }>(
      `SELECT restaurante_id, carga FROM caixa_saida
       WHERE tipo_evento = 'SessaoMesaExpirada' AND carga->>'sessaoMesaId' = ANY($1::text[])`,
      [nossas],
    );
    expect(eventos).toHaveLength(5);
    expect(eventos.map((evento) => evento.carga.sessaoMesaId).sort()).toEqual(
      vencidas.map((sessao) => sessao.id).sort(),
    );
    const primeiraVencida = eventos.find((evento) => evento.carga.sessaoMesaId === vencidas[0]?.id);
    expect(primeiraVencida).toEqual({
      restaurante_id: primeiro.id,
      carga: { versao: 1, sessaoMesaId: vencidas[0]?.id, mesaId: vencidas[0]?.mesaId },
    });
  });

  it('fechar só alcança o restaurante informado', async () => {
    const agora = new Date();
    const [dono, outro] = [await criarRestauranteDeTeste(api), await criarRestauranteDeTeste(api)];
    const doOutro = await criarSessao(api, outro.id, new Date(agora.getTime() - HORA_MS));

    const fechadas = await criarSessoesMesaVencidas(worker).fechar(dono.id, [doOutro.id], agora);

    expect(fechadas).toBe(0);
    const [linha] = await consultarComoAdmin<LinhaDaSessao>(
      'SELECT id, fechada_em FROM sessoes_mesa WHERE id = $1',
      [doOutro.id],
    );
    expect(linha?.fechada_em).toBeNull();
  });
});
