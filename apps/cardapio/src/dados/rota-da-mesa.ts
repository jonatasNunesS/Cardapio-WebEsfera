import { redirect, type LoaderFunctionArgs, type ShouldRevalidateFunctionArgs } from 'react-router';
import { carregarMesa } from './carregar-mesa.ts';
import { criarLembranca } from './lembranca.ts';

const SLUG = /^[a-z0-9-]{1,80}$/;

const lembranca = criarLembranca(() => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage));

export { lembranca };

export async function carregarRotaDaMesa({ params, request }: LoaderFunctionArgs) {
  const slug = params.slug ?? '';
  const numero = Number(params.numero);
  const codigo = new URL(request.url).searchParams.get('c') ?? '';
  if (!SLUG.test(slug) || !Number.isInteger(numero) || numero < 1) {
    return { carregada: { tipo: 'qr-invalido' } as const, codigo };
  }
  const carregada = await carregarMesa(
    (endereco) => fetch(endereco, { credentials: 'same-origin' }),
    lembranca,
    {
      slug,
      numero,
      codigo,
      agora: new Date(),
    },
  );
  if (carregada.tipo === 'redirecionar') {
    return redirect(`/${carregada.slug}/mesa/${String(carregada.numero)}?c=${encodeURIComponent(codigo)}`);
  }
  return { carregada, codigo };
}

export function revalidarMesa({
  currentParams,
  nextParams,
  currentUrl,
  nextUrl,
}: ShouldRevalidateFunctionArgs) {
  return (
    currentParams.slug !== nextParams.slug ||
    currentParams.numero !== nextParams.numero ||
    currentUrl.searchParams.get('c') !== nextUrl.searchParams.get('c')
  );
}
