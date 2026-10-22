const FORMATO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const TAMANHO_MAXIMO_DO_EMAIL = 254;

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function ehEmailValido(email: string): boolean {
  const normal = normalizarEmail(email);
  return normal.length <= TAMANHO_MAXIMO_DO_EMAIL && FORMATO.test(normal);
}
