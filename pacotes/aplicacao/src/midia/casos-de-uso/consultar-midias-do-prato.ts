import {
  Resultado,
  type ErroDeNegocio,
  type MotivoDaRecusa,
  type SituacaoDaMidia,
  type TipoDeMidia,
} from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDaMidia } from '../dependencias.ts';
import { PRATO_NAO_ENCONTRADO, semPermissaoNaMidia } from '../desfechos.ts';
import type { MidiaRegistrada } from '../portas/repositorio-de-midias.ts';
import { midiaPublicada, type EnderecosDeMidia, type MidiaPublicada } from '../publicacao.ts';

export interface MidiaParaOPainel {
  readonly id: string;
  readonly tipo: TipoDeMidia;
  readonly situacao: SituacaoDaMidia;
  readonly motivoFalha: MotivoDaRecusa | null;
  readonly publicada: MidiaPublicada | null;
}

export interface MidiasDoPratoParaOPainel {
  readonly atual: MidiaParaOPainel | null;
  readonly pendente: MidiaParaOPainel | null;
}

function paraOPainel(midia: MidiaRegistrada | null, enderecos: EnderecosDeMidia): MidiaParaOPainel | null {
  if (midia === null) {
    return null;
  }
  return {
    id: midia.id,
    tipo: midia.tipo,
    situacao: midia.situacao,
    motivoFalha: midia.motivoFalha,
    publicada: midia.derivados === null ? null : midiaPublicada(midia.derivados, enderecos),
  };
}

export async function consultarMidiasDoPrato(
  dependencias: DependenciasDaMidia,
  acesso: AcessoAoRestaurante,
  pratoId: string,
): Promise<Resultado<MidiasDoPratoParaOPainel, ErroDeNegocio>> {
  const proibido = semPermissaoNaMidia(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const midias = await dependencias.midias.listarDoPrato(acesso.restauranteId, pratoId);
  if (midias === null) {
    return Resultado.falha(PRATO_NAO_ENCONTRADO);
  }
  return Resultado.ok({
    atual: paraOPainel(midias.atual, dependencias.armazenamento),
    pendente: paraOPainel(midias.pendente, dependencias.armazenamento),
  });
}
