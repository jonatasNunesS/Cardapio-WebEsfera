import type { EnviadorConvite } from '@cardapio/aplicacao';

// INTERMEDIARIO: sem provedor de e-mail, o link volta para o admin uma vez: docs/adr/0017-intermediario-essencial.md
export const enviadorConviteManual: EnviadorConvite = {
  enviar: (convite) => Promise.resolve({ linkParaOAdmin: convite.link }),
};
