import { request } from 'node:http';
import { PORTAS } from './playwright.config.ts';
import { zerarLimitesDeTaxa } from './preparar.ts';

interface Resposta {
  readonly status: number;
  readonly corpo: unknown;
}

export interface PratoSemeado {
  readonly nome: string;
  readonly precoCentavos: number;
  readonly disponivel?: boolean;
  readonly destaque?: boolean;
  readonly removido?: boolean;
  readonly descricao?: string;
}

export interface RestauranteSemeado {
  readonly slug: string;
  readonly link: string;
  readonly caminho: string;
  readonly codigo: string;
}

class ClienteDoPainel {
  private readonly cookies = new Map<string, string>();
  private csrf = '';

  pedir(metodo: string, caminho: string, corpo?: unknown): Promise<Resposta> {
    return new Promise((resolver, rejeitar) => {
      const dados = corpo === undefined ? undefined : JSON.stringify(corpo);
      const pedido = request(
        {
          host: '127.0.0.1',
          port: PORTAS.api,
          method: metodo,
          path: caminho,
          headers: {
            host: 'painel.localhost',
            cookie: [...this.cookies].map(([nome, valor]) => `${nome}=${valor}`).join('; '),
            ...(this.csrf === '' ? {} : { 'x-csrf-token': this.csrf }),
            ...(dados === undefined
              ? {}
              : { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(dados)) }),
          },
        },
        (resposta) => {
          const partes: Buffer[] = [];
          resposta.on('data', (parte: Buffer) => partes.push(parte));
          resposta.on('end', () => {
            for (const cookie of resposta.headers['set-cookie'] ?? []) {
              const [par = ''] = cookie.split(';');
              const [nome = '', valor = ''] = par.split('=');
              this.cookies.set(nome, valor);
            }
            const texto = Buffer.concat(partes).toString();
            resolver({
              status: resposta.statusCode ?? 0,
              corpo: texto === '' ? undefined : (JSON.parse(texto) as unknown),
            });
          });
        },
      );
      pedido.on('error', rejeitar);
      if (dados !== undefined) {
        pedido.write(dados);
      }
      pedido.end();
    });
  }

  async exigir(metodo: string, caminho: string, corpo?: unknown): Promise<unknown> {
    const resposta = await this.pedir(metodo, caminho, corpo);
    if (resposta.status >= 400) {
      throw new Error(`${metodo} ${caminho}: ${String(resposta.status)} ${JSON.stringify(resposta.corpo)}`);
    }
    return resposta.corpo;
  }

  async entrar(nome: string): Promise<string> {
    this.csrf = ((await this.exigir('GET', '/api/v1/csrf')) as { token: string }).token;
    const sufixo = `${process.env.SUFIXO_E2E ?? '0'}-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
    await this.exigir('POST', '/api/v1/contas', {
      nome: 'Dono',
      email: `cliente-${sufixo}@brasa.com.br`,
      senha: 'cavalo-bateria-grampo-azul',
    });
    return (
      (await this.exigir('POST', '/api/v1/restaurante', { nome: `${nome} ${sufixo}` })) as { slug: string }
    ).slug;
  }
}

export interface OpcoesDoRestaurante {
  readonly nome: string;
  readonly pratos: readonly PratoSemeado[];
  readonly fechado?: boolean;
  readonly corMarca?: string;
}

export async function semearRestaurante(
  opcoes: OpcoesDoRestaurante,
): Promise<RestauranteSemeado & { readonly painel: ClienteDoPainel }> {
  await zerarLimitesDeTaxa();
  const painel = new ClienteDoPainel();
  const slug = await painel.entrar(opcoes.nome);
  if (opcoes.corMarca !== undefined) {
    await painel.exigir('PUT', '/api/v1/restaurante/personalizacao', {
      corMarca: opcoes.corMarca,
      logoUrl: null,
      capaUrl: null,
      frase: 'Cozinha de fogo e pão de fermentação natural',
      linkAvaliacaoGoogle: null,
      textos: { boasVindas: 'Boa noite! Fique à vontade.', aoChamarGarcom: '', restauranteFechado: '' },
    });
  }
  if (opcoes.fechado === true) {
    const outroDia = (new Date().getUTCDay() + 3) % 7;
    await painel.exigir('PUT', '/api/v1/restaurante/horarios', {
      horarios: [{ diaSemana: outroDia, abre: '18:00', fecha: '23:00' }],
    });
  }
  const categoria = (await painel.exigir('POST', '/api/v1/cardapio/categorias', { nome: 'Principais' })) as {
    id: string;
  };
  for (const prato of opcoes.pratos) {
    const criado = (await painel.exigir('POST', '/api/v1/cardapio/pratos', {
      categoriaId: categoria.id,
      nome: prato.nome,
      descricao: prato.descricao ?? '',
      precoCentavos: prato.precoCentavos,
      disponivel: prato.disponivel ?? true,
      destaque: prato.destaque ?? false,
    })) as { id: string; versao: number };
    if (prato.removido === true) {
      await painel.exigir('DELETE', `/api/v1/cardapio/pratos/${criado.id}`, { versao: criado.versao });
    }
  }
  await painel.exigir('POST', '/api/v1/mesas', { numero: 12, nome: null, area: null });
  const { mesas } = (await painel.exigir('GET', '/api/v1/mesas')) as { mesas: { link: string }[] };
  const link = new URL(mesas[0]?.link ?? '');
  return {
    slug,
    link: link.toString(),
    caminho: `${link.pathname}${link.search}`,
    codigo: link.searchParams.get('c') ?? '',
    painel,
  };
}
