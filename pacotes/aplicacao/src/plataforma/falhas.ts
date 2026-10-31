import { CODIGOS, criarErroDeNegocio } from '@cardapio/dominio';

export const RESTAURANTE_NAO_ENCONTRADO = criarErroDeNegocio(
  CODIGOS.PLATAFORMA_ACAO_NAO_ENCONTRADO,
  'Não encontramos este restaurante.',
);

export const SEM_PERMISSAO = criarErroDeNegocio(
  CODIGOS.PLATAFORMA_ACAO_SEM_PERMISSAO,
  'Só um administrador com segundo fator faz esta ação.',
);
