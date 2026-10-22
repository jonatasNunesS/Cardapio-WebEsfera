import { z } from 'zod';

const texto = (maximo: number) => z.string().max(maximo);
const email = texto(320);
const senha = texto(512);
const urlOpcional = texto(500).nullable();

export const CABECALHO_CSRF = 'x-csrf-token';

export const ROTAS_DO_PAINEL = {
  csrf: '/api/v1/csrf',
  contas: '/api/v1/contas',
  sessao: '/api/v1/sessao',
  pedidoDeRedefinicao: '/api/v1/senha/redefinicao',
  confirmacaoDeRedefinicao: '/api/v1/senha/redefinicao/confirmacao',
  restaurante: '/api/v1/restaurante',
  personalizacao: '/api/v1/restaurante/personalizacao',
  horarios: '/api/v1/restaurante/horarios',
} as const;

export const ROTAS_DO_ADMIN = {
  csrf: '/api/v1/admin/csrf',
  sessao: '/api/v1/admin/sessao',
  segundoFator: '/api/v1/admin/sessao/segundo-fator',
  cadastroDoSegundoFator: '/api/v1/admin/segundo-fator/cadastro',
  confirmacaoDoCadastro: '/api/v1/admin/segundo-fator/cadastro/confirmacao',
  filas: '/api/v1/admin/filas',
} as const;

export const esquemaCriarConta = z.strictObject({ nome: texto(200), email, senha });
export const esquemaEntrar = z.strictObject({ email, senha });
export const esquemaPedirRedefinicao = z.strictObject({ email });
export const esquemaConfirmarRedefinicao = z.strictObject({ token: texto(200), senha });
export const esquemaCriarRestaurante = z.strictObject({ nome: texto(200) });

export const esquemaPublicarPersonalizacao = z.strictObject({
  corMarca: texto(20),
  logoUrl: urlOpcional,
  capaUrl: urlOpcional,
  frase: texto(1000),
  linkAvaliacaoGoogle: urlOpcional,
  textos: z.strictObject({
    boasVindas: texto(1000),
    aoChamarGarcom: texto(1000),
    restauranteFechado: texto(1000),
  }),
});

const hora = z.string().regex(/^\d{2}:\d{2}$/);

export const esquemaDefinirHorarios = z.strictObject({
  horarios: z
    .array(
      z.strictObject({
        diaSemana: z.literal([0, 1, 2, 3, 4, 5, 6]),
        abre: hora,
        fecha: hora,
      }),
    )
    .max(7),
});

export const esquemaEntrarComoAdmin = z.strictObject({ email, senha });
export const esquemaConfirmarSegundoFator = z.strictObject({ codigoDeVerificacao: texto(40) });
export const esquemaConcluirCadastroDoSegundoFator = z.strictObject({
  codigoDeVerificacao: texto(40),
  senhaNova: senha,
});

export type CorpoCriarConta = z.infer<typeof esquemaCriarConta>;
export type CorpoEntrar = z.infer<typeof esquemaEntrar>;
export type CorpoPedirRedefinicao = z.infer<typeof esquemaPedirRedefinicao>;
export type CorpoConfirmarRedefinicao = z.infer<typeof esquemaConfirmarRedefinicao>;
export type CorpoCriarRestaurante = z.infer<typeof esquemaCriarRestaurante>;
export type CorpoPublicarPersonalizacao = z.infer<typeof esquemaPublicarPersonalizacao>;
export type CorpoDefinirHorarios = z.infer<typeof esquemaDefinirHorarios>;
export type CorpoEntrarComoAdmin = z.infer<typeof esquemaEntrarComoAdmin>;
export type CorpoConfirmarSegundoFator = z.infer<typeof esquemaConfirmarSegundoFator>;
export type CorpoConcluirCadastroDoSegundoFator = z.infer<typeof esquemaConcluirCadastroDoSegundoFator>;

export interface RespostaCsrf {
  readonly token: string;
}

export interface RestauranteDaSessao {
  readonly nome: string;
  readonly slug: string;
  readonly situacao: string;
  readonly testeTerminaEm: string | null;
  readonly papel: string;
}

export interface RespostaSessaoDoPainel {
  readonly restaurante: RestauranteDaSessao | null;
}

export interface RespostaRestauranteCriado {
  readonly slug: string;
}

export interface RespostaPersonalizacao extends CorpoPublicarPersonalizacao {
  readonly corSobreMarca: string;
  readonly corMarcaTexto: string;
  readonly versao: number;
}

export interface RespostaEntradaDoAdmin {
  readonly proximoPasso: 'segundo_fator' | 'cadastro';
}

export interface RespostaCadastroIniciado {
  readonly segredo: string;
  readonly uriOtpauth: string;
}

export interface RespostaCadastroConcluido {
  readonly codigosDeRecuperacao: readonly string[];
}

export interface ProblemaDaApi {
  readonly status: number;
  readonly codigo: string;
  readonly detail: string;
  readonly id_rastreio: string;
  readonly detalhes?: Readonly<Record<string, unknown>>;
  readonly campos?: readonly { readonly campo: string; readonly motivo: string }[];
}
