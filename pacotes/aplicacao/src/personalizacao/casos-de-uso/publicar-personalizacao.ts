import {
  CODIGOS,
  criarErroDeNegocio,
  criarPersonalizacao,
  Resultado,
  type DadosDaPersonalizacao,
  type ErroDeNegocio,
} from '@cardapio/dominio';
import { podeGerir, type AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type {
  PersonalizacaoGuardada,
  RepositorioDePersonalizacao,
} from '../portas/repositorio-de-personalizacao.ts';

export async function publicarPersonalizacao(
  dependencias: { readonly personalizacoes: RepositorioDePersonalizacao },
  acesso: AcessoAoRestaurante,
  dados: DadosDaPersonalizacao,
): Promise<Resultado<PersonalizacaoGuardada, ErroDeNegocio>> {
  if (!podeGerir(acesso)) {
    return Resultado.falha(
      criarErroDeNegocio(
        CODIGOS.PERSONALIZACAO_PUBLICAR_SEM_PERMISSAO,
        'Só o dono ou o gerente publica a personalização.',
      ),
    );
  }
  const personalizacao = criarPersonalizacao(dados);
  if (!personalizacao.ok) {
    return personalizacao;
  }
  const { cor, ...resto } = personalizacao.valor;
  const publicada = {
    ...resto,
    corMarca: cor.cor,
    corSobreMarca: cor.corSobreMarca,
    corMarcaTexto: cor.corMarcaTexto,
  };
  const versao = await dependencias.personalizacoes.publicar(acesso.restauranteId, publicada);
  return Resultado.ok({ ...publicada, versao });
}
