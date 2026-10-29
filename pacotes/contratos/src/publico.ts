// Entrada sem zod para o app do cliente, que tem orçamento de JavaScript: docs/adr/0013-cardapio-do-cliente.md
export const ROTAS_DO_CARDAPIO_PUBLICO = {
  cardapio: '/api/v1/cardapios/:slug',
  busca: '/api/v1/cardapios/:slug/busca',
} as const;

export const ROTAS_DA_MESA_PUBLICA = {
  abrir: '/api/v1/cardapios/:slug/mesa/:numero',
} as const;

export function rotaCom(rota: string, parametros: Readonly<Record<string, string>>): string {
  return rota.replace(/:([a-z]+)/gi, (_trecho, nome: string) => encodeURIComponent(parametros[nome] ?? ''));
}
