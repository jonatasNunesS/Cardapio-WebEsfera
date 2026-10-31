export const SEGREDO_TOTP_LOCAL = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

export const CONTAS_LOCAIS = {
  admin: { email: 'admin@local.cardapio.dev', senha: 'senha-local-do-admin' },
  dono: { email: 'dono@local.cardapio.dev', senha: 'senha-local-do-dono' },
} as const;

export interface AmbienteDaSemente {
  readonly urlDoBanco: string;
  readonly urlDaApi: string;
  readonly hosts: { readonly painel: string; readonly admin: string; readonly cardapio: string };
  readonly chaveDaCifra: string;
}

const LOCAIS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]']);

function exigir(ambiente: NodeJS.ProcessEnv, nome: string): string {
  const valor = ambiente[nome];
  if (valor === undefined || valor === '') {
    throw new Error(`Defina ${nome} no .env (veja .env.exemplo).`);
  }
  return valor;
}

function urlDoBancoNoComputador(url: string): string {
  const lida = new URL(url);
  if (lida.hostname === 'postgres') {
    lida.hostname = '127.0.0.1';
  }
  return lida.toString();
}

// Semente só para a máquina de quem desenvolve: recusa qualquer banco ou API fora do computador.
export function lerAmbienteDaSemente(ambiente: NodeJS.ProcessEnv): AmbienteDaSemente {
  if (ambiente.APP_ENV !== 'local') {
    throw new Error('pnpm semear:local só roda com APP_ENV=local.');
  }
  const urlDoBanco = urlDoBancoNoComputador(
    ambiente.URL_BANCO_SEMENTE ?? exigir(ambiente, 'URL_BANCO_MIGRACAO'),
  );
  const urlDaApi = exigir(ambiente, 'URL_API_LOCAL');
  for (const url of [urlDoBanco, urlDaApi]) {
    if (!LOCAIS.has(new URL(url).hostname)) {
      throw new Error(`pnpm semear:local só aceita endereços locais; recebeu ${new URL(url).hostname}.`);
    }
  }
  return {
    urlDoBanco,
    urlDaApi,
    hosts: {
      painel: exigir(ambiente, 'DOMINIO_PAINEL'),
      admin: exigir(ambiente, 'DOMINIO_ADMIN'),
      cardapio: exigir(ambiente, 'DOMINIO_CARDAPIO'),
    },
    chaveDaCifra: exigir(ambiente, 'CHAVE_CIFRA_TOTP'),
  };
}
