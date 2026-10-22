import type { Publico, TipoDeAlvo } from '@cardapio/dominio';

export type EtapaDeAutenticacao = 'senha' | 'segundo_fator';

export interface SinaisDeSeguranca {
  falhou(publico: Publico, etapa: EtapaDeAutenticacao): void;
  bloqueou(publico: Publico, etapa: EtapaDeAutenticacao, alvo: TipoDeAlvo): void;
}
