import { CODIGOS, criarErroDeNegocio, Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDaEquipe } from '../dependencias.ts';
import { semPermissaoNaFila } from '../desfechos.ts';

export async function encerrarSessaoDeMesa(
  dependencias: DependenciasDaEquipe,
  acesso: AcessoAoRestaurante,
  sessaoMesaId: string,
  confirmado: boolean,
): Promise<Resultado<null, ErroDeNegocio>> {
  const proibido = semPermissaoNaFila(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const desfecho = await dependencias.equipe.encerrarSessao(
    acesso,
    sessaoMesaId,
    confirmado,
    dependencias.relogio.agora(),
  );
  switch (desfecho.tipo) {
    case 'encerrada':
      return Resultado.ok(null);
    case 'nao-encontrada':
      return Resultado.falha(
        criarErroDeNegocio(CODIGOS.EQUIPE_ACAO_NAO_ENCONTRADO, 'Esta mesa não tem sessão aberta.'),
      );
    case 'ja-fechada':
      return Resultado.falha(
        criarErroDeNegocio(CODIGOS.EQUIPE_ENCERRAR_SESSAO_FECHADA, 'A sessão desta mesa já foi fechada.'),
      );
    case 'pendencias':
      return Resultado.falha(
        criarErroDeNegocio(
          CODIGOS.EQUIPE_ENCERRAR_PENDENCIAS_ABERTAS,
          'Há pedido ou chamado em aberto nesta mesa. Confirme para encerrar mesmo assim.',
          { pedidosAbertos: desfecho.pedidos, chamadosAbertos: desfecho.chamados },
        ),
      );
  }
}
