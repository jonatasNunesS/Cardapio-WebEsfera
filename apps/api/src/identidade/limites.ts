export const LIMITES = {
  criarConta: { max: 10, timeWindow: '1 hour' },
  entrar: { max: 20, timeWindow: '1 minute' },
  redefinirSenha: { max: 5, timeWindow: '15 minutes' },
  segundoFator: { max: 10, timeWindow: '1 minute' },
  cardapioPublico: { max: 120, timeWindow: '1 minute' },
  buscaPublica: { max: 60, timeWindow: '1 minute' },
} as const;
