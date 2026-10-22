import { Writable } from 'node:stream';
import {
  codigoTotpDeTeste,
  dependenciasDeAdmin,
  HorariosEmMemoria,
  PersonalizacoesEmMemoria,
  RestaurantesEmMemoria,
} from '@cardapio/aplicacao/testes';
import { CABECALHO_CSRF, ROTAS_DO_ADMIN, ROTAS_DO_PAINEL } from '@cardapio/contratos';
import { criarLogger, relatorDeErrosSentry } from '@cardapio/observabilidade/node';
import type { FastifyInstance, HTTPMethods } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { construirServidor } from '../servidor.ts';

const HOSTS = { painel: 'painel.localhost', admin: 'admin.localhost' };
const SENHA = 'cavalo-bateria-grampo';
const linhasDoLog: string[] = [];

function montar() {
  const dependencias = {
    ...dependenciasDeAdmin(),
    restaurantes: new RestaurantesEmMemoria(),
    personalizacoes: new PersonalizacoesEmMemoria(),
    horarios: new HorariosEmMemoria(),
  };
  const servidor = construirServidor({
    logger: criarLogger({
      app: 'api',
      destino: new Writable({
        write(pedaco: Buffer, _codificacao, concluir) {
          linhasDoLog.push(pedaco.toString());
          concluir();
        },
      }),
    }),
    ambiente: 'local',
    relatorDeErros: relatorDeErrosSentry,
    verificarProntidao: () => Promise.resolve(),
    identidade: { dependencias, hosts: HOSTS },
  });
  return { servidor, dependencias };
}

class Navegador {
  readonly cookies = new Map<string, string>();
  csrf = '';
  private readonly servidor: FastifyInstance;
  private readonly host: string;
  private readonly ip: string;

  constructor(servidor: FastifyInstance, host: string, ip = '203.0.113.10') {
    this.servidor = servidor;
    this.host = host;
    this.ip = ip;
  }

  async pedir(metodo: HTTPMethods, url: string, corpo?: object, extras: Record<string, string> = {}) {
    const resposta = await this.servidor.inject({
      method: metodo,
      url,
      remoteAddress: this.ip,
      headers: {
        host: this.host,
        cookie: [...this.cookies].map(([nome, valor]) => `${nome}=${valor}`).join('; '),
        ...(this.csrf === '' ? {} : { [CABECALHO_CSRF]: this.csrf }),
        ...extras,
      },
      ...(corpo === undefined ? {} : { payload: corpo }),
    });
    for (const cookie of resposta.cookies) {
      if (cookie.value === '') {
        this.cookies.delete(cookie.name);
      } else {
        this.cookies.set(cookie.name, cookie.value);
      }
    }
    return resposta;
  }

  async prepararCsrf(rota: string) {
    this.csrf = (await this.pedir('GET', rota)).json<{ token: string }>().token;
  }
}

async function donoNoPainel(servidor: FastifyInstance, email = 'ana@brasa.com.br') {
  const navegador = new Navegador(servidor, HOSTS.painel);
  await navegador.prepararCsrf(ROTAS_DO_PAINEL.csrf);
  const criada = await navegador.pedir('POST', ROTAS_DO_PAINEL.contas, { nome: 'Ana', email, senha: SENHA });
  return { navegador, criada };
}

const PERSONALIZACAO = {
  corMarca: '#E0B000',
  logoUrl: null,
  capaUrl: null,
  frase: 'Fogo e fermentação natural',
  linkAvaliacaoGoogle: 'https://g.page/r/brasa/review',
  textos: { boasVindas: 'Olá', aoChamarGarcom: 'Já vamos', restauranteFechado: 'Fechado' },
};

beforeEach(() => {
  linhasDoLog.length = 0;
});

