import { ROTAS_DO_ADMIN } from '@cardapio/contratos';
import { criarClienteDaApi } from '@cardapio/contratos/cliente';

export const api = criarClienteDaApi(ROTAS_DO_ADMIN.csrf);

export const MARCA = 'WebEsfera Admin';
