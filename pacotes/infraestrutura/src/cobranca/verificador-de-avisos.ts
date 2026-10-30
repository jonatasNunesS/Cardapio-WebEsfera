import type { VerificadorDeAvisos } from '@cardapio/aplicacao';
import { createHmac, timingSafeEqual } from 'node:crypto';

interface PartesDaAssinatura {
  readonly ts: string | undefined;
  readonly v1: string | undefined;
}

function lerCabecalho(cabecalho: string): PartesDaAssinatura {
  const partes = new Map<string, string>();
  for (const parte of cabecalho.split(',')) {
    const igual = parte.indexOf('=');
    if (igual > 0) {
      partes.set(parte.slice(0, igual).trim().toLowerCase(), parte.slice(igual + 1).trim());
    }
  }
  return { ts: partes.get('ts'), v1: partes.get('v1') };
}

export function manifestoDoAviso(dataId: string, xRequestId: string, ts: string): string {
  return `id:${dataId};request-id:${xRequestId};ts:${ts};`;
}

export function assinarAviso(segredo: string, dataId: string, xRequestId: string, ts: string): string {
  return createHmac('sha256', segredo)
    .update(manifestoDoAviso(dataId, xRequestId, ts))
    .digest('hex');
}

function iguais(a: string, b: string): boolean {
  const primeiro = Buffer.from(a);
  const segundo = Buffer.from(b);
  return primeiro.length === segundo.length && timingSafeEqual(primeiro, segundo);
}

export function criarVerificadorDeAvisos(segredo: string): VerificadorDeAvisos {
  return {
    verificar({ assinatura, xRequestId, dataId }) {
      const { ts, v1 } = lerCabecalho(assinatura);
      if (ts === undefined || v1 === undefined || !/^\d+$/.test(ts) || xRequestId === '' || dataId === '') {
        return false;
      }
      return iguais(assinarAviso(segredo, dataId, xRequestId, ts), v1);
    },
  };
}
