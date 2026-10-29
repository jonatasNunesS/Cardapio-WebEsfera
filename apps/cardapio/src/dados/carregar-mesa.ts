import { rotaCom, ROTAS_DA_MESA_PUBLICA, ROTAS_DO_CARDAPIO_PUBLICO } from '@cardapio/contratos/publico';
import type { RespostaCardapioPublico, RespostaSessaoDeMesa } from '@cardapio/contratos';
import type { Lembranca, MesaLembrada } from './lembranca.ts';

export type Buscar = (endereco: string) => Promise<Response>;

export type MesaCarregada =
  | {
      readonly tipo: 'pronta';
      readonly mesa: MesaLembrada;
      readonly cardapio: RespostaCardapioPublico;
      readonly offline: boolean;
    }
  | { readonly tipo: 'redirecionar'; readonly slug: string; readonly numero: number }
  | { readonly tipo: 'qr-invalido' }
  | { readonly tipo: 'expirada' }
  | { readonly tipo: 'sem-conexao' };

export interface PedidoDaMesa {
  readonly slug: string;
  readonly numero: number;
  readonly codigo: string;
  readonly agora: Date;
}

const rotaDoCardapio = (slug: string) => rotaCom(ROTAS_DO_CARDAPIO_PUBLICO.cardapio, { slug });

async function lerCardapio(buscar: Buscar, slug: string): Promise<RespostaCardapioPublico | undefined> {
  const resposta = await buscar(rotaDoCardapio(slug)).then(
    (recebida) => recebida,
    () => undefined,
  );
  return resposta?.ok === true ? ((await resposta.json()) as RespostaCardapioPublico) : undefined;
}

async function semRede(
  cardapioPedido: Promise<RespostaCardapioPublico | undefined>,
  lembranca: Lembranca,
  pedido: PedidoDaMesa,
): Promise<MesaCarregada> {
  const mesa = lembranca.lerMesa(pedido.slug, pedido.numero);
  if (mesa === undefined) {
    return { tipo: 'sem-conexao' };
  }
  if (new Date(mesa.expiraEm) <= pedido.agora) {
    return { tipo: 'expirada' };
  }
  const cardapio = await cardapioPedido;
  return cardapio === undefined ? { tipo: 'sem-conexao' } : { tipo: 'pronta', mesa, cardapio, offline: true };
}

export async function carregarMesa(
  buscar: Buscar,
  lembranca: Lembranca,
  pedido: PedidoDaMesa,
): Promise<MesaCarregada> {
  const rota = rotaCom(ROTAS_DA_MESA_PUBLICA.abrir, { slug: pedido.slug, numero: String(pedido.numero) });
  const cardapioPedido = lerCardapio(buscar, pedido.slug);
  const resposta = await buscar(`${rota}?c=${encodeURIComponent(pedido.codigo)}`).then(
    (recebida) => recebida,
    () => undefined,
  );
  if (resposta?.status === 404) {
    lembranca.esquecerMesa(pedido.slug, pedido.numero);
    return { tipo: 'qr-invalido' };
  }
  if (resposta?.ok !== true) {
    return semRede(cardapioPedido, lembranca, pedido);
  }
  const sessao = (await resposta.json()) as RespostaSessaoDeMesa;
  if (sessao.slug !== pedido.slug || sessao.numero !== pedido.numero) {
    return { tipo: 'redirecionar', slug: sessao.slug, numero: sessao.numero };
  }
  const mesa: MesaLembrada = { slug: sessao.slug, numero: sessao.numero, expiraEm: sessao.expiraEm };
  lembranca.guardarMesa(mesa);
  const cardapio = await cardapioPedido;
  return cardapio === undefined
    ? { tipo: 'sem-conexao' }
    : { tipo: 'pronta', mesa, cardapio, offline: false };
}
