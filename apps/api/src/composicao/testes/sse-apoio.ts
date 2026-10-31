import { request, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import type { Navegador } from './navegador.ts';

export interface FluxoAberto {
  readonly status: number;
  readonly eventos: string[];
  readonly terminou: Promise<void>;
  fechar(): void;
}

export function abrirSse(servidor: FastifyInstance, host: string, url: string, navegador?: Navegador) {
  const { port } = servidor.server.address() as AddressInfo;
  const cookie =
    navegador === undefined ? '' : [...navegador.cookies].map(([n, v]) => `${n}=${v}`).join('; ');
  return new Promise<FluxoAberto>((resolver, rejeitar) => {
    const pedido = request(
      { host: '127.0.0.1', port, path: url, headers: { host, cookie } },
      (resposta: IncomingMessage) => {
        const eventos: string[] = [];
        let resto = '';
        resposta.setEncoding('utf8');
        resposta.on('data', (pedaco: string) => {
          resto += pedaco;
          const blocos = resto.split('\n\n');
          resto = blocos.pop() ?? '';
          for (const bloco of blocos) {
            const evento = /^event: (.+)$/m.exec(bloco)?.[1];
            if (evento !== undefined) {
              eventos.push(evento);
            }
          }
        });
        const terminou = new Promise<void>((fim) =>
          resposta.on('close', () => {
            fim();
          }),
        );
        resolver({
          status: resposta.statusCode ?? 0,
          eventos,
          terminou,
          fechar: () => {
            pedido.destroy();
          },
        });
      },
    );
    pedido.on('error', rejeitar);
    pedido.end();
  });
}
