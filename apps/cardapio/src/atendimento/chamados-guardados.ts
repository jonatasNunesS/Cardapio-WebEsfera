import type { TipoDeChamadoNaApi } from '@cardapio/contratos/publico';

type Guardados = Partial<Record<TipoDeChamadoNaApi, string>>;

const chave = (slug: string, numero: number) => `chamados:${slug}:${String(numero)}`;

export function lerChamadosGuardados(slug: string, numero: number): Guardados {
  return JSON.parse(sessionStorage.getItem(chave(slug, numero)) ?? '{}') as Guardados;
}

export function guardarChamado(
  slug: string,
  numero: number,
  tipo: TipoDeChamadoNaApi,
  id: string | null,
): void {
  const atuais = lerChamadosGuardados(slug, numero);
  const proximos: Guardados = { ...atuais, [tipo]: id ?? undefined };
  sessionStorage.setItem(chave(slug, numero), JSON.stringify(proximos));
}
