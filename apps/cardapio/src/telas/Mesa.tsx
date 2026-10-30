import { aplicarTemaRestaurante, Aviso, ProvedorDeVideos, type ReportarErro } from '@cardapio/ui';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Outlet, useLoaderData, useNavigate } from 'react-router';
import type { MesaCarregada } from '../dados/carregar-mesa.ts';
import { lembranca } from '../dados/rota-da-mesa.ts';
import { configuracao, sentry } from '../observabilidade.ts';
import { aquecerCache } from '../offline/aquecer.ts';
import { useAoEncerrar } from '../atendimento/sessao-encerrada.ts';
import { caminhoDaMesa, type MesaPronta } from '../dados/contexto.ts';
import { BarraDoPedido } from '../pedido/BarraDoPedido.tsx';
import { Abertura } from './Abertura.tsx';
import estilos from './Mesa.module.css';
import { TelaNeutra } from './TelaNeutra.tsx';

type Pronta = Extract<MesaCarregada, { tipo: 'pronta' }>;

const reportar: ReportarErro = (erro, extra) => {
  sentry.reportar(erro, extra);
};

function useTema(personalizacao: Pronta['cardapio']['personalizacao']) {
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    if (personalizacao !== null) {
      aplicarTemaRestaurante(raiz, personalizacao, reportar);
    }
    return () => {
      for (const variavel of ['--cor-marca', '--cor-sobre-marca', '--cor-marca-texto']) {
        raiz.style.removeProperty(variavel);
      }
    };
  }, [personalizacao]);
}

function useExpirada(expiraEm: string): boolean {
  const [expirada, setExpirada] = useState(() => new Date(expiraEm).getTime() <= Date.now());
  useEffect(() => {
    const restante = new Date(expiraEm).getTime() - Date.now();
    const espera = setTimeout(
      () => {
        setExpirada(true);
      },
      Math.max(0, Math.min(restante, 2 ** 31 - 1)),
    );
    return () => {
      clearTimeout(espera);
    };
  }, [expiraEm]);
  return expirada;
}

function useOnline(inicial: boolean): boolean {
  const [online, setOnline] = useState(inicial);
  useEffect(() => {
    const ligar = () => {
      setOnline(true);
    };
    const desligar = () => {
      setOnline(false);
    };
    addEventListener('online', ligar);
    addEventListener('offline', desligar);
    return () => {
      removeEventListener('online', ligar);
      removeEventListener('offline', desligar);
    };
  }, []);
  return online;
}

function useLinksDoApp() {
  const navegar = useNavigate();
  useEffect(() => {
    const interceptar = (evento: MouseEvent) => {
      const alvo = evento.target instanceof Element ? evento.target.closest('a') : null;
      if (
        alvo === null ||
        evento.defaultPrevented ||
        evento.button !== 0 ||
        evento.metaKey ||
        evento.ctrlKey ||
        evento.shiftKey ||
        alvo.target !== '' ||
        alvo.origin !== location.origin
      ) {
        return;
      }
      evento.preventDefault();
      void navegar(`${alvo.pathname}${alvo.search}`);
    };
    document.addEventListener('click', interceptar);
    return () => {
      document.removeEventListener('click', interceptar);
    };
  }, [navegar]);
}

function MesaAberta({ carregada, codigo }: { readonly carregada: Pronta; readonly codigo: string }) {
  const { mesa, cardapio } = carregada;
  const expirada = useExpirada(mesa.expiraEm);
  const online = useOnline(!carregada.offline);
  const [abertura, setAbertura] = useState(() => !lembranca.aberturaVista(mesa));
  useTema(cardapio.personalizacao);
  useLinksDoApp();
  const navegar = useNavigate();
  const [encerrada, setEncerrada] = useState(false);
  useAoEncerrar(
    useCallback(() => {
      setEncerrada(true);
      void navegar(caminhoDaMesa(mesa, codigo, '/obrigado'));
    }, [navegar, mesa, codigo]),
  );
  useEffect(() => {
    if (!carregada.offline) {
      aquecerCache(cardapio, configuracao.release).then(
        () => undefined,
        (erro: unknown) => {
          reportar(erro, { etapa: 'aquecer-cache' });
        },
      );
    }
  }, [cardapio, carregada.offline]);

  if (expirada && !encerrada) {
    return <TelaNeutra motivo="expirada" />;
  }
  if (abertura) {
    return (
      <Abertura
        mesa={mesa}
        cardapio={cardapio}
        aoContinuar={() => {
          lembranca.marcarAberturaVista(mesa);
          setAbertura(false);
        }}
      />
    );
  }
  const contexto: MesaPronta = { mesa, cardapio, codigo, online };
  return (
    <ProvedorDeVideos>
      {!online && (
        <div className={estilos.faixa}>
          <Aviso tipo="aviso">Você está sem conexão. Mostrando o cardápio guardado neste aparelho.</Aviso>
        </div>
      )}
      <Outlet context={contexto} />
      <BarraDoPedido contexto={contexto} />
    </ProvedorDeVideos>
  );
}

export function Mesa() {
  const { carregada, codigo } = useLoaderData<{ carregada: MesaCarregada; codigo: string }>();
  if (carregada.tipo === 'pronta') {
    return (
      <MesaAberta
        key={`${carregada.mesa.slug}:${String(carregada.mesa.numero)}`}
        carregada={carregada}
        codigo={codigo}
      />
    );
  }
  return <TelaNeutra motivo={carregada.tipo === 'redirecionar' ? 'qr-invalido' : carregada.tipo} />;
}
