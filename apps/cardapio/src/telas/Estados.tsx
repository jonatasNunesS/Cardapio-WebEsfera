import { Esqueleto, TelaErro } from '@cardapio/ui';
import { useEffect, useState } from 'react';
import { useParams, useRouteError } from 'react-router';
import estilos from './Estados.module.css';
import { sentry } from '../observabilidade.ts';

export function Carregando() {
  const { numero } = useParams();
  const mesa = Number(numero);
  return (
    <main className={estilos.carregando}>
      <h1 className={estilos.abrindo}>
        {Number.isInteger(mesa) && mesa > 0
          ? `Abrindo o cardápio da Mesa ${String(mesa)}`
          : 'Abrindo o cardápio'}
      </h1>
      <Esqueleto rotulo="Carregando o cardápio" />
    </main>
  );
}

export function ErroDaRota() {
  const erro = useRouteError();
  const [idRastreio] = useState(() => crypto.randomUUID());
  useEffect(() => {
    sentry.reportar(erro, { id_rastreio: idRastreio });
  }, [erro, idRastreio]);
  return (
    <TelaErro
      idRastreio={idRastreio}
      aoTentarDeNovo={() => {
        location.reload();
      }}
    />
  );
}
