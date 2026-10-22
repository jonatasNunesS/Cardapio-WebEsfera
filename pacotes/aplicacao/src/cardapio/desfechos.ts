import { CODIGOS, criarErroDeNegocio, Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import { podeGerir, type AcessoAoRestaurante } from '../compartilhado/acesso.ts';
import type { Desfecho } from './portas/repositorio-do-cardapio.ts';

const MENSAGENS: Readonly<Record<Exclude<Desfecho<unknown>['tipo'], 'ok'>, [string, string]>> = {
  conflito: [
    CODIGOS.CARDAPIO_EDITAR_CONFLITO_DE_VERSAO,
    'Alguém mudou este item enquanto você editava. A tela foi atualizada; confira e salve de novo.',
  ],
  'nao-encontrado': [CODIGOS.CARDAPIO_EDITAR_NAO_ENCONTRADO, 'Este item não existe mais no cardápio.'],
  'nome-repetido': [CODIGOS.CARDAPIO_EDITAR_NOME_REPETIDO, 'Já existe uma categoria com esse nome.'],
  'com-pratos': [
    CODIGOS.CARDAPIO_REMOVER_CATEGORIA_COM_PRATOS,
    'A categoria ainda tem pratos. Mova ou remova os pratos antes.',
  ],
  'categoria-inexistente': [CODIGOS.CARDAPIO_EDITAR_NAO_ENCONTRADO, 'A categoria escolhida não existe mais.'],
};

export function paraResultado<T>(desfecho: Desfecho<T>): Resultado<T, ErroDeNegocio> {
  if (desfecho.tipo === 'ok') {
    return Resultado.ok(desfecho.valor);
  }
  const [codigo, mensagem] = MENSAGENS[desfecho.tipo];
  return Resultado.falha(criarErroDeNegocio(codigo, mensagem));
}

export function semPermissao(acesso: AcessoAoRestaurante): ErroDeNegocio | undefined {
  return podeGerir(acesso)
    ? undefined
    : criarErroDeNegocio(CODIGOS.CARDAPIO_EDITAR_SEM_PERMISSAO, 'Só o dono ou o gerente muda o cardápio.');
}
