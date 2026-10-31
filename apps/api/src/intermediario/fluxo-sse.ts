import type { AssinanteTempoReal, AvisoTempoReal } from '@cardapio/aplicacao';
import { EVENTO_SSE_PRONTO, INTERVALO_DO_BATIMENTO_SSE_MS } from '@cardapio/contratos/publico';
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface OpcoesDoFluxo {
  readonly assinante: AssinanteTempoReal;
  readonly restauranteId: string;
  readonly filtrar: (aviso: AvisoTempoReal) => Readonly<Record<string, unknown>> | null;
  readonly batimentoMs?: number;
}

// O fluxo só avisa; o cliente reconsulta o estado a cada aviso e a cada reconexão: docs/adr/0017-intermediario-essencial.md
export async function abrirFluxoSse(
  requisicao: FastifyRequest,
  resposta: FastifyReply,
  opcoes: OpcoesDoFluxo,
): Promise<void> {
  const saida = resposta.raw;
  let encerrado = false;
  let cancelar: () => void = () => undefined;
  const encerrar = () => {
    if (encerrado) {
      return;
    }
    encerrado = true;
    clearInterval(batimento);
    cancelar();
    saida.end();
  };
  cancelar = await opcoes.assinante.assinar(opcoes.restauranteId, {
    aoReceber: (aviso) => {
      const dados = opcoes.filtrar(aviso);
      if (dados !== null && !encerrado) {
        saida.write(`id: ${aviso.id}\nevent: ${aviso.tipo}\ndata: ${JSON.stringify(dados)}\n\n`);
      }
    },
    aoCair: encerrar,
  });
  resposta.hijack();
  saida.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    'x-accel-buffering': 'no',
    connection: 'keep-alive',
  });
  saida.write(`retry: 3000\nevent: ${EVENTO_SSE_PRONTO}\ndata: {}\n\n`);
  const batimento = setInterval(
    () => saida.write(': batimento\n\n'),
    opcoes.batimentoMs ?? INTERVALO_DO_BATIMENTO_SSE_MS,
  );
  requisicao.raw.on('close', encerrar);
}
