import type { ConfiguracaoDoArmazenamento } from '../armazenamento-s3.ts';

export const ARMAZENAMENTO_DE_TESTE: ConfiguracaoDoArmazenamento = {
  endpoint: process.env.URL_ARMAZENAMENTO_TESTE ?? 'http://127.0.0.1:3900',
  regiao: 'garage',
  chave: process.env.CHAVE_ARMAZENAMENTO_TESTE ?? 'GKabababababababababababab',
  segredo:
    process.env.SEGREDO_ARMAZENAMENTO_TESTE ??
    'cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd',
  bucketOriginais: 'midia-originais',
  bucketPublico: 'midia-publica',
  urlPublica: process.env.URL_PUBLICA_MIDIA_TESTE ?? 'http://midia-publica.web.localhost:3902',
};

export const ENDERECO_WEB_DE_TESTE = { host: '127.0.0.1', porta: 3902 } as const;

export const VARIAVEIS_DO_ARMAZENAMENTO_DE_TESTE = {
  URL_ARMAZENAMENTO: ARMAZENAMENTO_DE_TESTE.endpoint,
  REGIAO_ARMAZENAMENTO: ARMAZENAMENTO_DE_TESTE.regiao,
  CHAVE_ARMAZENAMENTO: ARMAZENAMENTO_DE_TESTE.chave,
  SEGREDO_ARMAZENAMENTO: ARMAZENAMENTO_DE_TESTE.segredo,
  BUCKET_ORIGINAIS: ARMAZENAMENTO_DE_TESTE.bucketOriginais,
  BUCKET_PUBLICO: ARMAZENAMENTO_DE_TESTE.bucketPublico,
  URL_PUBLICA_MIDIA: ARMAZENAMENTO_DE_TESTE.urlPublica,
} as const;
