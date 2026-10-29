import type { FormatoDeImagem } from './caminhos.ts';

export interface ArquivoDerivado {
  readonly caminho: string;
  readonly bytes: number;
}

export interface VarianteDaImagem extends ArquivoDerivado {
  readonly formato: FormatoDeImagem;
  readonly largura: number;
}

export interface ImagemResponsiva {
  readonly largura: number;
  readonly altura: number;
  readonly variantes: readonly VarianteDaImagem[];
}

export interface DerivadosDaFoto {
  readonly tipo: 'foto';
  readonly imagem: ImagemResponsiva;
}

export interface DerivadosDoVideo {
  readonly tipo: 'video';
  readonly imagem: ImagemResponsiva;
  readonly capa: ArquivoDerivado;
  readonly mp4: ArquivoDerivado;
  readonly webm: ArquivoDerivado;
  readonly duracaoMs: number;
}

export type Derivados = DerivadosDaFoto | DerivadosDoVideo;
