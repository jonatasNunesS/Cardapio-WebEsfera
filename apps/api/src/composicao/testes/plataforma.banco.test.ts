import { createHash, randomBytes } from 'node:crypto';
import {
  ROTAS_DO_ADMIN,
  ROTAS_DO_CARDAPIO_PUBLICO,
  ROTAS_DO_CONVITE,
  ROTAS_DO_PAINEL,
  ROTAS_DO_PEDIDO,
  ROTAS_DA_PLATAFORMA as ROTAS,
  rotaCom,
  type RespostaConviteGerado,
  type RespostaRestaurantesDaPlataforma,
  type RespostaVisaoGeral,
} from '@cardapio/contratos';
import { consultarComUrl } from '@cardapio/infraestrutura/testes';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { COOKIES } from '../../http/cookies.ts';
import { comporApi } from '../index.ts';
import { abrirClienteNaMesa, ambienteDeTeste, enviarComChave, uuidv7 } from './mesa-apoio.ts';
import { ipUnico, Navegador } from './navegador.ts';

const HOST_DO_ADMIN = 'admin.localhost';
const HOST_DO_PAINEL = 'painel.localhost';
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$ZmFicmljYQ$ZmFicmljYQ';
let servidor: FastifyInstance;

const comoAdmin = <T extends Record<string, unknown>>(texto: string, valores: unknown[]) =>
  consultarComUrl<T>(inject('bancoDeTeste').urlAdmin, texto, valores);

async function adminLogado(): Promise<Navegador> {
  const [admin] = await comoAdmin<{ id: string }>(
    `INSERT INTO administradores (nome, email, hash_senha, papel, segredo_totp_cifrado, troca_de_senha_obrigatoria)
     VALUES ('Ops', $1, $2, 'suporte', 'cifrado', false) RETURNING id`,
    [`ops-${uuidv7()}@webesfera.com.br`, HASH],
  );
  const token = randomBytes(32).toString('base64url');
  await comoAdmin(
    `INSERT INTO sessoes (hash_id, publico, administrador_id, nivel, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, 'admin', $2, 'completa', now(), now(), now() + interval '1 hour')`,
    [createHash('sha256').update(token).digest('hex'), admin?.id],
  );
  const navegador = new Navegador(servidor, HOST_DO_ADMIN, ipUnico());
  navegador.cookies.set(COOKIES.admin, token);
  navegador.csrf = (await navegador.pedir('GET', ROTAS_DO_ADMIN.csrf)).json<{ token: string }>().token;
  return navegador;
}

beforeAll(async () => {
  servidor = comporApi(ambienteDeTeste());
  await servidor.ready();
});

afterAll(async () => {
  await servidor.close();
});

async function criarPeloAdmin(admin: Navegador) {
  const sufixo = uuidv7().slice(-8);
  const resposta = await admin.pedir('POST', ROTAS.restaurantes, {
    nome: `Brasa ${sufixo}`,
    slug: `brasa-${sufixo}`,
    emailDoDono: `dono-${sufixo}@brasa.com.br`,
  });
  return { resposta, criado: resposta.json<RespostaConviteGerado>(), email: `dono-${sufixo}@brasa.com.br` };
}

