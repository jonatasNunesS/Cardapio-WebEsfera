import { z } from 'zod';

export const LIMITES_DA_MIDIA_NA_API = {
  tamanhoMaximoBytes: 100 * 1024 * 1024,
  tiposDeConteudo: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'],
} as const;

export const ROTAS_DA_MIDIA_NO_PAINEL = {
  midiasDoPrato: '/api/v1/cardapio/pratos/:id/midias',
  midiaDoPrato: '/api/v1/cardapio/pratos/:id/midia',
  confirmacao: '/api/v1/cardapio/midias/:id/confirmacao',
  novaTentativa: '/api/v1/cardapio/midias/:id/nova-tentativa',
} as const;

export const esquemaPedidoDeEnvio = z.strictObject({
  tipoConteudo: z.string().trim().min(1).max(100),
  tamanhoBytes: z.number().int().positive().max(LIMITES_DA_MIDIA_NA_API.tamanhoMaximoBytes),
});

export type CorpoPedidoDeEnvio = z.infer<typeof esquemaPedidoDeEnvio>;

export type SituacaoDaMidiaNaApi = 'enviando' | 'processando' | 'pronta' | 'falhou';

export type MotivoDaFalhaNaApi =
  | 'tipo_nao_reconhecido'
  | 'tipo_divergente'
  | 'sem_video'
  | 'longo_demais'
  | 'resolucao_invalida'
  | 'derivado_grande_demais'
  | 'erro_no_processamento';

export const MENSAGENS_DA_FALHA: Readonly<Record<MotivoDaFalhaNaApi, string>> = {
  tipo_nao_reconhecido: 'Não reconhecemos o arquivo como foto ou vídeo.',
  tipo_divergente: 'O conteúdo do arquivo não corresponde ao tipo informado.',
  sem_video: 'O arquivo não tem imagem de vídeo (só áudio).',
  longo_demais: 'O vídeo passa de 60 segundos. Corte antes de enviar.',
  resolucao_invalida: 'A resolução do arquivo está fora do aceito.',
  derivado_grande_demais: 'Não conseguimos deixar o vídeo leve o bastante. Tente um trecho mais simples.',
  erro_no_processamento: 'Algo deu errado ao processar. Tente de novo.',
};

export interface RespostaPedidoDeEnvio {
  readonly midiaId: string;
  readonly url: string;
  readonly metodo: 'PUT';
  readonly cabecalhos: Readonly<Record<string, string>>;
  readonly expiraEm: string;
}

export interface ImagemPublica {
  readonly largura: number;
  readonly altura: number;
  readonly src: string;
  readonly avif: string;
  readonly webp: string;
}

export interface VideoPublico {
  readonly capa: string;
  readonly mp4: string;
  readonly webm: string;
  readonly duracaoMs: number;
}

export interface MidiaPublica {
  readonly tipo: 'foto' | 'video';
  readonly imagem: ImagemPublica;
  readonly video: VideoPublico | null;
}

export interface MidiaNoPainel {
  readonly id: string;
  readonly tipo: 'foto' | 'video';
  readonly situacao: SituacaoDaMidiaNaApi;
  readonly motivoFalha: MotivoDaFalhaNaApi | null;
  readonly publicada: MidiaPublica | null;
}

export interface RespostaMidiasDoPrato {
  readonly atual: MidiaNoPainel | null;
  readonly pendente: MidiaNoPainel | null;
}
