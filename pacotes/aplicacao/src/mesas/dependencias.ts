import type { CartoesDeQr, LeituraDeMesasDoAdmin } from './portas/cartoes-de-qr.ts';
import type {
  GeradorDeCodigoDeMesa,
  LimiteDeMesas,
  RepositorioDeMesas,
} from './portas/repositorio-de-mesas.ts';
import type { RepositorioMesas } from './portas/repositorio-mesas.ts';
import type { ContadorDeTentativasInvalidas, SessoesDeMesa } from './portas/sessoes-de-mesa.ts';
import type { Relogio } from '../compartilhado/portas/relogio.ts';
import type { RelatorDeErros } from '../compartilhado/portas/relator-de-erros.ts';

export interface DependenciasDasMesas {
  readonly mesas: RepositorioDeMesas;
  readonly limite: LimiteDeMesas;
  readonly codigos: GeradorDeCodigoDeMesa;
  readonly cartoes: CartoesDeQr;
  readonly urlDoCardapio: string;
}

export interface DependenciasDaSessaoDeMesa {
  readonly resolucao: RepositorioMesas;
  readonly sessoes: SessoesDeMesa;
  readonly tentativas: ContadorDeTentativasInvalidas;
  readonly relator: RelatorDeErros;
  readonly relogio: Relogio;
}

export interface DependenciasDoAdminDeMesas {
  readonly leitura: LeituraDeMesasDoAdmin;
  readonly urlDoCardapio: string;
}
