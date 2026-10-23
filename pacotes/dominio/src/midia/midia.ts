import { CODIGOS } from '../compartilhado/codigos.ts';
import { criarErroDeNegocio, type ErroDeNegocio } from '../compartilhado/erro-de-negocio.ts';
import { Resultado } from '../compartilhado/resultado.ts';

export type TipoDeMidia = 'foto' | 'video';

export type SituacaoDaMidia = 'enviando' | 'processando' | 'pronta' | 'falhou';

const MEGABYTE = 1024 * 1024;

export const LIMITES_DA_MIDIA = {
  tamanhoMaximoBytes: 100 * MEGABYTE,
  duracaoMaximaDeEntradaMs: 60_000,
  duracaoMaximaDoVideoMs: 10_000,
  tamanhoMaximoDoDerivadoBytes: 600 * 1024,
  alturaMaximaDoVideo: 720,
  ladoMaximoDaFoto: 8000,
  validadeDaUrlDeEnvioS: 600,
  diasAteApagarOOriginal: 7,
} as const;

export const TIPOS_DE_CONTEUDO_ACEITOS: Readonly<Record<string, TipoDeMidia>> = {
  'image/jpeg': 'foto',
  'image/png': 'foto',
  'image/webp': 'foto',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
};

export interface PedidoDeEnvio {
  readonly tipoConteudo: string;
  readonly tamanhoBytes: number;
}

export interface EnvioValido {
  readonly tipo: TipoDeMidia;
  readonly tipoConteudo: string;
  readonly tamanhoBytes: number;
}

function tipoRecusado(tipoConteudo: string): ErroDeNegocio {
  return criarErroDeNegocio(
    CODIGOS.MIDIA_ENVIAR_TIPO_RECUSADO,
    'Envie uma foto (JPEG, PNG ou WebP) ou um vídeo (MP4, MOV ou WebM).',
    { campo: 'tipoConteudo', recebido: tipoConteudo },
  );
}

function tamanhoRecusado(): ErroDeNegocio {
  return criarErroDeNegocio(CODIGOS.MIDIA_ENVIAR_TAMANHO_RECUSADO, 'O arquivo precisa ter até 100 MB.', {
    campo: 'tamanhoBytes',
    limite: LIMITES_DA_MIDIA.tamanhoMaximoBytes,
  });
}

export function validarEnvio(pedido: PedidoDeEnvio): Resultado<EnvioValido, ErroDeNegocio> {
  const tipoConteudo = pedido.tipoConteudo.trim().toLowerCase();
  const tipo = TIPOS_DE_CONTEUDO_ACEITOS[tipoConteudo];
  if (tipo === undefined) {
    return Resultado.falha(tipoRecusado(pedido.tipoConteudo));
  }
  const { tamanhoBytes } = pedido;
  if (
    !Number.isSafeInteger(tamanhoBytes) ||
    tamanhoBytes <= 0 ||
    tamanhoBytes > LIMITES_DA_MIDIA.tamanhoMaximoBytes
  ) {
    return Resultado.falha(tamanhoRecusado());
  }
  return Resultado.ok({ tipo, tipoConteudo, tamanhoBytes });
}
