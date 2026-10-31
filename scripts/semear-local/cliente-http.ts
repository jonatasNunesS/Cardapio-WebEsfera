import { request } from 'node:http';

export interface RespostaHttp {
  readonly status: number;
  readonly corpo: unknown;
}

export class ClienteHttp {
  private readonly cookies = new Map<string, string>();
  private csrf = '';
  private readonly api: URL;
  private readonly host: string;

  constructor(urlDaApi: string, host: string) {
    this.api = new URL(urlDaApi);
    this.host = host;
  }

  pedir(metodo: string, caminho: string, corpo?: unknown): Promise<RespostaHttp> {
    const dados = corpo === undefined ? undefined : JSON.stringify(corpo);
    return new Promise((resolver, rejeitar) => {
      const pedido = request(
        {
          host: this.api.hostname,
          port: this.api.port,
          method: metodo,
          path: caminho,
          headers: {
            host: this.host,
            cookie: [...this.cookies].map(([nome, valor]) => `${nome}=${valor}`).join('; '),
            ...(this.csrf === '' ? {} : { 'x-csrf-token': this.csrf }),
            ...(dados === undefined ? {} : { 'content-type': 'application/json' }),
          },
        },
        (resposta) => {
          const partes: Buffer[] = [];
          resposta.on('data', (parte: Buffer) => partes.push(parte));
          resposta.on('end', () => {
            this.guardarCookies(resposta.headers['set-cookie'] ?? []);
            const texto = Buffer.concat(partes).toString();
            resolver({
              status: resposta.statusCode ?? 0,
              corpo: texto === '' ? undefined : (JSON.parse(texto) as unknown),
            });
          });
        },
      );
      pedido.on('error', rejeitar);
      pedido.end(dados);
    });
  }

  async exigir<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const resposta = await this.pedir(metodo, caminho, corpo);
    if (resposta.status >= 400) {
      throw new Error(`${metodo} ${caminho}: ${String(resposta.status)} ${JSON.stringify(resposta.corpo)}`);
    }
    return resposta.corpo as T;
  }

  async prepararCsrf(caminho: string): Promise<void> {
    this.csrf = (await this.exigir<{ token: string }>('GET', caminho)).token;
  }

  private guardarCookies(cabecalhos: readonly string[]): void {
    for (const cookie of cabecalhos) {
      const [par = ''] = cookie.split(';');
      const [nome = '', valor = ''] = par.split('=');
      this.cookies.set(nome, valor);
    }
  }
}
