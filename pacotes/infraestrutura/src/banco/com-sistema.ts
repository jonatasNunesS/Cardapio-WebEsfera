import { CODIGOS, ErroAplicacao, type PropagadorDeContexto } from '@cardapio/aplicacao';
import { sql } from 'drizzle-orm';
import { emTransacao, type BancoDrizzle, type Operacao } from './transacao.ts';

function exigirSistema(banco: BancoDrizzle | undefined): BancoDrizzle {
  if (banco === undefined) {
    throw new ErroAplicacao(
      CODIGOS.BANCO_CONTEXTO_INVALIDO,
      'comSistema exige o pool de sistema, que só o worker tem',
      {
        modulo: 'banco',
        casoDeUso: 'comSistema',
      },
    );
  }
  return banco;
}

export function comSistema<T>(
  banco: BancoDrizzle | undefined,
  propagador: PropagadorDeContexto,
  operacao: Operacao<T>,
): Promise<T> {
  const sistema = exigirSistema(banco);
  return propagador.comSistema(() =>
    emTransacao(sistema, { casoDeUso: 'comSistema', escopo: 'sistema' }, async (transacao) => {
      await transacao.execute(sql`SET LOCAL ROLE app_sistema`);
      return operacao(transacao);
    }),
  );
}
