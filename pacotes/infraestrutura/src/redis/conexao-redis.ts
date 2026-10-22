import { CODIGOS, ErroDependenciaExterna, type RelatorDeErros } from '@cardapio/aplicacao';
import { Redis } from 'ioredis';

export function criarRedis(url: string, relator: RelatorDeErros): Redis {
  const redis = new Redis(url, { connectTimeout: 500, maxRetriesPerRequest: 1 });
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
