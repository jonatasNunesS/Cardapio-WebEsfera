import { Resultado, validarNumeroDaMesa, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDasMesas } from '../dependencias.ts';
import { autoriaDe, paraResultado, semPermissaoNaMesa } from '../desfechos.ts';
import type { MesaGuardada } from '../portas/repositorio-de-mesas.ts';

export async function renumerarMesa(
  dependencias: DependenciasDasMesas,
  acesso: AcessoAoRestaurante,
  mesaId: string,
  numeroPedido: number,
): Promise<Resultado<MesaGuardada, ErroDeNegocio>> {
  const proibido = semPermissaoNaMesa(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const numero = validarNumeroDaMesa(numeroPedido);
  if (!numero.ok) {
    return numero;
  }
  return paraResultado(
    await dependencias.mesas.renumerar(acesso.restauranteId, mesaId, numero.valor, autoriaDe(acesso)),
  );
}
