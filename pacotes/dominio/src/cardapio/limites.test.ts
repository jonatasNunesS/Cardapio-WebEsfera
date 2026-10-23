import {
  centavosDoTexto,
  formatarPreco,
  LIMITES_DO_CARDAPIO_NA_API,
  textoDoPreco,
} from '@cardapio/contratos';
import { describe, expect, it } from 'vitest';
import { criarDinheiro, DINHEIRO_MAXIMO_EM_CENTAVOS, formatarDinheiro } from './dinheiro.ts';
import { LIMITES_DO_CARDAPIO } from './itens.ts';

describe('limites do cardápio', () => {
  it('o domínio e os contratos da API usam os mesmos limites', () => {
    expect(LIMITES_DO_CARDAPIO_NA_API).toMatchObject({
      ...LIMITES_DO_CARDAPIO,
      precoMaximoEmCentavos: DINHEIRO_MAXIMO_EM_CENTAVOS,
    });
  });

  it.each([0, 5, 8990, 123456, DINHEIRO_MAXIMO_EM_CENTAVOS])(
    'o painel formata e lê %i centavos igual ao domínio',
    (centavos) => {
      const dinheiro = criarDinheiro(centavos);
      expect(dinheiro.ok && formatarDinheiro(dinheiro.valor)).toBe(formatarPreco(centavos));
      expect(centavosDoTexto(textoDoPreco(centavos))).toBe(centavos);
    },
  );
});
