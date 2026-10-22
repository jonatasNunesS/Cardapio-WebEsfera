import { LIMITES_DO_CARDAPIO_NA_API } from '@cardapio/contratos';
import { describe, expect, it } from 'vitest';
import { DINHEIRO_MAXIMO_EM_CENTAVOS } from './dinheiro.ts';
import { LIMITES_DO_CARDAPIO } from './itens.ts';

describe('limites do cardápio', () => {
  it('o domínio e os contratos da API usam os mesmos limites', () => {
    expect(LIMITES_DO_CARDAPIO_NA_API).toMatchObject({
      ...LIMITES_DO_CARDAPIO,
      precoMaximoEmCentavos: DINHEIRO_MAXIMO_EM_CENTAVOS,
    });
  });
});
