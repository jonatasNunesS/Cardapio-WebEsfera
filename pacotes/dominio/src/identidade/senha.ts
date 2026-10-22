import { CODIGOS } from '../compartilhado/codigos.ts';
import { contarCaracteres } from '../compartilhado/texto.ts';
import { criarErroDeNegocio, type ErroDeNegocio } from '../compartilhado/erro-de-negocio.ts';
import { Resultado } from '../compartilhado/resultado.ts';

export const TAMANHO_MINIMO_DA_SENHA = 10;
export const TAMANHO_MAXIMO_DA_SENHA = 128;

export function validarFormatoDaSenha(senha: string): Resultado<string, ErroDeNegocio> {
  const tamanho = contarCaracteres(senha);
  if (tamanho < TAMANHO_MINIMO_DA_SENHA) {
    return Resultado.falha(
      criarErroDeNegocio(
        CODIGOS.CONTA_SENHA_CURTA_DEMAIS,
        `A senha precisa ter pelo menos ${String(TAMANHO_MINIMO_DA_SENHA)} caracteres.`,
        { campo: 'senha' },
      ),
    );
  }
  if (tamanho > TAMANHO_MAXIMO_DA_SENHA) {
    return Resultado.falha(
      criarErroDeNegocio(
        CODIGOS.CONTA_SENHA_LONGA_DEMAIS,
        `A senha pode ter até ${String(TAMANHO_MAXIMO_DA_SENHA)} caracteres.`,
        { campo: 'senha' },
      ),
    );
  }
  return Resultado.ok(senha);
}
