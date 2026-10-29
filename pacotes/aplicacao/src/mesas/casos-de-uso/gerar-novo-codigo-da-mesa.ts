import { exigirCodigoDaMesa, Resultado, type ErroDeNegocio } from '@cardapio/dominio';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type { DependenciasDasMesas } from '../dependencias.ts';
import { autoriaDe, paraResultado, semPermissaoNaMesa } from '../desfechos.ts';
import type { MesaGuardada } from '../portas/repositorio-de-mesas.ts';

export async function gerarNovoCodigoDaMesa(
  dependencias: DependenciasDasMesas,
  acesso: AcessoAoRestaurante,
  mesaId: string,
): Promise<Resultado<MesaGuardada, ErroDeNegocio>> {
  const proibido = semPermissaoNaMesa(acesso);
  if (proibido !== undefined) {
    return Resultado.falha(proibido);
  }
  const trocar = () =>
    dependencias.mesas.trocarCodigo(
      acesso.restauranteId,
      mesaId,
      exigirCodigoDaMesa(dependencias.codigos.gerar()),
      autoriaDe(acesso),
    );
  const primeira = await trocar();
  return paraResultado(primeira.tipo === 'codigo-repetido' ? await trocar() : primeira);
}
