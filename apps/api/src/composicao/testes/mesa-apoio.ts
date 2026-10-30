import {
  gerarUuidV7,
  ROTAS_DAS_MESAS_NO_PAINEL as MESAS,
  ROTAS_DO_CARDAPIO_NO_PAINEL as CARDAPIO,
  type CategoriaNoPainel,
  type PratoNoPainel,
  type RespostaMesasDoPainel,
} from '@cardapio/contratos';
import {
  VARIAVEIS_DO_ARMAZENAMENTO_DE_TESTE,
  VARIAVEIS_DO_MERCADO_PAGO_DE_TESTE,
} from '@cardapio/infraestrutura/testes';
import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { inject } from 'vitest';
import { esquemaAmbienteApi } from '../../ambiente.ts';
import { donoComRestaurante, ipUnico, Navegador } from './navegador.ts';

export const HOSTS = { painel: 'painel.localhost', cardapio: 'cardapio.localhost' };

export const uuidv7 = () => gerarUuidV7(Date.now(), randomBytes(10));

export function ambienteDeTeste() {
  return esquemaAmbienteApi.parse({
    NODE_ENV: 'test',
    APP_ENV: 'local',
    PORTA_API: '3000',
    URL_BANCO_API: inject('bancoDeTeste').urlApi,
    URL_REDIS: inject('urlRedisDeTeste'),
    DOMINIO_CARDAPIO: HOSTS.cardapio,
    DOMINIO_PAINEL: HOSTS.painel,
    DOMINIO_ADMIN: 'admin.localhost',
    URL_PAINEL: 'http://painel.localhost:5173',
    CHAVE_CIFRA_TOTP: Buffer.alloc(32, 7).toString('base64'),
    CHAVE_SESSAO_MESA: 'mesa-teste-mesa-teste-mesa-teste-mesa',
    ...VARIAVEIS_DO_ARMAZENAMENTO_DE_TESTE,
    ...VARIAVEIS_DO_MERCADO_PAGO_DE_TESTE,
  });
}

export async function abrirClienteNaMesa(servidor: FastifyInstance, nome: string) {
  const dono = await donoComRestaurante(servidor, HOSTS.painel, nome);
  const categoria = (
    await dono.navegador.pedir('POST', CARDAPIO.categorias, { nome: 'Principais' })
  ).json<CategoriaNoPainel>();
  const novoPrato = async (nomeDoPrato: string, precoCentavos: number) =>
    (
      await dono.navegador.pedir('POST', CARDAPIO.pratos, {
        categoriaId: categoria.id,
        nome: nomeDoPrato,
        descricao: '',
        precoCentavos,
        disponivel: true,
        destaque: false,
      })
    ).json<PratoNoPainel>();
  const picanha = await novoPrato('Picanha', 8900);
  const suco = await novoPrato('Suco', 1200);
  await dono.navegador.pedir('POST', MESAS.mesas, { numero: 4, nome: null, area: null });
  const link = new URL(
    (await dono.navegador.pedir('GET', MESAS.mesas)).json<RespostaMesasDoPainel>().mesas[0]?.link ?? '',
  );
  const cliente = new Navegador(servidor, HOSTS.cardapio, ipUnico());
  await cliente.pedir(
    'GET',
    `${link.pathname.replace(/^\/([^/]+)\/mesa\//, '/api/v1/cardapios/$1/mesa/')}${link.search}`,
  );
  const itens = [
    { pratoId: picanha.id, quantidade: 2, observacao: 'ao ponto' },
    { pratoId: suco.id, quantidade: 1, observacao: '' },
  ];
  return { dono, cliente, picanha, suco, itens, slug: dono.slug };
}

export function enviarComChave(
  servidor: FastifyInstance,
  cliente: Navegador,
  url: string,
  corpo?: object,
  chave: string | null = uuidv7(),
) {
  return servidor.inject({
    method: 'POST',
    url,
    remoteAddress: cliente.ip,
    headers: {
      host: HOSTS.cardapio,
      cookie: [...cliente.cookies].map(([nome, valor]) => `${nome}=${valor}`).join('; '),
      ...(chave === null ? {} : { 'idempotency-key': chave }),
    },
    ...(corpo === undefined ? {} : { payload: corpo }),
  });
}
