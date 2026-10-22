import * as Sentry from '@sentry/node';
import type { Logger } from 'pino';

export type PublicoDoSinal = 'painel' | 'admin';
export type EtapaDoSinal = 'senha' | 'segundo_fator';

export const CODIGO_DO_BLOQUEIO: Readonly<Record<EtapaDoSinal, string>> = {
  senha: 'AUTENTICACAO_SENHA_BLOQUEADA',
  segundo_fator: 'AUTENTICACAO_SEGUNDO_FATOR_BLOQUEADO',
};

export interface SinaisDeSegurancaNode {
  falhou(publico: PublicoDoSinal, etapa: EtapaDoSinal): void;
  bloqueou(publico: PublicoDoSinal, etapa: EtapaDoSinal, alvo: string): void;
}

export function criarSinaisDeSeguranca(logger: Logger): SinaisDeSegurancaNode {
  return {
    falhou(publico, etapa) {
      Sentry.getActiveSpan()?.setAttributes({ 'autenticacao.falha': etapa, 'autenticacao.publico': publico });
      logger.warn({ evento: 'autenticacao_falhou', publico, etapa }, 'Autenticação recusada');
    },
    bloqueou(publico, etapa, alvo) {
      logger.warn(
        { evento: 'autenticacao_bloqueada', publico, etapa, alvo },
        'Bloqueio progressivo iniciado',
      );
      Sentry.captureMessage('Bloqueio progressivo iniciado', {
        level: 'warning',
        tags: { codigo: CODIGO_DO_BLOQUEIO[etapa], publico, etapa, alvo },
        fingerprint: [CODIGO_DO_BLOQUEIO[etapa], publico],
      });
    },
  };
}
