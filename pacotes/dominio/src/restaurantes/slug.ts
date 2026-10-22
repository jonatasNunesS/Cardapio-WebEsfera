export const SLUGS_RESERVADOS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'app',
  'ajuda',
  'cardapio',
  'conta',
  'entrar',
  'login',
  'mesa',
  'mesas',
  'painel',
  'privacidade',
  'saude',
  'status',
  'suporte',
  'termos',
  'webesfera',
  'www',
]);

export const TAMANHO_MAXIMO_DO_SLUG = 60;
export const SUFIXOS_TENTADOS = 9;

export function gerarSlug(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, TAMANHO_MAXIMO_DO_SLUG)
    .replace(/^-+|-+$/g, '');
}

export function candidatosDeSlug(nome: string): string[] {
  const base = gerarSlug(nome);
  if (base === '') {
    return [];
  }
  const sufixados = Array.from({ length: SUFIXOS_TENTADOS - 1 }, (_, indice) => {
    const sufixo = `-${String(indice + 2)}`;
    return `${base.slice(0, TAMANHO_MAXIMO_DO_SLUG - sufixo.length).replace(/-+$/, '')}${sufixo}`;
  });
  return [base, ...sufixados].filter((slug) => !SLUGS_RESERVADOS.has(slug));
}
