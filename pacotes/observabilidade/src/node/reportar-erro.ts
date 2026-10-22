import * as Sentry from '@sentry/node';
import { contextoAtual, type ContextoDeExecucao } from '../contexto.ts';
import { limparValor, mascararTexto } from '../limpeza.ts';
import { descreverErro, tituloDoErro, type DescricaoDoErro } from './descrever-erro.ts';
import { gerarIdRastreio } from './id-rastreio.ts';
import { obterLoggerPadrao } from './logger.ts';

type Extra = Readonly<Record<string, unknown>>;

function montarTags(
  descricao: DescricaoDoErro,
  contexto: ContextoDeExecucao | undefined,
  idRastreio: string,
) {
  const tags = {
    app: contexto?.app,
    modulo: descricao.modulo,
    caso_de_uso: descricao.casoDeUso,
    restaurante_id: descricao.restauranteId,
    rota: contexto?.rota,
    tarefa: contexto?.tarefa,
    contexto: contexto?.escopo,
    codigo: descricao.codigo,
    id_rastreio: idRastreio,
    fila: contexto?.job?.fila,
    job_id: contexto?.job?.id,
    tentativa: contexto?.job === undefined ? undefined : String(contexto.job.tentativa),
    falha_definitiva: contexto?.job?.falhaDefinitiva === true ? 'sim' : undefined,
  };
  return Object.fromEntries(
    Object.entries(tags).filter((par): par is [string, string] => par[1] !== undefined),
  );
}

function registrarNoLog(
  erro: unknown,
  descricao: DescricaoDoErro,
  idRastreio: string,
  comContexto: boolean,
): void {
  const pilha = erro instanceof Error && erro.stack !== undefined ? mascararTexto(erro.stack) : undefined;
  const rastreio = comContexto ? {} : { id_rastreio: idRastreio };
  obterLoggerPadrao().error(
    { modulo: descricao.modulo, codigo: descricao.codigo, ...rastreio, pilha },
    tituloDoErro(descricao),
  );
}

function enviarAoSentry(
  erro: unknown,
  descricao: DescricaoDoErro,
  tags: Record<string, string>,
  extra?: Extra,
): void {
  Sentry.withScope((escopo) => {
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
    Sentry.captureException(erro);
  });
}

export function reportarErro(erro: unknown, extra?: Extra): string {
  const contexto = contextoAtual();
  const idRastreio = contexto?.idRastreio ?? gerarIdRastreio();
  const descricao = descreverErro(erro, contexto);
  if (Sentry.isInitialized()) {
    enviarAoSentry(erro, descricao, montarTags(descricao, contexto, idRastreio), extra);
  }
  registrarNoLog(erro, descricao, idRastreio, contexto !== undefined);
  return idRastreio;
}

export function registrarPasso(passo: { categoria: string; mensagem: string; dados?: Extra }): void {
  Sentry.addBreadcrumb({
    category: passo.categoria,
    message: passo.mensagem,
    ...(passo.dados === undefined ? {} : { data: { ...passo.dados } }),
  });
}
