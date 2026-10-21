import { CODIGOS, ErroDependenciaExterna, type RelatorDeErros } from '@cardapio/aplicacao';
import { executarComContexto } from '@cardapio/observabilidade/node';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { enviarProblema } from './problema.ts';
import { contextoDaRequisicao } from './rastreio.ts';

function ehErroDoCliente(erro: FastifyError): boolean {
  return typeof erro.statusCode === 'number' && erro.statusCode >= 400 && erro.statusCode < 500;
}

function responderEntradaInvalida(requisicao: FastifyRequest, resposta: FastifyReply, erro: ZodError) {
  return enviarProblema(resposta, {
    status: 400,
    codigo: CODIGOS.HTTP_ENTRADA_INVALIDA,
    titulo: 'Entrada inválida',
    detalhe: 'Alguns campos não estão no formato esperado.',
    idRastreio: requisicao.id,
    extras: {
      campos: erro.issues.map((problema) => ({ campo: problema.path.join('.'), motivo: problema.code })),
    },
  });
}

export function registrarTratadorDeErros(servidor: FastifyInstance, relator: RelatorDeErros): void {
  servidor.setNotFoundHandler((requisicao, resposta) =>
    enviarProblema(resposta, {
      status: 404,
      codigo: CODIGOS.HTTP_ROTA_INEXISTENTE,
      titulo: 'Rota inexistente',
      detalhe: 'O endereço pedido não existe.',
      idRastreio: requisicao.id,
    }),
  );

  servidor.setErrorHandler((erro: FastifyError, requisicao, resposta) => {
    if (erro instanceof ZodError) {
      return responderEntradaInvalida(requisicao, resposta, erro);
    }
    if (ehErroDoCliente(erro)) {
      return enviarProblema(resposta, {
        status: erro.statusCode ?? 400,
        codigo: CODIGOS.HTTP_REQUISICAO_INVALIDA,
        titulo: 'Requisição inválida',
        detalhe: 'A requisição não pôde ser processada.',
        idRastreio: requisicao.id,
      });
    }
    const idRastreio = executarComContexto(contextoDaRequisicao(requisicao), () => relator.reportar(erro));
    if (erro instanceof ErroDependenciaExterna) {
      return enviarProblema(resposta, {
        status: 503,
        codigo: CODIGOS.HTTP_DEPENDENCIA_INDISPONIVEL,
        titulo: 'Serviço indisponível',
        detalhe: 'Um serviço de que dependemos não respondeu. Tente de novo em instantes.',
        idRastreio,
      });
    }
    return enviarProblema(resposta, {
      status: 500,
      codigo: CODIGOS.HTTP_REQUISICAO_FALHOU,
      titulo: 'Erro inesperado',
      detalhe: 'Algo deu errado do nosso lado. Informe o id_rastreio ao suporte.',
      idRastreio,
    });
  });
}
