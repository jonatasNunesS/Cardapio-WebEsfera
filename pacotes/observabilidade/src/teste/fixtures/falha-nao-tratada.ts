import { criarLogger, definirLoggerPadrao, instalarTratadoresDeFalha } from '../../node/index.ts';

definirLoggerPadrao(criarLogger({ app: 'teste' }));
instalarTratadoresDeFalha();
void Promise.reject(new Error('promessa rejeitada sem tratamento'));
