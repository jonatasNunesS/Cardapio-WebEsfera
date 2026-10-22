export type Publico = 'painel' | 'admin';
export type NivelDaSessao = 'completa' | 'segundo_fator' | 'cadastro';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

export interface LimitesDaSessao {
  readonly inatividadeMs: number;
  readonly idadeMaximaMs: number;
}

export const LIMITES_DA_SESSAO: Readonly<Record<Publico, LimitesDaSessao>> = {
  painel: { inatividadeMs: 12 * HORA, idadeMaximaMs: 30 * DIA },
  admin: { inatividadeMs: 30 * MINUTO, idadeMaximaMs: 8 * HORA },
};

export const LIMITES_DA_SESSAO_PARCIAL: LimitesDaSessao = {
  inatividadeMs: 5 * MINUTO,
  idadeMaximaMs: 10 * MINUTO,
};

export const INTERVALO_MINIMO_DE_RENOVACAO_MS = MINUTO;

export interface DatasDaSessao {
  readonly publico: Publico;
  readonly nivel: NivelDaSessao;
  readonly criadaEm: Date;
  readonly ultimoUsoEm: Date;
  readonly expiraEm: Date;
}

export function limitesDe(publico: Publico, nivel: NivelDaSessao): LimitesDaSessao {
  return nivel === 'completa' ? LIMITES_DA_SESSAO[publico] : LIMITES_DA_SESSAO_PARCIAL;
}

export function expiracaoDaNovaSessao(publico: Publico, nivel: NivelDaSessao, agora: Date): Date {
  return new Date(agora.getTime() + limitesDe(publico, nivel).idadeMaximaMs);
}

export function sessaoExpirou(sessao: DatasDaSessao, agora: Date): boolean {
  const { inatividadeMs } = limitesDe(sessao.publico, sessao.nivel);
  const ociosa = agora.getTime() - sessao.ultimoUsoEm.getTime() >= inatividadeMs;
  return ociosa || agora.getTime() >= sessao.expiraEm.getTime();
}

export function precisaRenovar(sessao: DatasDaSessao, agora: Date): boolean {
  return agora.getTime() - sessao.ultimoUsoEm.getTime() >= INTERVALO_MINIMO_DE_RENOVACAO_MS;
}
