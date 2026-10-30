import type { Relogio } from '../compartilhado/portas/relogio.ts';
import type { RelatorDeErros } from '../compartilhado/portas/relator-de-erros.ts';
import type { FilaDeJobs } from '../filas/portas/fila-de-jobs.ts';
import type { ContadorDeTentativasInvalidas } from '../mesas/portas/sessoes-de-mesa.ts';
import type {
  ChamadaDoProcessamento,
  EventosDePagamento,
  RegistroDeAvisos,
  RestaurantesParaCobranca,
  VerificadorDeAvisos,
} from './portas/eventos-de-pagamento.ts';
import type { GatewayPagamento } from './portas/gateway-pagamento.ts';
import type { RepositorioDeAssinaturas } from './portas/repositorio-de-assinaturas.ts';

export interface DependenciasDaAssinatura {
  readonly assinaturas: RepositorioDeAssinaturas;
  readonly gateway: GatewayPagamento;
  readonly relogio: Relogio;
  readonly urlDeRetorno: string;
}

export interface DependenciasDoAviso {
  readonly verificador: VerificadorDeAvisos;
  readonly avisos: RegistroDeAvisos;
  readonly processamento: ChamadaDoProcessamento;
  readonly tentativas: ContadorDeTentativasInvalidas;
  readonly relator: RelatorDeErros;
}

export interface DependenciasDoProcessamentoDePagamento {
  readonly assinaturas: RepositorioDeAssinaturas;
  readonly gateway: GatewayPagamento;
  readonly eventos: EventosDePagamento;
  readonly relator: RelatorDeErros;
  readonly relogio: Relogio;
}

export interface DependenciasDasRotinasDeCobranca {
  readonly assinaturas: RepositorioDeAssinaturas;
  readonly eventos: EventosDePagamento;
  readonly restaurantes: RestaurantesParaCobranca;
  readonly filas: FilaDeJobs;
  readonly relogio: Relogio;
}
