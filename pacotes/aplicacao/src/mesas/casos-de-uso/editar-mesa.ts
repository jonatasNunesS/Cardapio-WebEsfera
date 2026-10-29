import { Resultado, validarDadosDaMesa, type DadosDaMesa, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDasMesas } from '../dependencias.ts';
import { autoriaDe, paraResultado, semPermissaoNaMesa } from '../desfechos.ts';
import type { MesaGuardada } from '../portas/repositorio-de-mesas.ts';

export async function editarMesa(
  dependencias: DependenciasDasMesas,
  acesso: AcessoAoRestaurante,
  mesaId: string,
  pedido: DadosDaMesa,
): Promise<Resultado<MesaGuardada, ErroDeNegocio>> {
  const proibido = semPermissaoNaMesa(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const dados = validarDadosDaMesa(pedido);
  if (!dados.ok) {
    return dados;
  }
  return paraResultado(
    await dependencias.mesas.editar(acesso.restauranteId, mesaId, dados.valor, autoriaDe(acesso)),
  );
}
