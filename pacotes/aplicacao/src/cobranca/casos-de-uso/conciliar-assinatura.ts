import type { DependenciasDoProcessamentoDePagamento } from '../dependencias.ts';
import { aplicarConsulta } from './processar-evento-pagamento.ts';

export type DesfechoDaConciliacao =
  'sem-assinatura' | 'recurso-inexistente' | 'referencia-invalida' | 'aplicado' | 'sem-mudanca';

export async function conciliarAssinatura(
  dependencias: Omit<DependenciasDoProcessamentoDePagamento, 'eventos' | 'relator'>,
  restauranteId: string,
): Promise<DesfechoDaConciliacao> {
  const atual = await dependencias.assinaturas.assinaturaAtual(restauranteId);
  if (atual === null) {
    return 'sem-assinatura';
  }
  const [assinatura, cobrancas] = await Promise.all([
    dependencias.gateway.consultarAssinatura(atual.mpAssinaturaId),
    dependencias.gateway.listarCobrancas(atual.mpAssinaturaId),
  ]);
  if (assinatura === null) {
    return 'recurso-inexistente';
  }
  if (assinatura.referenciaExterna !== restauranteId) {
    return 'referencia-invalida';
  }
  return aplicarConsulta(dependencias, { assinatura, cobrancas }, 'conciliarAssinatura');
}
