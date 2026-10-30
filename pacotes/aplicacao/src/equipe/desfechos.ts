import { CODIGOS, criarErroDeNegocio, Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import { podeGerir, type AcessoAoRestaurante } from '../compartilhado/acesso.ts';
import type { DesfechoDaMudanca } from './portas/repositorio-da-equipe.ts';

export function semPermissaoNaFila(acesso: AcessoAoRestaurante): ErroDeNegocio | undefined {
  return podeGerir(acesso)
    ? undefined
    : criarErroDeNegocio(CODIGOS.EQUIPE_ACAO_SEM_PERMISSAO, 'Só o dono ou o gerente mexe na fila.');
}

export function transicaoInvalida(situacaoAtual: string): ErroDeNegocio {
  return criarErroDeNegocio(
    CODIGOS.EQUIPE_ACAO_TRANSICAO_INVALIDA,
    'Esta ação não vale para a situação atual.',
    { situacaoAtual },
  );
}

export function paraResultado<S extends string>(
  desfecho: DesfechoDaMudanca<S>,
): Resultado<null, ErroDeNegocio> {
  switch (desfecho.tipo) {
    case 'alterado':
      return Resultado.ok(null);
    case 'nao-encontrado':
      return Resultado.falha(
        criarErroDeNegocio(CODIGOS.EQUIPE_ACAO_NAO_ENCONTRADO, 'Não encontramos este item na fila.'),
      );
    case 'desatualizado':
      return Resultado.falha(
        criarErroDeNegocio(
          CODIGOS.EQUIPE_ACAO_SITUACAO_DESATUALIZADA,
          'Outra pessoa já mudou este item. A fila foi atualizada.',
          { situacaoAtual: desfecho.atual },
        ),
      );
  }
}
