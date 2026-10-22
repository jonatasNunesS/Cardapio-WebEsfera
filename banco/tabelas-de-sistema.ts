export interface TabelaDeSistema {
  readonly tabela: string;
  readonly permissoes: readonly string[];
  readonly motivo: string;
}

export const TABELAS_DE_SISTEMA: readonly TabelaDeSistema[] = [
  {
    tabela: 'caixa_saida',
    permissoes: ['SELECT', 'UPDATE (publicado_em, tentativas)'],
    motivo: 'O publicador do outbox lê os eventos pendentes de todos os restaurantes e marca publicado_em.',
  },
  {
    tabela: 'sessoes_mesa',
    permissoes: ['SELECT'],
    motivo:
      'A rotina de expiração lista as sessões vencidas de todos os restaurantes; o fechamento é feito por restaurante, com comRestaurante().',
  },
];
