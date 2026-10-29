import {
  apagarOriginalDaMidia,
  descartarMidia,
  processarMidia,
  registrarFalhaDoProcessamento,
  type DependenciasDoProcessamento,
  type FilaDeJobs,
  type PedidoDeProcessamento,
} from '@cardapio/aplicacao';
import { JOBS } from '@cardapio/contratos';
import {
  armazenamentoDoAmbiente,
  criarProcessadorFfmpeg,
  criarRepositorioDeMidias,
  pastaTemporaria,
  type AcessoAoBanco,
  type ArmazenamentoS3,
  type Processador,
} from '@cardapio/infraestrutura';
import type { AmbienteWorker } from '../ambiente.ts';

export const ROTEAMENTO_DA_MIDIA = {
  MidiaEnviada: ['processar-midia'],
  MidiaDescartada: ['descartar-midia'],
} as const;

export interface MidiaDoWorker {
  readonly processadores: Readonly<Record<string, Processador>>;
  aoEsgotarTentativas(nome: string, dados: unknown): Promise<void>;
  encerrar(): void;
}

function pedidoDoJob(dados: unknown): PedidoDeProcessamento {
  const job = JOBS['processar-midia'].esquema.parse(dados);
  return {
    restauranteId: job.restauranteId ?? '',
    midiaId: job.carga.midiaId,
    tentativa: job.carga.tentativa,
  };
}

export function dependenciasDoProcessamento(
  ambiente: AmbienteWorker,
  banco: AcessoAoBanco,
  filas: FilaDeJobs,
  armazenamento: ArmazenamentoS3,
): DependenciasDoProcessamento {
  return {
    midias: criarRepositorioDeMidias(banco),
    armazenamento,
    filas,
    pasta: pastaTemporaria,
    processador: criarProcessadorFfmpeg({
      ffmpeg: ambiente.CAMINHO_FFMPEG,
      ffprobe: ambiente.CAMINHO_FFPROBE,
      prlimit: ambiente.CAMINHO_PRLIMIT === '' ? null : ambiente.CAMINHO_PRLIMIT,
      tempoMaximoMs: ambiente.TEMPO_MAXIMO_FFMPEG_S * 1000,
      memoriaMaximaBytes: ambiente.MEMORIA_MAXIMA_FFMPEG_MB * 1024 * 1024,
    }),
  };
}

export function processadoresDaMidia(
  dependencias: DependenciasDoProcessamento,
): MidiaDoWorker['processadores'] {
  return {
    'processar-midia': ({ dados }) => processarMidia(dependencias, pedidoDoJob(dados)),
    'descartar-midia': ({ dados }) => {
      const job = JOBS['descartar-midia'].esquema.parse(dados);
      return descartarMidia(dependencias, {
        restauranteId: job.restauranteId ?? '',
        midiaId: job.carga.midiaId,
      });
    },
    'apagar-original-midia': ({ dados }) => {
      const job = JOBS['apagar-original-midia'].esquema.parse(dados);
      return apagarOriginalDaMidia(dependencias, {
        restauranteId: job.restauranteId ?? '',
        midiaId: job.midiaId,
      });
    },
  };
}

export function comporMidia(
  ambiente: AmbienteWorker,
  banco: AcessoAoBanco,
  filas: FilaDeJobs,
): MidiaDoWorker {
  const armazenamento = armazenamentoDoAmbiente(ambiente);
  const dependencias = dependenciasDoProcessamento(ambiente, banco, filas, armazenamento);
  return {
    processadores: processadoresDaMidia(dependencias),
    async aoEsgotarTentativas(nome, dados) {
      if (nome === 'processar-midia') {
        await registrarFalhaDoProcessamento(dependencias, pedidoDoJob(dados));
      }
    },
    encerrar: () => {
      armazenamento.encerrar();
    },
  };
}
