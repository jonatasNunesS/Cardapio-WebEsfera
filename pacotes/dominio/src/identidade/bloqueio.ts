export type TipoDeAlvo = 'email' | 'ip' | 'segundo_fator';

export interface Tentativas {
  readonly falhas: number;
  readonly ultimaFalhaEm: Date;
}

const MINUTO = 60_000;

export const FALHAS_LIVRES: Readonly<Record<TipoDeAlvo, number>> = {
  email: 5,
  ip: 20,
  segundo_fator: 5,
};

export const ESPERA_MAXIMA_MS = 60 * MINUTO;
export const ESQUECER_FALHAS_APOS_MS = 24 * 60 * MINUTO;

export function esperaAposFalhas(tipo: TipoDeAlvo, falhas: number): number {
  const excesso = falhas - FALHAS_LIVRES[tipo];
  if (excesso < 0) {
    return 0;
  }
  return Math.min(MINUTO * 2 ** excesso, ESPERA_MAXIMA_MS);
}

export function bloqueadoAte(tipo: TipoDeAlvo, tentativas: Tentativas, agora: Date): Date | null {
  if (agora.getTime() - tentativas.ultimaFalhaEm.getTime() >= ESQUECER_FALHAS_APOS_MS) {
    return null;
  }
  const fim = tentativas.ultimaFalhaEm.getTime() + esperaAposFalhas(tipo, tentativas.falhas);
  return fim > agora.getTime() ? new Date(fim) : null;
}

export function esquecerAntesDe(agora: Date): Date {
  return new Date(agora.getTime() - ESQUECER_FALHAS_APOS_MS);
}
