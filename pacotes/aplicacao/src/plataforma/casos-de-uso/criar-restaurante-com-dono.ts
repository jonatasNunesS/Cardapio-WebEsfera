import {
  CODIGOS,
  criarErroDeNegocio,
  ehEmailValido,
  normalizarEmail,
  prepararNovoRestaurante,
  Resultado,
  validarSlugDoAdmin,
  type ErroDeNegocio,
} from '@cardapio/dominio';
import { personalizacaoPadrao } from '../../personalizacao/personalizacao-padrao.ts';
import { novoConvite } from '../convite.ts';
import type { DependenciasDaPlataforma } from '../dependencias.ts';
import { SEM_PERMISSAO } from '../falhas.ts';
import type { AcessoDoAdmin, DesfechoDaCriacaoPeloAdmin } from '../portas/repositorio-da-plataforma.ts';

export interface EntradaDoNovoRestaurante {
  readonly nome: string;
  readonly slug: string;
  readonly emailDoDono: string;
}

export interface RestauranteCriadoPeloAdmin {
  readonly slug: string;
  readonly linkDoConvite: string | null;
}

const FALHAS: Readonly<Record<Exclude<DesfechoDaCriacaoPeloAdmin, 'criado'>, ErroDeNegocio>> = {
  'slug-ocupado': criarErroDeNegocio(CODIGOS.PLATAFORMA_CRIAR_SLUG_OCUPADO, 'Este endereço já está em uso.', {
    campo: 'slug',
  }),
  'email-ocupado': criarErroDeNegocio(
    CODIGOS.PLATAFORMA_CRIAR_EMAIL_OCUPADO,
    'Já existe uma conta com este e-mail. Use outro e-mail para o dono.',
    { campo: 'emailDoDono' },
  ),
  proibido: SEM_PERMISSAO,
};

function validarEmailDoDono(texto: string): Resultado<string, ErroDeNegocio> {
  return ehEmailValido(texto)
    ? Resultado.ok(normalizarEmail(texto))
    : Resultado.falha(
        criarErroDeNegocio(CODIGOS.PLATAFORMA_CRIAR_EMAIL_OCUPADO, 'Informe um e-mail válido.', {
          campo: 'emailDoDono',
        }),
      );
}

export async function criarRestauranteComDono(
  dependencias: DependenciasDaPlataforma,
  acesso: AcessoDoAdmin,
  entrada: EntradaDoNovoRestaurante,
): Promise<Resultado<RestauranteCriadoPeloAdmin, ErroDeNegocio>> {
  const agora = dependencias.relogio.agora();
  const restaurante = prepararNovoRestaurante(entrada.nome, agora);
  const slug = validarSlugDoAdmin(entrada.slug);
  const email = validarEmailDoDono(entrada.emailDoDono);
  if (!restaurante.ok) {
    return restaurante;
  }
  if (!slug.ok) {
    return slug;
  }
  if (!email.ok) {
    return email;
  }
  const { convite, link } = novoConvite(dependencias, agora);
  const desfecho = await dependencias.plataforma.criar(
    acesso,
    {
      nome: restaurante.valor.nome,
      slug: slug.valor,
      testeTerminaEm: restaurante.valor.testeTerminaEm,
      dono: {
        nome: restaurante.valor.nome,
        email: email.valor,
        hashSenhaInutil: await dependencias.cofre.resumir(dependencias.segredos.token()),
      },
      personalizacao: personalizacaoPadrao(),
      convite,
    },
    agora,
  );
  if (desfecho !== 'criado') {
    return Resultado.falha(FALHAS[desfecho]);
  }
  const entrega = await dependencias.enviador.enviar({
    nome: restaurante.valor.nome,
    email: email.valor,
    link,
    expiraEm: convite.expiraEm,
  });
  return Resultado.ok({ slug: slug.valor, linkDoConvite: entrega.linkParaOAdmin });
}
