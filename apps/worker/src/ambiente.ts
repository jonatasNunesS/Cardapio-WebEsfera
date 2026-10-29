import { camposDoArmazenamento, esquemaAmbienteBase } from '@cardapio/config';
import { z } from 'zod';

export const esquemaAmbienteWorker = esquemaAmbienteBase.extend({
  URL_BANCO_WORKER: z.url(),
  URL_REDIS: z.url(),
  ...camposDoArmazenamento,
  CAMINHO_FFMPEG: z.string().min(1).default('ffmpeg'),
  CAMINHO_FFPROBE: z.string().min(1).default('ffprobe'),
  CAMINHO_PRLIMIT: z.string().default('prlimit'),
  TEMPO_MAXIMO_FFMPEG_S: z.coerce.number().int().min(10).max(600).default(120),
  MEMORIA_MAXIMA_FFMPEG_MB: z.coerce.number().int().min(256).max(8192).default(1536),
});

export type AmbienteWorker = z.output<typeof esquemaAmbienteWorker>;
