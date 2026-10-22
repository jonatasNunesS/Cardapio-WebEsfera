export const SUPERFICIES = ['cardapio', 'painel', 'tv'] as const;

export type Superficie = (typeof SUPERFICIES)[number];

export function superficiesDaHistoria(tags: readonly string[]): Superficie[] {
  return SUPERFICIES.filter((superficie) => tags.includes(superficie));
}

export function exigirSuperficie(titulo: string, nome: string, tags: readonly string[]): void {
  if (superficiesDaHistoria(tags).length === 0) {
    throw new Error(
      `A história "${titulo} / ${nome}" não diz onde aparece. Use as tags cardapio, painel ou tv (docs/adr/0007-design-system.md).`,
    );
  }
}
