const LINK_DO_INSTAGRAM = /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._-]+\/?$/;
export const TAMANHO_MAXIMO_DO_LINK_DO_INSTAGRAM = 300;

export function ehLinkDoInstagram(valor: string): boolean {
  return valor.length <= TAMANHO_MAXIMO_DO_LINK_DO_INSTAGRAM && LINK_DO_INSTAGRAM.test(valor);
}
