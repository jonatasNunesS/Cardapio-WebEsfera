import { Resultado } from '../compartilhado/resultado.ts';
import { LIMITES_DA_MIDIA, type TipoDeMidia } from './midia.ts';

export type MotivoDaRecusa =
  | 'tipo_nao_reconhecido'
  | 'tipo_divergente'
  | 'sem_video'
  | 'longo_demais'
  | 'resolucao_invalida'
  | 'derivado_grande_demais'
  | 'erro_no_processamento';

export interface SondaDeVideo {
  readonly tipo: 'video';
  readonly formato: string;
  readonly temVideo: boolean;
  readonly duracaoMs: number | null;
  readonly largura: number;
  readonly altura: number;
}

export interface SondaDeFoto {
  readonly tipo: 'foto';
  readonly formato: string;
  readonly largura: number;
  readonly altura: number;
}

export type SondaDoArquivo = SondaDeVideo | SondaDeFoto;

export interface PlanoDeVideo {
  readonly tipo: 'video';
  readonly duracaoMs: number;
  readonly cortar: boolean;
}

export interface PlanoDeFoto {
  readonly tipo: 'foto';
  readonly larguras: readonly number[];
}

export type PlanoDeProcessamento = PlanoDeVideo | PlanoDeFoto;

export const LARGURAS_DAS_IMAGENS = [320, 640, 960, 1280] as const;

const FORMATOS_DE_VIDEO = ['mov', 'mp4', 'webm', 'matroska'];
const FORMATOS_DE_FOTO = ['jpeg', 'png', 'webp'];

function formatoAceito(sonda: SondaDoArquivo): boolean {
  if (sonda.tipo === 'foto') {
    return FORMATOS_DE_FOTO.includes(sonda.formato);
  }
  return sonda.formato.split(',').some((parte) => FORMATOS_DE_VIDEO.includes(parte.trim()));
}

function resolucaoValida(sonda: SondaDoArquivo): boolean {
  const lado = LIMITES_DA_MIDIA.ladoMaximoDaFoto;
  return sonda.largura >= 16 && sonda.altura >= 16 && sonda.largura <= lado && sonda.altura <= lado;
}

export function largurasDaImagem(larguraOriginal: number): readonly number[] {
  const cabem = LARGURAS_DAS_IMAGENS.filter((largura) => largura <= larguraOriginal);
  return cabem.length > 0 ? cabem : [larguraOriginal];
}

function planejarVideo(sonda: SondaDeVideo): Resultado<PlanoDeVideo, MotivoDaRecusa> {
  if (sonda.duracaoMs === null || sonda.duracaoMs <= 0) {
    return Resultado.falha('tipo_nao_reconhecido');
  }
  if (sonda.duracaoMs > LIMITES_DA_MIDIA.duracaoMaximaDeEntradaMs) {
    return Resultado.falha('longo_demais');
  }
  const limite = LIMITES_DA_MIDIA.duracaoMaximaDoVideoMs;
  return Resultado.ok({
    tipo: 'video',
    duracaoMs: Math.min(sonda.duracaoMs, limite),
    cortar: sonda.duracaoMs > limite,
  });
}

export function planejarProcessamento(
  tipoDeclarado: TipoDeMidia,
  sonda: SondaDoArquivo | null,
): Resultado<PlanoDeProcessamento, MotivoDaRecusa> {
  if (sonda === null || !formatoAceito(sonda)) {
    return Resultado.falha('tipo_nao_reconhecido');
  }
  if (sonda.tipo !== tipoDeclarado) {
    return Resultado.falha('tipo_divergente');
  }
  if (sonda.tipo === 'video' && !sonda.temVideo) {
    return Resultado.falha('sem_video');
  }
  if (!resolucaoValida(sonda)) {
    return Resultado.falha('resolucao_invalida');
  }
  if (sonda.tipo === 'video') {
    return planejarVideo(sonda);
  }
  return Resultado.ok({ tipo: 'foto', larguras: largurasDaImagem(sonda.largura) });
}
