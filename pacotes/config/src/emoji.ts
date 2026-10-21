const PADRAO_EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}|\u{FE0F}|\u{20E3}/gu;

const SIMBOLOS_TIPOGRAFICOS_PERMITIDOS: ReadonlySet<string> = new Set(['©', '®', '™']);

export interface OcorrenciaEmoji {
  readonly caractere: string;
  readonly codigo: string;
  readonly indice: number;
}

function formatarCodigo(caractere: string): string {
  const ponto = caractere.codePointAt(0) ?? 0;
  return `U+${ponto.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function encontrarEmojis(texto: string): OcorrenciaEmoji[] {
  return [...texto.matchAll(PADRAO_EMOJI)]
    .filter((ocorrencia) => !SIMBOLOS_TIPOGRAFICOS_PERMITIDOS.has(ocorrencia[0]))
    .map((ocorrencia) => ({
      caractere: ocorrencia[0],
      codigo: formatarCodigo(ocorrencia[0]),
      indice: ocorrencia.index,
    }));
}

export function contemEmoji(texto: string): boolean {
  return encontrarEmojis(texto).length > 0;
}
