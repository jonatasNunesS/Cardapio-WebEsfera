import { CODIGOS } from '../compartilhado/codigos.ts';
import { criarErroDeNegocio, type ErroDeNegocio } from '../compartilhado/erro-de-negocio.ts';
import { ErroInvarianteDominio } from '../compartilhado/erro-invariante-dominio.ts';
import { Resultado } from '../compartilhado/resultado.ts';
import { contarCaracteres } from '../compartilhado/texto.ts';

// Teto do plano Pro; o M10 troca pela leitura do plano da assinatura: docs/adr/0012-mesas-e-qr.md
export const LIMITE_MESAS_TESTE = 30;

export const LIMITES_DA_MESA = {
  numeroMinimo: 1,
  numeroMaximo: 999,
  nome: 60,
  area: 60,
  bytesDoCodigo: 16,
} as const;

export const PADRAO_DO_CODIGO_DA_MESA = /^[A-Za-z0-9_-]{22}$/;

export const DURACAO_DA_SESSAO_DE_MESA_MS = 4 * 60 * 60 * 1000;

export interface DadosDaMesa {
  readonly nome: string | null;
  readonly area: string | null;
}

function textoOpcional(
  texto: string | null,
  limite: number,
  campo: string,
): Resultado<string | null, ErroDeNegocio> {
  const limpo = texto?.trim().replace(/\s+/g, ' ') ?? '';
  if (contarCaracteres(limpo) > limite) {
    return Resultado.falha(
      criarErroDeNegocio(CODIGOS.MESA_EDITAR_TEXTO_LONGO, `Use até ${String(limite)} caracteres.`, {
        campo,
        limite,
      }),
    );
  }
  return Resultado.ok(limpo === '' ? null : limpo);
}

export function validarNumeroDaMesa(numero: number): Resultado<number, ErroDeNegocio> {
  const { numeroMinimo, numeroMaximo } = LIMITES_DA_MESA;
  if (!Number.isInteger(numero) || numero < numeroMinimo || numero > numeroMaximo) {
    return Resultado.falha(
      criarErroDeNegocio(CODIGOS.MESA_EDITAR_NUMERO_INVALIDO, 'Use um número de mesa de 1 a 999.', {
        campo: 'numero',
      }),
    );
  }
  return Resultado.ok(numero);
}

export function validarDadosDaMesa(dados: DadosDaMesa): Resultado<DadosDaMesa, ErroDeNegocio> {
  const nome = textoOpcional(dados.nome, LIMITES_DA_MESA.nome, 'nome');
  if (!nome.ok) {
    return nome;
  }
  const area = textoOpcional(dados.area, LIMITES_DA_MESA.area, 'area');
  return area.ok ? Resultado.ok({ nome: nome.valor, area: area.valor }) : area;
}

export function exigirCodigoDaMesa(codigo: string): string {
  if (!PADRAO_DO_CODIGO_DA_MESA.test(codigo)) {
    throw new ErroInvarianteDominio(CODIGOS.MESA_CODIGO_GERADO_INVALIDO, 'Código de mesa fora do formato', {
      modulo: 'mesas',
      casoDeUso: 'gerarCodigo',
    });
  }
  return codigo;
}

export function linkDaMesa(urlDoCardapio: string, slug: string, numero: number, codigo: string): string {
  const base = urlDoCardapio.replace(/\/+$/, '');
  return `${base}/${encodeURIComponent(slug)}/mesa/${String(numero)}?c=${encodeURIComponent(codigo)}`;
}

export function podeCriarMesa(ativas: number, limite: number): boolean {
  return ativas < limite;
}
