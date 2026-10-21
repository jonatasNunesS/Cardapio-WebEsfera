import { CODIGOS, ErroAplicacao, type PropagadorDeContexto } from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import { emTransacao, type BancoDrizzle, type Operacao } from './transacao.ts';

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function exigirRestauranteValido(restauranteId: string): void {
  if (!PADRAO_UUID.test(restauranteId)) {
    throw new ErroAplicacao(
      CODIGOS.BANCO_CONTEXTO_INVALIDO,
      'comRestaurante recebeu um restauranteId que não é UUID',
      {
        modulo: 'banco',
        casoDeUso: 'comRestaurante',
      },
    );
  }
}

export function comRestaurante<T>(
  banco: BancoDrizzle,
  propagador: PropagadorDeContexto,
  restauranteId: string,
  operacao: Operacao<T>,
): Promise<T> {
  exigirRestauranteValido(restauranteId);
  const contexto = { casoDeUso: 'comRestaurante', restauranteId, escopo: 'restaurante' } as const;
  return propagador.comRestaurante(restauranteId, () =>
    emTransacao(banco, contexto, async (transacao) => {
      await transacao.execute(sql`SELECT set_config('app.restaurante_id', ${restauranteId}, true)`);
      return operacao(transacao);
    }),
  );
}