describe('cookies e CSRF', () => {
  it('sessão e CSRF em cookies __Host-: HttpOnly, Secure, SameSite=Lax, Path=/ e sem Domain', async () => {
    const { servidor } = montar();
    const { criada } = await donoNoPainel(servidor);

    expect(criada.statusCode).toBe(201);
    const cabecalhos = [criada.headers['set-cookie']].flat().join('\n');
    expect(cabecalhos).toMatch(/__Host-sessao_painel=[^;]+;/);
    for (const linha of cabecalhos.split('\n')) {
      expect(linha).toMatch(/Path=\//);
      expect(linha).toMatch(/HttpOnly/);
      expect(linha).toMatch(/Secure/);
      expect(linha).toMatch(/SameSite=Lax/);
      expect(linha).not.toMatch(/Domain=/i);
    }
  });

  it.each([
    ['sem o cabeçalho', { csrf: '' }],
    ['com cabeçalho falso', { csrf: 'falso' }],
  ])('rota de escrita %s é recusada', async (_caso, ajuste) => {
    const { servidor, dependencias } = montar();
    const navegador = new Navegador(servidor, HOSTS.painel);
    await navegador.prepararCsrf(ROTAS_DO_PAINEL.csrf);
    navegador.csrf = ajuste.csrf;

    const resposta = await navegador.pedir('POST', ROTAS_DO_PAINEL.contas, {
      nome: 'Ana',
      email: 'ana@brasa.com.br',
      senha: SENHA,
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ codigo: 'HTTP_CSRF_INVALIDO' });
    expect(dependencias.contas.usuarios).toEqual([]);
  });

  it('o token de CSRF não vale sem o cookie que o acompanha', async () => {
    const { servidor } = montar();
    const navegador = new Navegador(servidor, HOSTS.painel);
    await navegador.prepararCsrf(ROTAS_DO_PAINEL.csrf);
    navegador.cookies.clear();

    const resposta = await navegador.pedir('POST', ROTAS_DO_PAINEL.sessao, { email: 'a@b.co', senha: SENHA });
    expect(resposta.statusCode).toBe(403);
  });
});

describe('painel: conta, restaurante e personalização', () => {
  it('cria a conta, o restaurante e publica a cor sugerida depois da reprovada', async () => {
    const { servidor } = montar();
    const { navegador } = await donoNoPainel(servidor);

    expect((await navegador.pedir('GET', ROTAS_DO_PAINEL.sessao)).json()).toEqual({ restaurante: null });
    const criado = await navegador.pedir('POST', ROTAS_DO_PAINEL.restaurante, { nome: 'Brasa & Trigo' });
    expect(criado.statusCode).toBe(201);
    expect(criado.json()).toEqual({ slug: 'brasa-e-trigo' });
    expect((await navegador.pedir('GET', ROTAS_DO_PAINEL.sessao)).json()).toMatchObject({
      restaurante: { nome: 'Brasa & Trigo', slug: 'brasa-e-trigo', situacao: 'teste', papel: 'dono' },
    });

    const reprovada = await navegador.pedir('PUT', ROTAS_DO_PAINEL.personalizacao, PERSONALIZACAO);
    expect(reprovada.statusCode).toBe(422);
    const sugestao = reprovada.json<{ detalhes: { sugestao: string } }>().detalhes.sugestao;
    expect(reprovada.json()).toMatchObject({
      codigo: 'PERSONALIZACAO_PUBLICAR_COR_SEM_CONTRASTE',
      detalhes: { sugestao: '#A88400' },
    });

    const publicada = await navegador.pedir('PUT', ROTAS_DO_PAINEL.personalizacao, {
      ...PERSONALIZACAO,
      corMarca: sugestao,
    });
    expect(publicada.statusCode).toBe(200);
    expect(publicada.json()).toMatchObject({ corMarca: '#A88400', corSobreMarca: '#1F1A17', versao: 1 });
    expect((await navegador.pedir('GET', ROTAS_DO_PAINEL.personalizacao)).json()).toMatchObject({
      corMarca: '#A88400',
    });
  });

  it('link de avaliação fora do Google é recusado', async () => {
    const { servidor } = montar();
    const { navegador } = await donoNoPainel(servidor);
    await navegador.pedir('POST', ROTAS_DO_PAINEL.restaurante, { nome: 'Brasa' });

    const resposta = await navegador.pedir('PUT', ROTAS_DO_PAINEL.personalizacao, {
      ...PERSONALIZACAO,
      corMarca: '#B4441F',
      linkAvaliacaoGoogle: 'https://avaliacoes.com/google',
    });
    expect(resposta.json()).toMatchObject({ codigo: 'PERSONALIZACAO_PUBLICAR_LINK_INVALIDO' });
  });

  it('o restaurante nunca vem do corpo: campo a mais é recusado', async () => {
    const { servidor } = montar();
    const { navegador } = await donoNoPainel(servidor);
    await navegador.pedir('POST', ROTAS_DO_PAINEL.restaurante, { nome: 'Brasa' });

    const resposta = await navegador.pedir('PUT', ROTAS_DO_PAINEL.personalizacao, {
      ...PERSONALIZACAO,
      corMarca: '#B4441F',
      restauranteId: 'outro',
    });
    expect(resposta.statusCode).toBe(400);
  });

  it('sem restaurante na sessão, personalização responde 403', async () => {
    const { servidor } = montar();
    const { navegador } = await donoNoPainel(servidor);
    const resposta = await navegador.pedir('GET', ROTAS_DO_PAINEL.personalizacao);
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ codigo: 'RESTAURANTE_ACESSO_SEM_VINCULO' });
  });

  it('define os horários pela API', async () => {
    const { servidor, dependencias } = montar();
    const { navegador } = await donoNoPainel(servidor);
    await navegador.pedir('POST', ROTAS_DO_PAINEL.restaurante, { nome: 'Brasa' });

    const resposta = await navegador.pedir('PUT', ROTAS_DO_PAINEL.horarios, {
      horarios: [{ diaSemana: 5, abre: '18:00', fecha: '02:00' }],
    });
    expect(resposta.statusCode).toBe(200);
    expect(dependencias.horarios.porRestaurante.get('restaurante-1')).toHaveLength(1);
  });

  it('sem sessão, rota protegida responde 401', async () => {
    const { servidor } = montar();
    const resposta = await new Navegador(servidor, HOSTS.painel).pedir('GET', ROTAS_DO_PAINEL.sessao);
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toMatchObject({ codigo: 'SESSAO_VALIDAR_INVALIDA' });
  });
});

