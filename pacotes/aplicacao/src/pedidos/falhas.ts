import { CODIGOS, criarErroDeNegocio } from '@cardapio/dominio';

export const SESSAO_EXPIRADA = criarErroDeNegocio(
  CODIGOS.PEDIDO_SESSAO_MESA_EXPIRADA,
  'Sua sessão nesta mesa acabou. Escaneie o QR Code da mesa de novo.',
);

export const PEDIDO_NAO_ENCONTRADO = criarErroDeNegocio(
  CODIGOS.PEDIDO_CONSULTAR_NAO_ENCONTRADO,
  'Não encontramos este pedido nesta mesa.',
);
