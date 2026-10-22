import type { AutenticadorTotp } from '@cardapio/aplicacao';
import { generateSecret, generateURI, verify } from 'otplib';

export const TOLERANCIA_EM_SEGUNDOS = 30;
export const EMISSOR_DO_TOTP = 'WebEsfera';

export const autenticadorTotp: AutenticadorTotp = {
  gerarSegredo: () => generateSecret(),
  enderecoDeCadastro: (segredo, rotulo) =>
    generateURI({ issuer: EMISSOR_DO_TOTP, label: rotulo, secret: segredo }),
  async passoDoCodigo(segredo, codigo, agora) {
    const resultado = await verify({
      secret: segredo,
      token: codigo,
      epoch: Math.floor(agora.getTime() / 1000),
      epochTolerance: TOLERANCIA_EM_SEGUNDOS,
    });
    return resultado.valid && 'timeStep' in resultado ? resultado.timeStep : null;
  },
};
