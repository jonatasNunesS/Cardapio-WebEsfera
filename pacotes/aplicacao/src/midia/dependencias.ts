import type { FilaDeJobs } from '../filas/portas/fila-de-jobs.ts';
import type { ArmazenamentoDeMidia } from './portas/armazenamento-de-midia.ts';
import type { PastaTemporaria, ProcessadorDeMidia } from './portas/processador-de-midia.ts';
import type { RepositorioDeMidias } from './portas/repositorio-de-midias.ts';

export interface DependenciasDaMidia {
  readonly midias: RepositorioDeMidias;
  readonly armazenamento: ArmazenamentoDeMidia;
}

export interface DependenciasDoProcessamento extends DependenciasDaMidia {
  readonly processador: ProcessadorDeMidia;
  readonly pasta: PastaTemporaria;
  readonly filas: FilaDeJobs;
}
