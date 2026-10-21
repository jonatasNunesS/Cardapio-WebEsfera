import type { RelatorDeErros } from '@cardapio/aplicacao';
import { registrarPasso, reportarErro } from './reportar-erro.ts';

export const relatorDeErrosSentry: RelatorDeErros = {
  reportar: reportarErro,
  registrarPasso,
};
