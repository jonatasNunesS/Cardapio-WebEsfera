export const COLETA_SEM_DADO_PESSOAL = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
} as const;

export type AmbienteApp = 'local' | 'preview' | 'homologacao' | 'producao';

export function amostragemPadrao(ambiente: AmbienteApp): number {
  return ambiente === 'local' || ambiente === 'preview' ? 1 : 0.1;
}
