import { CODIGOS } from '../compartilhado/codigos.ts';
import { criarErroDeNegocio, type ErroDeNegocio } from '../compartilhado/erro-de-negocio.ts';
import { Resultado } from '../compartilhado/resultado.ts';
import { contarCaracteres } from '../compartilhado/texto.ts';
import { criarDinheiro, type Dinheiro } from './dinheiro.ts';

export const LIMITES_DO_CARDAPIO = {
  nomeDaCategoria: 40,
  nomeDoPrato: 80,
  descricaoDoPrato: 400,
} as const;

export interface DadosDaCategoria {
  readonly nome: string;
}

export interface DadosDoPrato {
  readonly categoriaId: string;
  readonly nome: string;
  readonly descricao: string;
  readonly precoCentavos: number;
  readonly disponivel: boolean;
  readonly destaque: boolean;
}

export interface PratoValido extends Omit<DadosDoPrato, 'precoCentavos'> {
  readonly preco: Dinheiro;
}

function limparEspacos(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ');
}

function validarNome(nome: string, limite: number): Resultado<string, ErroDeNegocio> {
  const limpo = limparEspacos(nome);
  if (limpo === '' || contarCaracteres(limpo) > limite) {
    return Resultado.falha(
      criarErroDeNegocio(
        CODIGOS.CARDAPIO_EDITAR_NOME_INVALIDO,
        `Use um nome de 1 a ${String(limite)} caracteres.`,
        {
          campo: 'nome',
          limite,
        },
      ),
    );
  }
  return Resultado.ok(limpo);
}

export function validarCategoria(dados: DadosDaCategoria): Resultado<DadosDaCategoria, ErroDeNegocio> {
  return Resultado.mapear(validarNome(dados.nome, LIMITES_DO_CARDAPIO.nomeDaCategoria), (nome) => ({ nome }));
}

function validarDescricao(descricao: string): Resultado<string, ErroDeNegocio> {
  const limpa = descricao.trim();
  if (contarCaracteres(limpa) > LIMITES_DO_CARDAPIO.descricaoDoPrato) {
    return Resultado.falha(
      criarErroDeNegocio(
        CODIGOS.CARDAPIO_EDITAR_DESCRICAO_LONGA,
        `A descrição passou de ${String(LIMITES_DO_CARDAPIO.descricaoDoPrato)} caracteres.`,
        { campo: 'descricao', limite: LIMITES_DO_CARDAPIO.descricaoDoPrato },
      ),
    );
  }
  return Resultado.ok(limpa);
}

function validarPreco(centavos: number): Resultado<Dinheiro, ErroDeNegocio> {
  const preco = criarDinheiro(centavos);
  return preco.ok
    ? preco
    : Resultado.falha(
        criarErroDeNegocio(CODIGOS.CARDAPIO_EDITAR_PRECO_INVALIDO, 'Informe um preço válido.', {
          campo: 'precoCentavos',
        }),
      );
}

export function validarPrato(dados: DadosDoPrato): Resultado<PratoValido, ErroDeNegocio> {
  const nome = validarNome(dados.nome, LIMITES_DO_CARDAPIO.nomeDoPrato);
  if (!nome.ok) {
    return nome;
  }
  const descricao = validarDescricao(dados.descricao);
  if (!descricao.ok) {
    return descricao;
  }
  const preco = validarPreco(dados.precoCentavos);
  if (!preco.ok) {
    return preco;
  }
  return Resultado.ok({
    categoriaId: dados.categoriaId,
    nome: nome.valor,
    descricao: descricao.valor,
    preco: preco.valor,
    disponivel: dados.disponivel,
    destaque: dados.destaque,
  });
}
