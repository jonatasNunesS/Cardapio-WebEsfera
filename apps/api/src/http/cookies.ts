import type { SessaoAberta } from '@cardapio/aplicacao';
import type { FastifyReply } from 'fastify';

export const COOKIES = {
  painel: '__Host-sessao_painel',
  admin: '__Host-sessao_admin',
  csrf: '__Host-csrf',
} as const;

export const OPCOES_DE_COOKIE = { path: '/', httpOnly: true, secure: true, sameSite: 'lax' } as const;

export type CookieDeSessao = typeof COOKIES.painel | typeof COOKIES.admin;

export function gravarCookieDeSessao(
  resposta: FastifyReply,
  nome: CookieDeSessao,
  sessao: SessaoAberta,
): void {
  resposta.setCookie(nome, sessao.token, { ...OPCOES_DE_COOKIE, expires: sessao.expiraEm });
}

export function apagarCookieDeSessao(resposta: FastifyReply, nome: CookieDeSessao): void {
  resposta.clearCookie(nome, OPCOES_DE_COOKIE);
}
