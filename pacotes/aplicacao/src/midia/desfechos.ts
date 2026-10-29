import { CODIGOS, criarErroDeNegocio, type ErroDeNegocio } from '@cardapio/dominio';
import { podeGerir, type AcessoAoRestaurante } from '../compartilhado/acesso.ts';

export function semPermissaoNaMidia(acesso: AcessoAoRestaurante): ErroDeNegocio | undefined {
  return podeGerir(acesso)
    ? undefined
    : criarErroDeNegocio(
        CODIGOS.MIDIA_EDITAR_SEM_PERMISSAO,
        'Só o dono ou o gerente muda as fotos e os vídeos.',
      );
}

export const MIDIA_NAO_ENCONTRADA = criarErroDeNegocio(
  CODIGOS.MIDIA_EDITAR_NAO_ENCONTRADA,
  'Esta foto ou vídeo não existe mais.',
);

export const PRATO_NAO_ENCONTRADO = criarErroDeNegocio(
  CODIGOS.CARDAPIO_EDITAR_NAO_ENCONTRADO,
  'Este prato não existe mais no cardápio.',
);

export const SITUACAO_INVALIDA = criarErroDeNegocio(
  CODIGOS.MIDIA_EDITAR_SITUACAO_INVALIDA,
  'Esta mídia já mudou de situação. A tela foi atualizada.',
);

export const ARQUIVO_AUSENTE = criarErroDeNegocio(
  CODIGOS.MIDIA_CONFIRMAR_ARQUIVO_AUSENTE,
  'O arquivo não chegou ao armazenamento. Envie de novo.',
);

export const ARQUIVO_DIVERGENTE = criarErroDeNegocio(
  CODIGOS.MIDIA_CONFIRMAR_ARQUIVO_DIVERGENTE,
  'O arquivo recebido não bate com o informado. Envie de novo.',
);
