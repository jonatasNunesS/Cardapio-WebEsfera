import { CODIGOS, ErroDependenciaExterna, type RelatorDeErros } from '@cardapio/aplicacao';
import { Redis } from 'ioredis';

export interface OpcoesDoRedis {
  readonly connectionName?: string;
  readonly connectTimeout?: number;
  readonly enableOfflineQueue?: boolean;
  readonly maxRetriesPerRequest?: number | null;
  readonly autoResubscribe?: boolean;
}

export function criarRedis(url: string, relator: RelatorDeErros, opcoes: OpcoesDoRedis = {}): Redis {
  const redis = new Redis(url, { connectTimeout: 500, maxRetriesPerRequest: 1, ...opcoes });
  let reportado = false;
  redis.on('ready', () => {
    reportado = false;
  });
  redis.on('error', (erro: unknown) => {
    if (reportado) {
      return;
    }
    reportado = true;
    relator.reportar(
      new ErroDependenciaExterna(
        CODIGOS.REDIS_CONEXAO_FALHOU,
        'O Redis não respondeu',
        { modulo: 'redis', casoDeUso: 'conexao' },
        { provedor: 'redis', operacao: 'conexao' },
        erro,
      ),
    );
  });
  return redis;
}
