import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/node';
import { contextoAtual, type ContextoDeExecucao } from '../contexto.ts';
import { limparValor, mascararTexto } from '../limpeza.ts';
import { descreverErro, tituloDoErro, type DescricaoDoErro } from './descrever-erro.ts';
import { obterLoggerPadrao } from './logger.ts';

type Extra = Readonly<Record<string, unknown>>;

function montarTags(descricao: DescricaoDoErro, contexto: ContextoDeExecucao | undefined) {
  const tags = {
    app: contexto?.app,
    modulo: descricao.modulo,
    caso_de_uso: descricao.casoDeUso,
    restaurante_id: descricao.restauranteId,
    rota: contexto?.rota,
    tarefa: contexto?.tarefa,
    codigo: descricao.codigo,
    id_rastreio: contexto?.idRastreio,
  };
  return Object.fromEntries(
    Object.entries(tags).filter((par): par is [string, string] => par[1] !== undefined),
  );
}

function registrarNoLog(erro: unknown, descricao: DescricaoDoErro, idRastreio: string): void {
  const pilha = erro instanceof Error && erro.stack !== undefined ? mascararTexto(erro.stack) : undefined;
  obterLoggerPadrao().error(
    { modulo: descricao.modulo, codigo: descricao.codigo, id_rastreio: idRastreio, pilha },
    tituloDoErro(descricao),
  );
}

function enviarAoSentry(
  erro: unknown,
  descricao: DescricaoDoErro,
  tags: Record<string, string>,
  extra?: Extra,
): string {
  return Sentry.withScope((escopo) => {
    escopo.setTags(tags);
    escopo.setLevel(descricao.nivel);
    escopo.setFingerprint([descricao.codigo, descricao.modulo]);
    if (descricao.negocio !== undefined) {
      escopo.setContext('negocio', limparValor(descricao.negocio) as Record<string, unknown>);
    }
    if (descricao.dependencia !== undefined) {
      escopo.setContext('dependencia', { ...descricao.dependencia });
    }
    if (extra !== undefined) {
      escopo.setExtras(limparValor(extra) as Record<string, unknown>);
    }
    escopo.addEventProcessor((evento) => {
      const valores = evento.exception?.values;
      const principal = valores?.[valores.length - 1];
      if (principal !== undefined) {
        principal.type = descricao.classe;
        principal.value = `${descricao.codigo} - ${descricao.mensagem}`;
      }
      return evento;
    });
    return Sentry.captureException(erro);
  });
}

export function reportarErro(erro: unknown, extra?: Extra): string {
  const contexto = contextoAtual();
  const descricao = descreverErro(erro, contexto);
  const tags = montarTags(descricao, contexto);
  const idRastreio = Sentry.isInitialized()
    ? enviarAoSentry(erro, descricao, tags, extra)
    : (contexto?.idRastreio ?? randomUUID());
  registrarNoLog(erro, descricao, idRastreio);
  return idRastreio;
}

export function registrarPasso(passo: { categoria: string; mensagem: string; dados?: Extra }): void {
  Sentry.addBreadcrumb({
    category: passo.categoria,
    message: passo.mensagem,
    ...(passo.dados === undefined ? {} : { data: { ...passo.dados } }),
  });
}
