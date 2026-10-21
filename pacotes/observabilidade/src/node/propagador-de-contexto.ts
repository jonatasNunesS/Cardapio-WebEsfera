import type { PropagadorDeContexto } from '@cardapio/aplicacao';
import { contextoAtual, executarComContexto, type ContextoDeExecucao } from '../contexto.ts';
import { gerarIdRastreio } from './id-rastreio.ts';

function contextoBase(): ContextoDeExecucao {
  return contextoAtual() ?? { idRastreio: gerarIdRastreio(), app: 'desconhecido' };
}

export const propagadorDeContexto: PropagadorDeContexto = {
  comRestaurante: (restauranteId, executar) =>
    executarComContexto({ ...contextoBase(), restauranteId }, executar),
  comSistema: (executar) => executarComContexto({ ...contextoBase(), escopo: 'sistema' }, executar),
};
