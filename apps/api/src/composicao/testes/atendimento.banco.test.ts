import {
  rotaCom,
  ROTAS_DO_ATENDIMENTO as ROTAS,
  ROTAS_DO_PEDIDO as PEDIDO,
  type RespostaChamado,
  type RespostaConta,
} from '@cardapio/contratos';
import { consultarComUrl } from '@cardapio/infraestrutura/testes';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { comporApi } from '../index.ts';
import { abrirClienteNaMesa, ambienteDeTeste, enviarComChave, HOSTS } from './mesa-apoio.ts';
import { ipUnico, Navegador } from './navegador.ts';

function comoAdmin(texto: string, valores: unknown[]) {
  return consultarComUrl<Record<string, unknown>>(inject('bancoDeTeste').urlAdmin, texto, valores);
}

describe('chamados, conta e sessão pela API da mesa', () => {
  let servidor: FastifyInstance;

  beforeAll(async () => {
    servidor = comporApi(ambienteDeTeste());
    await servidor.ready();
  });

  afterAll(async () => {
    await servidor.close();
  });

  it('toque duplo em chamar garçom: 201 e depois 200 com o mesmo chamado; conta convive', async () => {
    const { cliente } = await abrirClienteNaMesa(servidor, 'Chamado API');
    const primeiro = await enviarComChave(servidor, cliente, ROTAS.garcom);
    const segundo = await enviarComChave(servidor, cliente, ROTAS.garcom);
    const conta = await enviarComChave(servidor, cliente, ROTAS.conta);

    expect([primeiro.statusCode, segundo.statusCode, conta.statusCode]).toEqual([201, 200, 201]);
    expect(segundo.json()).toEqual(primeiro.json());
    expect(conta.json<RespostaChamado>().tipo).toBe('conta');
    const lido = await cliente.pedir(
      'GET',
      rotaCom(ROTAS.chamado, { id: primeiro.json<RespostaChamado>().id }),
    );
    expect(lido.json()).toMatchObject({ situacao: 'aguardando', tipo: 'garcom' });
  });

  it('sem Idempotency-Key recusa; cancelar enquanto aguardando dá 204 e depois 409', async () => {
    const { cliente } = await abrirClienteNaMesa(servidor, 'Chamado cancela');
    const semChave = await enviarComChave(servidor, cliente, ROTAS.garcom, undefined, null);
    const chamado = (await enviarComChave(servidor, cliente, ROTAS.garcom)).json<RespostaChamado>();
    const rota = rotaCom(ROTAS.cancelamento, { id: chamado.id });

    expect(semChave.statusCode).toBe(400);
    expect((await cliente.pedir('POST', rota)).statusCode).toBe(204);
    expect((await cliente.pedir('POST', rota)).statusCode).toBe(409);
  });

  it('inadimplente e fechado continuam chamando garçom e pedindo conta', async () => {
    const { cliente, slug } = await abrirClienteNaMesa(servidor, 'Chamado suspenso');
    const [restaurante] = await comoAdmin('SELECT id FROM restaurantes WHERE slug = $1', [slug]);
    await comoAdmin("UPDATE restaurantes SET situacao = 'inadimplente' WHERE id = $1", [restaurante?.id]);
    const outroDia = (new Date().getUTCDay() + 3) % 7;
    await comoAdmin(
      "INSERT INTO horarios (restaurante_id, dia_semana, abre, fecha) VALUES ($1, $2, '18:00', '19:00')",
      [restaurante?.id, outroDia],
    );

    expect((await enviarComChave(servidor, cliente, ROTAS.garcom)).statusCode).toBe(201);
    expect((await enviarComChave(servidor, cliente, ROTAS.conta)).statusCode).toBe(201);
  });

  it('a conta vem calculada no servidor, com e sem taxa e a tabela de 1 a 20 pessoas', async () => {
    const { cliente, itens } = await abrirClienteNaMesa(servidor, 'Conta API');
    await enviarComChave(servidor, cliente, PEDIDO.pedidos, { itens });
    const conta = (await cliente.pedir('GET', ROTAS.resumo)).json<RespostaConta>();

    expect(conta).toMatchObject({
      subtotalCentavos: 19000,
      taxaCentavos: 1900,
      totalComTaxaCentavos: 20900,
      totalSemTaxaCentavos: 19000,
    });
    expect(conta.porPessoa.comTaxa).toHaveLength(20);
    expect(conta.porPessoa.comTaxa[2]).toBe(6967);
    expect(conta.itens.map((item) => item.nome)).toEqual(['Picanha', 'Suco']);
  });

  it('a sessão diz só o estado do próprio cookie: aberta, encerrada, expirada', async () => {
    const { cliente } = await abrirClienteNaMesa(servidor, 'Sessão API');
    const estranho = new Navegador(servidor, HOSTS.cardapio, ipUnico());
    const aberta = await cliente.pedir('GET', ROTAS.sessao);
    await comoAdmin(
      "UPDATE sessoes_mesa SET fechada_em = now(), motivo_fechamento = 'encerrada' WHERE fechada_em IS NULL AND mesa_id IN (SELECT id FROM mesas WHERE restaurante_id IN (SELECT id FROM restaurantes WHERE nome = 'Sessão API'))",
      [],
    );
    const encerrada = await cliente.pedir('GET', ROTAS.sessao);
    const semCookie = await estranho.pedir('GET', ROTAS.sessao);

    expect(aberta.json()).toEqual({ situacao: 'aberta' });
    expect(encerrada.json()).toEqual({ situacao: 'encerrada' });
    expect(semCookie.json()).toEqual({ situacao: 'expirada' });
    expect((await enviarComChave(servidor, cliente, ROTAS.garcom)).statusCode).toBe(401);
  });

  it('o chamado de A não aparece para B', async () => {
    const a = await abrirClienteNaMesa(servidor, 'Chamado A');
    const b = await abrirClienteNaMesa(servidor, 'Chamado B');
    const chamado = (await enviarComChave(servidor, a.cliente, ROTAS.garcom)).json<RespostaChamado>();

    expect((await b.cliente.pedir('GET', rotaCom(ROTAS.chamado, { id: chamado.id }))).statusCode).toBe(404);
    expect((await b.cliente.pedir('POST', rotaCom(ROTAS.cancelamento, { id: chamado.id }))).statusCode).toBe(
      404,
    );
  });
});