describe('painel: entrar e sair', () => {
  it('e-mail inexistente e senha errada têm a mesma resposta', async () => {
    const { servidor } = montar();
    await donoNoPainel(servidor);
    const visitante = new Navegador(servidor, HOSTS.painel, '203.0.113.20');
    await visitante.prepararCsrf(ROTAS_DO_PAINEL.csrf);

    const semConta = await visitante.pedir('POST', ROTAS_DO_PAINEL.sessao, {
      email: 'nao@existe.com',
      senha: SENHA,
    });
    const senhaErrada = await visitante.pedir('POST', ROTAS_DO_PAINEL.sessao, {
      email: 'ana@brasa.com.br',
      senha: 'outra-senha-1',
    });
    const semId = (corpo: Record<string, unknown>) => ({ ...corpo, id_rastreio: undefined });

    expect(semConta.statusCode).toBe(401);
    expect(senhaErrada.statusCode).toBe(401);
    expect(semId(semConta.json())).toEqual(semId(senhaErrada.json()));
    expect(semConta.cookies.some((cookie) => cookie.name.startsWith('__Host-sessao'))).toBe(false);
  });

  it('bloqueio progressivo responde 429 com Retry-After', async () => {
    const { servidor } = montar();
    await donoNoPainel(servidor);
    const atacante = new Navegador(servidor, HOSTS.painel, '203.0.113.30');
    await atacante.prepararCsrf(ROTAS_DO_PAINEL.csrf);
    for (let tentativa = 0; tentativa < 5; tentativa += 1) {
      await atacante.pedir('POST', ROTAS_DO_PAINEL.sessao, {
        email: 'ana@brasa.com.br',
        senha: 'errada-errada',
      });
    }

    const resposta = await atacante.pedir('POST', ROTAS_DO_PAINEL.sessao, {
      email: 'ana@brasa.com.br',
      senha: SENHA,
    });
    expect(resposta.statusCode).toBe(429);
    expect(resposta.json()).toMatchObject({ codigo: 'SESSAO_ENTRAR_BLOQUEADA' });
    expect(Number(resposta.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('limite de taxa por IP na rota de entrar', async () => {
    const { servidor } = montar();
    const robo = new Navegador(servidor, HOSTS.painel, '203.0.113.40');
    await robo.prepararCsrf(ROTAS_DO_PAINEL.csrf);
    const respostas = [];
    for (let tentativa = 0; tentativa < 21; tentativa += 1) {
      respostas.push(
        await robo.pedir('POST', ROTAS_DO_PAINEL.sessao, {
          email: `x${String(tentativa)}@y.com`,
          senha: SENHA,
        }),
      );
    }

    const ultima = respostas.at(-1);
    expect(ultima?.statusCode).toBe(429);
    expect(ultima?.json()).toMatchObject({ codigo: 'HTTP_LIMITE_EXCEDIDO' });
    expect(ultima?.headers['retry-after']).toBeDefined();
  });

  it('entrar abre sessão nova; sair revoga e apaga o cookie', async () => {
    const { servidor } = montar();
    await donoNoPainel(servidor);
    const navegador = new Navegador(servidor, HOSTS.painel);
    await navegador.prepararCsrf(ROTAS_DO_PAINEL.csrf);

    expect(
      (await navegador.pedir('POST', ROTAS_DO_PAINEL.sessao, { email: 'ANA@brasa.com.br', senha: SENHA }))
        .statusCode,
    ).toBe(204);
    const token = navegador.cookies.get('__Host-sessao_painel') ?? '';
    expect((await navegador.pedir('GET', ROTAS_DO_PAINEL.sessao)).statusCode).toBe(200);

    expect((await navegador.pedir('DELETE', ROTAS_DO_PAINEL.sessao)).statusCode).toBe(204);
    expect(navegador.cookies.has('__Host-sessao_painel')).toBe(false);
    navegador.cookies.set('__Host-sessao_painel', token);
    expect((await navegador.pedir('GET', ROTAS_DO_PAINEL.sessao)).statusCode).toBe(401);
  });

  it('redefinição: o pedido responde igual para e-mail existente ou não, e a confirmação derruba as sessões', async () => {
    const { servidor, dependencias } = montar();
    const { navegador } = await donoNoPainel(servidor);
    const outro = new Navegador(servidor, HOSTS.painel, '203.0.113.50');
    await outro.prepararCsrf(ROTAS_DO_PAINEL.csrf);

    const existe = await outro.pedir('POST', ROTAS_DO_PAINEL.pedidoDeRedefinicao, {
      email: 'ana@brasa.com.br',
    });
    const naoExiste = await outro.pedir('POST', ROTAS_DO_PAINEL.pedidoDeRedefinicao, {
      email: 'nao@existe.com',
    });
    expect([existe.statusCode, existe.body]).toEqual([naoExiste.statusCode, naoExiste.body]);

    const link = dependencias.email.enviados[0]?.texto ?? '';
    const token = /redefinir-senha#(\S+)/.exec(link)?.[1] ?? '';
    const confirmada = await outro.pedir('POST', ROTAS_DO_PAINEL.confirmacaoDeRedefinicao, {
      token,
      senha: 'senha-nova-forte',
    });
    expect(confirmada.statusCode).toBe(204);
    expect((await navegador.pedir('GET', ROTAS_DO_PAINEL.sessao)).statusCode).toBe(401);
  });
});

async function adminComSegundoFator(
  servidor: FastifyInstance,
  dependencias: ReturnType<typeof montar>['dependencias'],
) {
  dependencias.admins.cadastrar({
    email: 'ops@webesfera.com.br',
    hashSenha: `$argon2id$teste$${SENHA}`,
    codigos: [{ hash: 'resumo(ABCD0001)', usado: false }],
  });
  const navegador = new Navegador(servidor, HOSTS.admin);
  await navegador.prepararCsrf(ROTAS_DO_ADMIN.csrf);
  const entrada = await navegador.pedir('POST', ROTAS_DO_ADMIN.sessao, {
    email: 'ops@webesfera.com.br',
    senha: SENHA,
  });
  return { navegador, entrada };
}

describe('admin', () => {
  it('rotas do admin não existem no host do painel, e as do painel não existem no host do admin', async () => {
    const { servidor } = montar();
    const noPainel = await new Navegador(servidor, HOSTS.painel).pedir('GET', ROTAS_DO_ADMIN.csrf);
    const noAdmin = await new Navegador(servidor, HOSTS.admin).pedir('GET', ROTAS_DO_PAINEL.csrf);
    expect([noPainel.statusCode, noAdmin.statusCode]).toEqual([404, 404]);
  });

  it('senha certa sem segundo fator não entra; com o código TOTP, entra', async () => {
    const { servidor, dependencias } = montar();
    const { navegador, entrada } = await adminComSegundoFator(servidor, dependencias);

    expect(entrada.json()).toEqual({ proximoPasso: 'segundo_fator' });
    const parcial = navegador.cookies.get('__Host-sessao_admin') ?? '';
    expect((await navegador.pedir('GET', ROTAS_DO_ADMIN.sessao)).statusCode).toBe(401);
    navegador.cookies.set('__Host-sessao_admin', parcial);
    const codigo = codigoTotpDeTeste('SEGREDO', dependencias.relogio.agora());
    const confirmada = await navegador.pedir('POST', ROTAS_DO_ADMIN.segundoFator, {
      codigoDeVerificacao: codigo,
    });
    expect(confirmada.statusCode).toBe(204);
    expect(navegador.cookies.get('__Host-sessao_admin')).not.toBe(parcial);
    expect((await navegador.pedir('GET', ROTAS_DO_ADMIN.sessao)).statusCode).toBe(204);

    const repetido = new Navegador(servidor, HOSTS.admin);
    await repetido.prepararCsrf(ROTAS_DO_ADMIN.csrf);
    await repetido.pedir('POST', ROTAS_DO_ADMIN.sessao, { email: 'ops@webesfera.com.br', senha: SENHA });
    const reuso = await repetido.pedir('POST', ROTAS_DO_ADMIN.segundoFator, { codigoDeVerificacao: codigo });
    expect(reuso.statusCode).toBe(401);
    expect(reuso.json()).toMatchObject({ codigo: 'ADMIN_ENTRAR_CODIGO_INVALIDO' });
  });

  it('sessão do admin não vale no painel, e a do painel não vale no admin', async () => {
    const { servidor, dependencias } = montar();
    const { navegador: admin } = await adminComSegundoFator(servidor, dependencias);
    await admin.pedir('POST', ROTAS_DO_ADMIN.segundoFator, {
      codigoDeVerificacao: codigoTotpDeTeste('SEGREDO', dependencias.relogio.agora()),
    });
    const { navegador: painel } = await donoNoPainel(servidor);

    const adminNoPainel = new Navegador(servidor, HOSTS.painel);
    adminNoPainel.cookies.set('__Host-sessao_painel', admin.cookies.get('__Host-sessao_admin') ?? '');
    const painelNoAdmin = new Navegador(servidor, HOSTS.admin);
    painelNoAdmin.cookies.set('__Host-sessao_admin', painel.cookies.get('__Host-sessao_painel') ?? '');

    expect((await adminNoPainel.pedir('GET', ROTAS_DO_PAINEL.sessao)).statusCode).toBe(401);
    expect((await painelNoAdmin.pedir('GET', ROTAS_DO_ADMIN.sessao)).statusCode).toBe(401);
  });

  it('primeiro acesso: troca a senha, cadastra o TOTP e recebe os códigos de recuperação', async () => {
    const { servidor, dependencias } = montar();
    dependencias.admins.cadastrar({
      email: 'novo@webesfera.com.br',
      hashSenha: '$argon2id$teste$temporaria-123',
      trocaDeSenhaObrigatoria: true,
      segredoCifrado: null,
    });
    const navegador = new Navegador(servidor, HOSTS.admin);
    await navegador.prepararCsrf(ROTAS_DO_ADMIN.csrf);
    const entrada = await navegador.pedir('POST', ROTAS_DO_ADMIN.sessao, {
      email: 'novo@webesfera.com.br',
      senha: 'temporaria-123',
    });
    expect(entrada.json()).toEqual({ proximoPasso: 'cadastro' });

    const iniciado = await navegador.pedir('POST', ROTAS_DO_ADMIN.cadastroDoSegundoFator);
    expect(iniciado.json()).toEqual({
      segredo: 'SEGREDONOVO',
      uriOtpauth: 'otpauth://totp/WebEsfera Admin?secret=SEGREDONOVO',
    });
    const concluido = await navegador.pedir('POST', ROTAS_DO_ADMIN.confirmacaoDoCadastro, {
      codigoDeVerificacao: codigoTotpDeTeste('SEGREDONOVO', dependencias.relogio.agora()),
      senhaNova: 'senha-nova-do-admin',
    });
    expect(concluido.statusCode).toBe(200);
    expect(concluido.json<{ codigosDeRecuperacao: string[] }>().codigosDeRecuperacao).toHaveLength(10);
    expect((await navegador.pedir('GET', ROTAS_DO_ADMIN.sessao)).statusCode).toBe(204);
  });
});

describe('logs', () => {
  it('nada de e-mail, senha, token, código TOTP ou segredo no log de um fluxo completo', async () => {
    const { servidor, dependencias } = montar();
    const { navegador } = await donoNoPainel(servidor, 'segredo.da.ana@brasa.com.br');
    await navegador.pedir('POST', ROTAS_DO_PAINEL.restaurante, { nome: 'Brasa' });
    const { navegador: admin } = await adminComSegundoFator(servidor, dependencias);
    const codigo = codigoTotpDeTeste('SEGREDO', dependencias.relogio.agora());
    await admin.pedir('POST', ROTAS_DO_ADMIN.segundoFator, { codigoDeVerificacao: codigo });
    await admin.pedir('POST', ROTAS_DO_ADMIN.sessao, {
      email: 'ops@webesfera.com.br',
      senha: 'errada-errada',
    });

    const log = linhasDoLog.join('\n');
    expect(log.length).toBeGreaterThan(0);
    for (const proibido of [
      'segredo.da.ana',
      'ops@webesfera',
      SENHA,
      'errada-errada',
      codigo,
      navegador.cookies.get('__Host-sessao_painel') ?? 'sem-cookie',
      navegador.csrf,
    ]) {
      expect(log).not.toContain(proibido);
    }
  });
});
