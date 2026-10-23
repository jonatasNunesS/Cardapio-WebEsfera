import { randomInt } from 'node:crypto';
import { CABECALHO_CSRF, ROTAS_DO_PAINEL } from '@cardapio/contratos';
import type { FastifyInstance, HTTPMethods } from 'fastify';

export class Navegador {
  readonly cookies = new Map<string, string>();
  csrf = '';
  private readonly servidor: FastifyInstance;
  private readonly host: string;
  readonly ip: string;

  constructor(servidor: FastifyInstance, host: string, ip: string) {
    this.servidor = servidor;
    this.host = host;
    this.ip = ip;
  }

  async pedir(metodo: HTTPMethods, url: string, corpo?: object) {
    const resposta = await this.servidor.inject({
      method: metodo,
      url,
      remoteAddress: this.ip,
      headers: {
        host: this.host,
        cookie: [...this.cookies].map(([nome, valor]) => `${nome}=${valor}`).join('; '),
        ...(this.csrf === '' ? {} : { [CABECALHO_CSRF]: this.csrf }),
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

  async prepararCsrf() {
    this.csrf = (await this.pedir('GET', ROTAS_DO_PAINEL.csrf)).json<{ token: string }>().token;
  }
}

let contador = 0;

export function ipUnico(): string {
  contador += 1;
  return `10.${String(randomInt(1, 255))}.${String(randomInt(1, 255))}.${String(contador % 250)}`;
}

export async function donoComRestaurante(servidor: FastifyInstance, host: string, nome: string) {
  contador += 1;
  const navegador = new Navegador(servidor, host, ipUnico());
  await navegador.prepararCsrf();
  const email = `dono-${String(Date.now())}-${String(contador)}@exemplo.com.br`;
  await navegador.pedir('POST', ROTAS_DO_PAINEL.contas, {
    nome: 'Dono',
    email,
    senha: 'cavalo-bateria-grampo-azul',
  });
  const criado = await navegador.pedir('POST', ROTAS_DO_PAINEL.restaurante, { nome });
  return { navegador, slug: criado.json<{ slug: string }>().slug };
}
