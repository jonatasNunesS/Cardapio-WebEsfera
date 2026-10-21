import { LogController, type FastifyReply, type FastifyRequest } from 'fastify';

function resumoDaRequisicao(requisicao: FastifyRequest) {
  return { metodo: requisicao.method, rota: requisicao.routeOptions.url ?? 'inexistente' };
}

export class ControladorDeLog extends LogController {
  constructor() {
    super({ requestIdLogLabel: 'idRastreio' });
  }

  override incomingRequest(requisicao: FastifyRequest): void {
    requisicao.log.info(resumoDaRequisicao(requisicao), 'requisição recebida');
  }

  override requestCompleted(
    _erro: Error | null | undefined,
    requisicao: FastifyRequest,
    resposta: FastifyReply,
  ): void {
    resposta.log.info(
      {
        ...resumoDaRequisicao(requisicao),
        status: resposta.statusCode,
        duracaoMs: Math.round(resposta.elapsedTime),
      },
      'requisição concluída',
    );
  }

  override routeNotFound(requisicao: FastifyRequest): void {
    requisicao.log.info({ metodo: requisicao.method }, 'rota inexistente');
  }
}
