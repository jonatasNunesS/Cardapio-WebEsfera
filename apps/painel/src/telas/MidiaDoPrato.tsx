import {
  LIMITES_DA_MIDIA_NA_API,
  MENSAGENS_DA_FALHA,
  rotaCom,
  ROTAS_DA_MIDIA_NO_PAINEL as ROTAS,
  type MidiaNoPainel,
  type MidiaPublica,
} from '@cardapio/contratos';
import { Aviso, Botao, Esqueleto, useToasts, VideoPrato } from '@cardapio/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ChangeEvent } from 'react';
import { api } from '../api.ts';
import { useAtualizarCardapio } from '../cardapio.ts';
import { chaveDaMidia, enviarMidia, useMidiaDoPrato } from '../midia.ts';
import estilos from './MidiaDoPrato.module.css';
import painel from './Painel.module.css';

const ACEITOS = LIMITES_DA_MIDIA_NA_API.tiposDeConteudo.join(',');

function Previa({ midia, nome }: { readonly midia: MidiaPublica; readonly nome: string }) {
  if (midia.video !== null) {
    return (
      <div className={estilos.previa}>
        <VideoPrato
          fonteMp4={midia.video.mp4}
          fonteWebm={midia.video.webm}
          capa={midia.video.capa}
          descricao={`Vídeo de ${nome}`}
        />
      </div>
    );
  }
  return (
    <picture className={estilos.previa}>
      {midia.imagem.avif !== '' && <source type="image/avif" srcSet={midia.imagem.avif} sizes="24rem" />}
      <source type="image/webp" srcSet={midia.imagem.webp} sizes="24rem" />
      <img
        className={estilos.imagem}
        src={midia.imagem.src}
        alt={`Foto de ${nome}`}
        width={midia.imagem.largura}
        height={midia.imagem.altura}
      />
    </picture>
  );
}

function SituacaoDaPendente({
  pendente,
  aoTentarDeNovo,
}: {
  readonly pendente: MidiaNoPainel;
  readonly aoTentarDeNovo: () => void;
}) {
  if (pendente.situacao === 'processando') {
    return (
      <Aviso tipo="informacao" titulo="Processando">
        Estamos preparando {pendente.tipo === 'video' ? 'o vídeo' : 'a foto'}. O cardápio continua com a mídia
        atual até terminar.
      </Aviso>
    );
  }
  if (pendente.situacao === 'falhou') {
    return (
      <Aviso
        tipo="erro"
        titulo="Não deu certo"
        acao={
          <Botao variante="secundario" onClick={aoTentarDeNovo}>
            Tentar de novo
          </Botao>
        }
      >
        {MENSAGENS_DA_FALHA[pendente.motivoFalha ?? 'erro_no_processamento']}
      </Aviso>
    );
  }
  return null;
}

export function MidiaDoPrato({ pratoId, nome }: { readonly pratoId: string; readonly nome: string }) {
  const campoId = useId();
  const consulta = useMidiaDoPrato(pratoId);
  const consultas = useQueryClient();
  const atualizarCardapio = useAtualizarCardapio();
  const toasts = useToasts();
  const [enviando, setEnviando] = useState(false);
  const atualizar = async () => {
    await consultas.invalidateQueries({ queryKey: chaveDaMidia(pratoId) });
    await atualizarCardapio();
  };
  const agir = async (pedido: Promise<{ ok: boolean; mensagem?: string }>, sucesso: string) => {
    const resultado = await pedido;
    toasts.mostrar(
      resultado.ok ? { tipo: 'sucesso', texto: sucesso } : { tipo: 'erro', texto: resultado.mensagem ?? '' },
    );
    await atualizar();
  };
  const aoEscolher = async (evento: ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0];
    evento.target.value = '';
    if (arquivo === undefined) {
      return;
    }
    setEnviando(true);
    await agir(enviarMidia(pratoId, arquivo), 'Arquivo enviado. Agora é só aguardar o processamento.');
    setEnviando(false);
  };
  const pedirNaApi = (metodo: 'POST' | 'DELETE', rota: string) =>
    api
      .pedir(metodo, rota)
      .then((resposta) => (resposta.ok ? { ok: true } : { ok: false, mensagem: resposta.problema.detail }));

  if (consulta.data?.ok !== true) {
    return <Esqueleto rotulo="Carregando a mídia do prato" />;
  }
  const { atual, pendente } = consulta.data.dados;
  return (
    <section className={painel.grupo} aria-labelledby={`${campoId}-titulo`}>
      <h2 id={`${campoId}-titulo`} className={painel.legenda}>
        Foto ou vídeo
      </h2>
      {atual?.publicada == null ? (
        <p className={estilos.dica}>Sem foto nem vídeo ainda.</p>
      ) : (
        <Previa midia={atual.publicada} nome={nome} />
      )}
      {pendente !== null && (
        <SituacaoDaPendente
          pendente={pendente}
          aoTentarDeNovo={() => {
            void agir(
              pedirNaApi('POST', rotaCom(ROTAS.novaTentativa, { id: pendente.id })),
              'Processando de novo.',
            );
          }}
        />
      )}
      <div className={estilos.acoes}>
        <label className={estilos.arquivo} htmlFor={campoId}>
          {atual === null ? 'Enviar foto ou vídeo' : 'Trocar foto ou vídeo'}
          <input
            id={campoId}
            type="file"
            accept={ACEITOS}
            disabled={enviando}
            aria-describedby={`${campoId}-dica`}
            onChange={(evento) => {
              void aoEscolher(evento);
            }}
          />
        </label>
        {(atual !== null || pendente !== null) && (
          <Botao
            variante="secundario"
            disabled={enviando}
            onClick={() => {
              void agir(
                pedirNaApi('DELETE', rotaCom(ROTAS.midiaDoPrato, { id: pratoId })),
                'Mídia removida.',
              );
            }}
          >
            Remover mídia
          </Botao>
        )}
      </div>
      <p id={`${campoId}-dica`} className={estilos.dica}>
        {enviando
          ? 'Enviando o arquivo...'
          : 'Foto JPEG, PNG ou WebP, ou vídeo MP4, MOV ou WebM de até 60 segundos e 100 MB. O vídeo é cortado em 10 segundos e fica sem som.'}
      </p>
    </section>
  );
}
