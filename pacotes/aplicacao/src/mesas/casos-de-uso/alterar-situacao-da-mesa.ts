import { Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDasMesas } from '../dependencias.ts';
import { autoriaDe, paraResultado, semPermissaoNaMesa } from '../desfechos.ts';
import type { MesaGuardada } from '../portas/repositorio-de-mesas.ts';

export async function alterarSituacaoDaMesa(
  dependencias: DependenciasDasMesas,
  acesso: AcessoAoRestaurante,
  mesaId: string,
  ativa: boolean,
): Promise<Resultado<MesaGuardada, ErroDeNegocio>> {
  const proibido = semPermissaoNaMesa(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const limite = await dependencias.limite.limite(acesso.restauranteId);
  return paraResultado(
    await dependencias.mesas.alterarAtiva(acesso.restauranteId, mesaId, ativa, limite, autoriaDe(acesso)),
    limite,
  );
}
