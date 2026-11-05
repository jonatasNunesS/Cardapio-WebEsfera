import { CONTAS_LOCAIS, type AmbienteDaSemente } from './ambiente.ts';
import { ClienteHttp } from './cliente-http.ts';

const NOME = 'Brasa Local';
const PRATOS = [
  {
    nome: 'Moqueca da casa',
    descricao: 'Peixe, leite de coco e dendê.',
    precoCentavos: 7900,
    destaque: true,
  },
  { nome: 'Costela na brasa', descricao: 'Doze horas no fogo baixo.', precoCentavos: 8900, destaque: false },
  { nome: 'Suco de caju', descricao: '500 ml.', precoCentavos: 1200, destaque: false },
];
const MESAS = [1, 2];

interface Cardapio {
  readonly categorias: readonly { readonly pratos: readonly unknown[] }[];
}

async function entrarOuCriarConta(painel: ClienteHttp): Promise<void> {
  await painel.prepararCsrf('/api/v1/csrf');
  const { email, senha } = CONTAS_LOCAIS.dono;
  const entrada = await painel.pedir('POST', '/api/v1/sessao', { email, senha });
  if (entrada.status >= 400) {
    await painel.exigir('POST', '/api/v1/contas', { nome: 'Dono local', email, senha });
  }
}

async function garantirRestaurante(painel: ClienteHttp): Promise<string> {
  const sessao = await painel.exigir<{ restaurante: { slug: string } | null }>('GET', '/api/v1/sessao');
  if (sessao.restaurante !== null) {
    return sessao.restaurante.slug;
  }
  return (await painel.exigir<{ slug: string }>('POST', '/api/v1/restaurante', { nome: NOME })).slug;
}

async function garantirCardapio(painel: ClienteHttp): Promise<void> {
  const cardapio = await painel.exigir<Cardapio>('GET', '/api/v1/cardapio');
  if (cardapio.categorias.some((categoria) => categoria.pratos.length > 0)) {
    return;
  }
  const categoria = await painel.exigir<{ id: string }>('POST', '/api/v1/cardapio/categorias', {
    nome: 'Da casa',
  });
  for (const prato of PRATOS) {
    await painel.exigir('POST', '/api/v1/cardapio/pratos', {
      ...prato,
      categoriaId: categoria.id,
      disponivel: true,
    });
  }
}

async function garantirMesas(painel: ClienteHttp): Promise<readonly { numero: number; link: string }[]> {
  const lidas = await painel.exigir<{ mesas: { numero: number; link: string }[] }>('GET', '/api/v1/mesas');
  for (const numero of MESAS.filter((item) => !lidas.mesas.some((mesa) => mesa.numero === item))) {
    await painel.exigir('POST', '/api/v1/mesas', { numero, nome: null, area: null });
  }
  return (await painel.exigir<{ mesas: { numero: number; link: string }[] }>('GET', '/api/v1/mesas')).mesas;
}

export async function semearRestaurante(ambiente: AmbienteDaSemente) {
  const painel = new ClienteHttp(ambiente.urlDaApi, ambiente.hosts.painel);
  await entrarOuCriarConta(painel);
  const slug = await garantirRestaurante(painel);
  await garantirCardapio(painel);
  return { slug, mesas: await garantirMesas(painel) };
}