describe('admin mínimo pela API', () => {
  it('sem sessão de admin: 401; com a sessão do dono do painel: 401; no host do painel: 404', async () => {
    const semSessao = await new Navegador(servidor, HOST_DO_ADMIN, ipUnico()).pedir(
      'GET',
      ROTAS.restaurantes,
    );
    const { dono } = await abrirClienteNaMesa(servidor, 'Dono curioso');
    const doDonoNoAdmin = new Navegador(servidor, HOST_DO_ADMIN, ipUnico());
    for (const [nome, valor] of dono.navegador.cookies) {
      doDonoNoAdmin.cookies.set(nome, valor);
    }
    const comCookieDoPainel = await doDonoNoAdmin.pedir('GET', ROTAS.restaurantes);
    const noPainel = await dono.navegador.pedir('GET', ROTAS.restaurantes);

    expect([semSessao.statusCode, comCookieDoPainel.statusCode, noPainel.statusCode]).toEqual([
      401, 401, 404,
    ]);
  });

  it('cria com convite mostrado uma vez; o dono define a senha pelo convite e entra no painel', async () => {
    const admin = await adminLogado();
    const { resposta, criado, email } = await criarPeloAdmin(admin);
    expect(resposta.statusCode).toBe(201);
    const token = criado.linkDoConvite?.split('#token=')[1] ?? '';
    expect(token).not.toBe('');

    const lista = (await admin.pedir('GET', ROTAS.restaurantes)).json<RespostaRestaurantesDaPlataforma>();
    expect(lista.restaurantes.find((item) => item.slug === criado.slug)).toMatchObject({
      situacao: 'teste',
      diasDeTeste: 10,
    });
    expect(JSON.stringify(lista)).not.toContain(token);

    const convidado = new Navegador(servidor, HOST_DO_PAINEL, ipUnico());
    await convidado.prepararCsrf();
    const aceito = await convidado.pedir('POST', ROTAS_DO_CONVITE.aceitacao, {
      token: decodeURIComponent(token),
      senha: 'cavalo-bateria-grampo-azul',
    });
    expect(aceito.statusCode).toBe(204);
    const repetido = await convidado.pedir('POST', ROTAS_DO_CONVITE.aceitacao, {
      token: decodeURIComponent(token),
      senha: 'cavalo-bateria-grampo-azul',
    });
    expect(repetido.statusCode).toBe(422);
    const entrada = await convidado.pedir('POST', ROTAS_DO_PAINEL.sessao, {
      email,
      senha: 'cavalo-bateria-grampo-azul',
    });
    expect(entrada.statusCode).toBeLessThan(300);
  });

  it('dono pendente: hash Argon2 com os parâmetros reais e login igual ao de senha errada', async () => {
    const admin = await adminLogado();
    const { email } = await criarPeloAdmin(admin);
    const { dono } = await abrirClienteNaMesa(servidor, 'Dono com senha');
    const [pendente, real] = await comoAdmin<{ hash_senha: string }>(
      `SELECT hash_senha FROM usuarios WHERE email = $1
       UNION ALL SELECT u.hash_senha FROM usuarios u JOIN vinculos v ON v.usuario_id = u.id
        JOIN restaurantes r ON r.id = v.restaurante_id WHERE r.slug = $2`,
      [email, dono.slug],
    );
    const parametros = (hash: string | undefined) => hash?.split('$').slice(0, 4).join('$');
    expect(parametros(pendente?.hash_senha)).toBe(parametros(real?.hash_senha));
    expect(parametros(pendente?.hash_senha)).toBe('$argon2id$v=19$m=19456,t=2,p=1');

    const tentar = async (alvo: string) => {
      const navegador = new Navegador(servidor, HOST_DO_PAINEL, ipUnico());
      await navegador.prepararCsrf();
      const resposta = await navegador.pedir('POST', ROTAS_DO_PAINEL.sessao, {
        email: alvo,
        senha: 'qualquer-senha-longa',
      });
      const corpo = resposta.json<Record<string, unknown>>();
      return { status: resposta.statusCode, codigo: corpo.codigo, detalhe: corpo.detail, title: corpo.title };
    };
    const comPendente = await tentar(email);
    const comSenhaErrada = await tentar(`dono-inexistente-${uuidv7()}@brasa.com.br`);
    expect(comPendente).toEqual(comSenhaErrada);
    expect(JSON.stringify(comPendente)).not.toMatch(/convite|pendente/i);
  });

  it('suspender e reativar exigem motivo; suspenso recusa pedido e o cardápio continua no ar', async () => {
    const admin = await adminLogado();
    const mesa = await abrirClienteNaMesa(servidor, 'Brasa suspensa');
    const semMotivo = await admin.pedir('POST', rotaCom(ROTAS.suspensao, { slug: mesa.slug }), {
      motivo: '',
    });
    expect(semMotivo.statusCode).toBe(422);
    expect(
      (
        await admin.pedir('POST', rotaCom(ROTAS.suspensao, { slug: mesa.slug }), {
          motivo: 'teste do piloto',
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await admin.pedir('POST', rotaCom(ROTAS.suspensao, { slug: mesa.slug }), {
          motivo: 'teste do piloto',
        })
      ).statusCode,
    ).toBe(409);

    const pedido = await enviarComChave(servidor, mesa.cliente, ROTAS_DO_PEDIDO.pedidos, {
      itens: mesa.itens,
    });
    expect(pedido.json()).toMatchObject({ codigo: 'PEDIDO_CRIAR_RESTAURANTE_SUSPENSO' });
    const cardapio = await mesa.cliente.pedir(
      'GET',
      rotaCom(ROTAS_DO_CARDAPIO_PUBLICO.cardapio, { slug: mesa.slug }),
    );
    expect(cardapio.statusCode).toBe(200);

    expect(
      (
        await admin.pedir('POST', rotaCom(ROTAS.reativacao, { slug: mesa.slug }), {
          motivo: 'pagamento feito',
        })
      ).statusCode,
    ).toBe(204);
    const depois = await enviarComChave(servidor, mesa.cliente, ROTAS_DO_PEDIDO.pedidos, {
      itens: mesa.itens,
    });
    expect(depois.statusCode).toBe(201);
    const registros = await comoAdmin<{ acao: string }>(
      "SELECT acao FROM auditoria WHERE restaurante_id = (SELECT id FROM restaurantes WHERE slug = $1) AND autor_tipo = 'administrador' ORDER BY id",
      [mesa.slug],
    );
    expect(registros.map((linha) => linha.acao)).toEqual(['restaurante.suspender', 'restaurante.reativar']);
  });

  it('financeiro em leitura e visão geral com indicadores', async () => {
    const admin = await adminLogado();
    const { criado } = await criarPeloAdmin(admin);
    const financeiro = await admin.pedir('GET', rotaCom(ROTAS.financeiro, { slug: criado.slug }));
    expect(financeiro.json()).toEqual({ situacaoDoRestaurante: 'teste', assinatura: null, cobrancas: [] });
    const visao = (await admin.pedir('GET', ROTAS.visaoGeral)).json<RespostaVisaoGeral>();
    expect(visao.porSituacao.teste).toBeGreaterThanOrEqual(1);
    expect(visao).toHaveProperty('linkDoSentry');
    expect((await admin.pedir('GET', rotaCom(ROTAS.financeiro, { slug: 'nao-existe' }))).statusCode).toBe(
      404,
    );
  });
});
