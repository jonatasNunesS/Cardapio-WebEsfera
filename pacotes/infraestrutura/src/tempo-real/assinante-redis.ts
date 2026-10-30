import {
  CODIGOS,
  ErroAplicacao,
  ErroDependenciaExterna,
  type AssinanteTempoReal,
  type AvisoTempoReal,
  type OuvinteTempoReal,
  type RelatorDeErros,
} from '@cardapio/aplicacao';
import { esquemaMensagemTempoReal } from '@cardapio/contratos';
import type { Redis } from 'ioredis';
import { fecharRedis } from '../filas/conexoes.ts';
import { chavesRedis } from '../redis/chaves-redis.ts';
import { criarRedis } from '../redis/conexao-redis.ts';

function reportarErro(relator: RelatorDeErros, canal: string, causa?: unknown): null {
  relator.reportar(
    new ErroAplicacao(
      CODIGOS.TEMPO_REAL_MENSAGEM_INVALIDA,
      'Mensagem de tempo real fora do contrato',
      { modulo: 'tempo-real', casoDeUso: 'assinarTempoReal', dados: { canal } },
      causa,
    ),
  );
  return null;
}

function lerAviso(canal: string, texto: string, relator: RelatorDeErros): AvisoTempoReal | null {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch (erro) {
    return reportarErro(relator, canal, erro);
  }
  const lido = esquemaMensagemTempoReal.safeParse(bruto);
  if (!lido.success || chavesRedis.tempoReal(lido.data.restaurante_id) !== canal) {
    return reportarErro(relator, canal);
  }
  const { restaurante_id: restauranteId, ocorrido_em: ocorridoEm, ...resto } = lido.data;
  return { ...resto, restauranteId, ocorridoEm };
}

function falhaAoAssinar(restauranteId: string, erro: unknown): ErroDependenciaExterna {
  return new ErroDependenciaExterna(
    CODIGOS.TEMPO_REAL_ASSINAR_FALHOU,
    'O Redis não aceitou a assinatura de tempo real',
    { modulo: 'tempo-real', casoDeUso: 'assinarTempoReal', restauranteId },
    { provedor: 'redis', operacao: 'subscribe' },
    erro,
  );
}

// Pub/sub só avisa; quem recebe sempre reconsulta o estado: docs/adr/0017-intermediario-essencial.md
export function criarAssinanteRedis(
  url: string,
  relator: RelatorDeErros,
  nomeDaConexao = 'tempo-real',
): AssinanteTempoReal {
  const ouvintes = new Map<string, Set<OuvinteTempoReal>>();
  const redis: Redis = criarRedis(url, relator, {
    connectionName: nomeDaConexao,
    enableOfflineQueue: false,
    autoResubscribe: false,
    maxRetriesPerRequest: 0,
  });

  const derrubarTodos = () => {
    const todos = [...ouvintes.values()].flatMap((conjunto) => [...conjunto]);
    ouvintes.clear();
    for (const ouvinte of todos) {
      ouvinte.aoCair();
    }
  };

  redis.on('close', derrubarTodos);
  redis.on('message', (canal: string, texto: string) => {
    const aviso = lerAviso(canal, texto, relator);
    if (aviso === null) {
      return;
    }
    for (const ouvinte of ouvintes.get(canal) ?? []) {
      ouvinte.aoReceber(aviso);
    }
  });

  const soltar = (canal: string, ouvinte: OuvinteTempoReal) => {
    const conjunto = ouvintes.get(canal);
    if (conjunto?.delete(ouvinte) !== true || conjunto.size > 0) {
      return;
    }
    ouvintes.delete(canal);
    redis.unsubscribe(canal).catch(() => undefined);
  };

  return {
    async assinar(restauranteId, ouvinte) {
      const canal = chavesRedis.tempoReal(restauranteId);
      if (redis.status !== 'ready') {
        throw falhaAoAssinar(restauranteId, new Error(`redis ${redis.status}`));
      }
      try {
        await redis.subscribe(canal);
      } catch (erro) {
        throw falhaAoAssinar(restauranteId, erro);
      }
      const conjunto = ouvintes.get(canal) ?? new Set();
      conjunto.add(ouvinte);
      ouvintes.set(canal, conjunto);
      return () => {
        soltar(canal, ouvinte);
      };
    },
    async encerrar() {
      redis.off('close', derrubarTodos);
      derrubarTodos();
      await fecharRedis(redis);
    },
  };
}
