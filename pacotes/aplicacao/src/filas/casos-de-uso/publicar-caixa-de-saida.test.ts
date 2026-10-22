import { describe, expect, it } from 'vitest';
import type { CaixaDeSaida } from '../portas/caixa-de-saida.ts';
import type { FilaDeJobs, PedidoDeJob } from '../portas/fila-de-jobs.ts';
import type { EventoPublicavel } from '../portas/publicador-tempo-real.ts';
import { publicarCaixaDeSaida } from './publicar-caixa-de-saida.ts';

const EVENTO: EventoPublicavel = {
  id: 'e1',
  restauranteId: 'r1',
  tipo: 'SessaoMesaExpirada',
  carga: { versao: 1 },
  ocorridoEm: new Date('2026-10-22T23:00:00Z'),
};

function caixaCom(eventos: EventoPublicavel[]): CaixaDeSaida & { marcados: string[]; falhos: string[] } {
  const marcados: string[] = [];
  const falhos: string[] = [];
  return {
    marcados,
    falhos,
    async publicarPendentes(_lote, publicar) {
      for (const evento of eventos) {
        await publicar(evento).then(
          () => marcados.push(evento.id),
          () => falhos.push(evento.id),
        );
      }
      return { publicados: marcados.length, falhas: falhos.length };
    },
  };
}

function filaDeTeste(): FilaDeJobs & { pedidos: PedidoDeJob[] } {
  const pedidos: PedidoDeJob[] = [];
  return {
    pedidos,
    enfileirar(pedido) {
      pedidos.push(pedido);
      return Promise.resolve({ situacao: 'enfileirado', atrasoMs: 0 });
    },
  };
}

describe('PublicarCaixaDeSaida', () => {
  it('publica no tempo real e enfileira os jobs do roteamento com jobId do evento', async () => {
    const publicados: EventoPublicavel[] = [];
    const filas = filaDeTeste();
    const caixaDeSaida = caixaCom([EVENTO]);

    const resumo = await publicarCaixaDeSaida({
      caixaDeSaida,
      filas,
      publicador: { publicar: (evento) => Promise.resolve(void publicados.push(evento)) },
      roteamento: { SessaoMesaExpirada: ['notificar-garcom'] },
    });

    expect(resumo).toEqual({ publicados: 1, falhas: 0 });
    expect(publicados).toEqual([EVENTO]);
    expect(filas.pedidos).toEqual([
      {
        nome: 'notificar-garcom',
        idDoJob: 'evento-e1-notificar-garcom',
        dados: { eventoId: 'e1', tipo: 'SessaoMesaExpirada', carga: { versao: 1 } },
        restauranteId: 'r1',
      },
    ]);
  });

  it('falha ao publicar fica como falha, sem marcar o evento', async () => {
    const caixaDeSaida = caixaCom([EVENTO]);
    const resumo = await publicarCaixaDeSaida({
      caixaDeSaida,
      filas: filaDeTeste(),
      publicador: { publicar: () => Promise.reject(new Error('redis fora')) },
      roteamento: {},
    });

    expect(resumo).toEqual({ publicados: 0, falhas: 1 });
    expect(caixaDeSaida.falhos).toEqual(['e1']);
  });
});
