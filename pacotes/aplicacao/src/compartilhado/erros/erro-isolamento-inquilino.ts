import { ErroAplicacao } from '@cardapio/dominio';

export class ErroIsolamentoInquilino extends ErroAplicacao {
  readonly nivel = 'fatal';
}
