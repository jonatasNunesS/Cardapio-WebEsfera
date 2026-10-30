import { CABECALHO_CSRF, type ProblemaDaApi, type RespostaCsrf } from '../identidade/esquemas.ts';

export type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RespostaDaApi<T> =
  | { readonly ok: true; readonly status: number; readonly dados: T }
  | { readonly ok: false; readonly status: number; readonly problema: ProblemaDaApi };

export interface ClienteDaApi {
  pedir<T>(
    metodo: Metodo,
    rota: string,
    corpo?: unknown,
    extras?: Readonly<Record<string, string>>,
  ): Promise<RespostaDaApi<T>>;
}

type Buscar = (endereco: string, opcoes: RequestInit) => Promise<Response>;

const CODIGO_DE_CSRF_INVALIDO = 'HTTP_CSRF_INVALIDO';

async function lerCorpo(resposta: Response): Promise<unknown> {
  const texto = await resposta.text();
  return texto === '' ? undefined : (JSON.parse(texto) as unknown);
}

export function criarClienteDaApi(
  rotaDoCsrf: string,
  buscar: Buscar = (...argumentos) => fetch(...argumentos),
): ClienteDaApi {
  let token: Promise<string> | undefined;

  const obterToken = (renovar: boolean) => {
    if (renovar || token === undefined) {
      token = buscar(rotaDoCsrf, { credentials: 'same-origin' })
        .then((resposta) => resposta.json() as Promise<RespostaCsrf>)
        .then((corpo) => corpo.token);
    }
    return token;
  };

  async function enviar(
    metodo: Metodo,
    rota: string,
    corpo: unknown,
    renovar: boolean,
    extras: Readonly<Record<string, string>>,
  ): Promise<Response> {
    const escrita = metodo !== 'GET';
    const cabecalhos: Record<string, string> = {
      ...extras,
      ...(escrita ? { [CABECALHO_CSRF]: await obterToken(renovar) } : {}),
    };
    if (corpo !== undefined) {
      cabecalhos['content-type'] = 'application/json';
    }
    return buscar(rota, {
      method: metodo,
      credentials: 'same-origin',
      headers: cabecalhos,
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });
  }

  return {
    async pedir<T>(
      metodo: Metodo,
      rota: string,
      corpo?: unknown,
      extras: Readonly<Record<string, string>> = {},
    ): Promise<RespostaDaApi<T>> {
      let resposta = await enviar(metodo, rota, corpo, false, extras);
      let conteudo = await lerCorpo(resposta);
      if (
        resposta.status === 403 &&
        (conteudo as ProblemaDaApi | undefined)?.codigo === CODIGO_DE_CSRF_INVALIDO
      ) {
        resposta = await enviar(metodo, rota, corpo, true, extras);
        conteudo = await lerCorpo(resposta);
      }
      return resposta.ok
        ? { ok: true, status: resposta.status, dados: conteudo as T }
        : { ok: false, status: resposta.status, problema: conteudo as ProblemaDaApi };
    },
  };
}
