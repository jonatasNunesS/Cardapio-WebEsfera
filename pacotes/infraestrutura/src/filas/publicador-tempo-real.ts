import {
  CODIGOS,
  ErroAplicacao,
  ErroDependenciaExterna,
  type EventoPublicavel,
  type PublicadorTempoReal,
} from '@cardapio/aplicacao';
import {
  EVENTOS,
  ehTipoDeEvento,
  esquemaMensagemTempoReal,
  type MensagemTempoReal,
} from '@cardapio/contratos';
import type { Redis } from 'ioredis';
import { chavesRedis } from '../redis/chaves-redis.ts';

function eventoInvalido(evento: EventoPublicavel, campos: readonly string[]): ErroAplicacao {
  return new ErroAplicacao(CODIGOS.CAIXA_SAIDA_EVENTO_INVALIDO, 'Evento fora do contrato', {
    modulo: 'filas',
    casoDeUso: 'publicarTempoReal',
    restauranteId: evento.restauranteId,
    dados: { tipo: evento.tipo, eventoId: evento.id, campos },
  });
}

export function montarMensagem(evento: EventoPublicavel): MensagemTempoReal {
  if (!ehTipoDeEvento(evento.tipo)) {
    throw eventoInvalido(evento, ['tipo']);
  }
  const carga = EVENTOS[evento.tipo].safeParse(evento.carga);
  if (!carga.success) {
    throw eventoInvalido(
      evento,
      carga.error.issues.map((problema) => problema.path.join('.')),
    );
  }
  const { versao, ...dados } = carga.data;
  return esquemaMensagemTempoReal.parse({
    id: evento.id,
    tipo: evento.tipo,
    restaurante_id: evento.restauranteId,
    ocorrido_em: evento.ocorridoEm.toISOString(),
    versao,
    dados,
  });
}

export function criarPublicadorTempoReal(redis: Redis): PublicadorTempoReal {
  return {
    async publicar(evento) {
      const mensagem = JSON.stringify(montarMensagem(evento));
      try {
        await redis.publish(chavesRedis.tempoReal(evento.restauranteId), mensagem);
      } catch (erro) {
        throw new ErroDependenciaExterna(
          CODIGOS.TEMPO_REAL_PUBLICAR_FALHOU,
          'O Redis não aceitou a mensagem de tempo real',
          { modulo: 'filas', casoDeUso: 'publicarTempoReal', restauranteId: evento.restauranteId },
          { provedor: 'redis', operacao: 'publish' },
          erro,
        );
      }
    },
  };
}
