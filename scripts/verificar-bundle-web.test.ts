import { describe, expect, it } from 'vitest';
import { encontrarModulosProibidos } from './verificar-bundle-web.ts';

describe('verificar-bundle-web', () => {
  it('acusa import de módulo node: e de pino', () => {
    const codigo =
      'import{AsyncLocalStorage as a}from"node:async_hooks";const p=require("pino");import("pino/file")';

    expect(encontrarModulosProibidos(codigo)).toEqual(['node:async_hooks', 'pino', 'pino/file']);
  });

  it('acusa o SDK do Sentry para Node', () => {
    expect(encontrarModulosProibidos("import * as S from '@sentry/node'")).toEqual(['@sentry/node']);
  });

  it('ignora propriedades chamadas node e texto comum', () => {
    expect(encontrarModulosProibidos('return{node:n,offset:t};const pinoNoir="vinho"')).toEqual([]);
  });
});
