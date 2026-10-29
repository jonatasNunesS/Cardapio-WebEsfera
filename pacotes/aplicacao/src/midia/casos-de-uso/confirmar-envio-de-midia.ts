import { Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDaMidia } from '../dependencias.ts';
import {
  ARQUIVO_AUSENTE,
  ARQUIVO_DIVERGENTE,
  MIDIA_NAO_ENCONTRADA,
  SITUACAO_INVALIDA,
  semPermissaoNaMidia,
} from '../desfechos.ts';
import type { MidiaRegistrada } from '../portas/repositorio-de-midias.ts';

async function conferirArquivo(
  dependencias: DependenciasDaMidia,
  midia: MidiaRegistrada,
): Promise<ErroDeNegocio | undefined> {
  const objeto = await dependencias.armazenamento.consultar('originais', midia.caminhoOriginal);
  if (objeto === null) {
    return ARQUIVO_AUSENTE;
  }
  const tipoBate = objeto.tipoConteudo === null || objeto.tipoConteudo.toLowerCase() === midia.tipoConteudo;
  return objeto.tamanhoBytes === midia.tamanhoBytes && tipoBate ? undefined : ARQUIVO_DIVERGENTE;
}

export async function confirmarEnvioDeMidia(
  dependencias: DependenciasDaMidia,
  acesso: AcessoAoRestaurante,
  midiaId: string,
): Promise<Resultado<null, ErroDeNegocio>> {
  const proibido = semPermissaoNaMidia(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const midia = await dependencias.midias.obter(acesso.restauranteId, midiaId);
  if (midia === null || midia.descartada) {
    return Resultado.falha(MIDIA_NAO_ENCONTRADA);
  }
  if (midia.situacao !== 'enviando') {
    return Resultado.falha(SITUACAO_INVALIDA);
  }
  const problema = await conferirArquivo(dependencias, midia);
  if (problema !== undefined) {
    return Resultado.falha(problema);
  }
  const tentativa = await dependencias.midias.solicitarProcessamento(
    acesso.restauranteId,
    midiaId,
    'enviando',
  );
  return tentativa === null ? Resultado.falha(SITUACAO_INVALIDA) : Resultado.ok(null);
}
