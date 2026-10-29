import {
  rotaCom,
  ROTAS_DA_MIDIA_NO_PAINEL as ROTAS,
  type RespostaMidiasDoPrato,
  type RespostaPedidoDeEnvio,
} from '@cardapio/contratos';
import type { RespostaDaApi } from '@cardapio/contratos/cliente';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.ts';

const INTERVALO_ENQUANTO_PROCESSA_MS = 3000;
const TENTATIVAS_DE_ENVIO = 2;

export function chaveDaMidia(pratoId: string) {
  return ['midia', pratoId] as const;
}

function emAndamento(resposta: RespostaDaApi<RespostaMidiasDoPrato> | undefined): boolean {
  const situacao = resposta?.ok === true ? resposta.dados.pendente?.situacao : undefined;
  return situacao === 'processando';
}

export function useMidiaDoPrato(pratoId: string) {
  return useQuery<RespostaDaApi<RespostaMidiasDoPrato>>({
    queryKey: chaveDaMidia(pratoId),
    queryFn: () => api.pedir<RespostaMidiasDoPrato>('GET', rotaCom(ROTAS.midiasDoPrato, { id: pratoId })),
    refetchInterval: (consulta) =>
      emAndamento(consulta.state.data) ? INTERVALO_ENQUANTO_PROCESSA_MS : false,
  });
}

export type DesfechoDoEnvio = { readonly ok: true } | { readonly ok: false; readonly mensagem: string };

const FALHA_NO_ENVIO = 'Não conseguimos enviar o arquivo. Confira a conexão e tente de novo.';

function enviarAoArmazenamento(envio: RespostaPedidoDeEnvio, arquivo: File): Promise<boolean> {
  return fetch(envio.url, { method: envio.metodo, headers: envio.cabecalhos, body: arquivo }).then(
    (resposta) => resposta.ok,
    () => false,
  );
}

async function pedirEEnviar(pratoId: string, arquivo: File): Promise<DesfechoDoEnvio & { midiaId?: string }> {
  const pedido = await api.pedir<RespostaPedidoDeEnvio>(
    'POST',
    rotaCom(ROTAS.midiasDoPrato, { id: pratoId }),
    {
      tipoConteudo: arquivo.type,
      tamanhoBytes: arquivo.size,
    },
  );
  if (!pedido.ok) {
    return { ok: false, mensagem: pedido.problema.detail };
  }
  const enviado = await enviarAoArmazenamento(pedido.dados, arquivo);
  return enviado ? { ok: true, midiaId: pedido.dados.midiaId } : { ok: false, mensagem: FALHA_NO_ENVIO };
}

export async function enviarMidia(pratoId: string, arquivo: File): Promise<DesfechoDoEnvio> {
  let desfecho: DesfechoDoEnvio & { midiaId?: string } = { ok: false, mensagem: FALHA_NO_ENVIO };
  for (let tentativa = 0; tentativa < TENTATIVAS_DE_ENVIO && !desfecho.ok; tentativa += 1) {
    desfecho = await pedirEEnviar(pratoId, arquivo);
    if (!desfecho.ok && desfecho.mensagem !== FALHA_NO_ENVIO) {
      return desfecho;
    }
  }
  if (!desfecho.ok || desfecho.midiaId === undefined) {
    return desfecho;
  }
  const confirmado = await api.pedir('POST', rotaCom(ROTAS.confirmacao, { id: desfecho.midiaId }));
  return confirmado.ok ? { ok: true } : { ok: false, mensagem: confirmado.problema.detail };
}
