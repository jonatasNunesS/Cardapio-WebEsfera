import type { RespostaFila } from '@cardapio/contratos';
import { Botao, Esqueleto } from '@cardapio/ui';
import { useState } from 'react';
import painel from '../telas/Painel.module.css';
import { ehNovidade, tocarAlerta } from './alerta.ts';
import { useAcaoNaFila, useFila } from './api-da-fila.ts';
import { CartaoPedido } from './CartaoPedido.tsx';
import { ChamadosDaFila } from './ChamadosDaFila.tsx';
import estilos from './Fila.module.css';
import { SessoesAbertas } from './SessoesAbertas.tsx';
import { useTempoRealDoPainel, type EstadoDaConexao } from './tempo-real.ts';

const COLUNAS = [
  ['enviado', 'Enviados'],
  ['em_preparo', 'Em preparo'],
  ['pronto', 'Prontos'],
  ['entregue', 'Entregues'],
] as const;

const TEXTO_DA_CONEXAO: Readonly<Record<EstadoDaConexao, string>> = {
  conectando: 'Conectando',
  'ao-vivo': 'Ao vivo',
  reconectando: 'Reconectando. A fila é atualizada assim que voltar.',
};

interface Vistos {
  readonly fila: RespostaFila | null;
  readonly ids: ReadonlySet<string> | null;
  readonly novos: ReadonlySet<string>;
}

function useNovos(fila: RespostaFila | null): ReadonlySet<string> {
  const [vistos, setVistos] = useState<Vistos>(() => ({ fila: null, ids: null, novos: new Set() }));
  if (fila !== null && fila !== vistos.fila) {
    const ids = [...fila.pedidos, ...fila.chamados].map((item) => item.id);
    const anteriores = vistos.ids;
    setVistos({
      fila,
      ids: new Set(ids),
      novos: new Set(anteriores === null ? [] : ids.filter((id) => !anteriores.has(id))),
    });
  }
  return vistos.novos;
}

function useAlerta() {
  const [somLigado, setSomLigado] = useState(false);
  const [ultimo, setUltimo] = useState('');
  const aoAvisar = (tipo: string) => {
    if (!ehNovidade(tipo)) {
      return;
    }
    setUltimo(tipo === 'PedidoCriado' ? 'Novo pedido na fila.' : 'Novo chamado de mesa.');
    if (somLigado) {
      tocarAlerta();
    }
  };
  return { somLigado, setSomLigado, ultimo, aoAvisar };
}

export function TelaFila() {
  const consulta = useFila();
  const acao = useAcaoNaFila();
  const alerta = useAlerta();
  const conexao = useTempoRealDoPainel(alerta.aoAvisar);
  const fila = consulta.data?.ok === true ? consulta.data.dados : null;
  const novos = useNovos(fila);
  const agora = consulta.dataUpdatedAt;
  return (
    <main className={[painel.conteudo, estilos.largo].join(' ')}>
      <div className={estilos.topo}>
        <h1 className={painel.titulo}>Fila</h1>
        <p className={estilos.conexao}>{TEXTO_DA_CONEXAO[conexao]}</p>
        <Botao
          variante="secundario"
          aria-pressed={alerta.somLigado}
          onClick={() => {
            alerta.setSomLigado(!alerta.somLigado);
          }}
        >
          {alerta.somLigado ? 'Som ligado' : 'Ligar som de alerta'}
        </Botao>
      </div>
      <p role="status" aria-live="polite" className={estilos.alerta}>
        {alerta.ultimo}
      </p>
      {fila === null ? (
        <Esqueleto rotulo="Carregando a fila" />
      ) : (
        <>
          <section aria-labelledby="titulo-pedidos" className={estilos.secao}>
            <h2 id="titulo-pedidos">Pedidos</h2>
            <div className={estilos.colunas}>
              {COLUNAS.map(([situacao, titulo]) => (
                <section key={situacao} aria-label={`Pedidos: ${titulo}`} className={estilos.coluna}>
                  <h3 className={estilos.colunaTitulo}>{titulo}</h3>
                  {fila.pedidos
                    .filter((pedido) => pedido.situacao === situacao)
                    .map((pedido) => (
                      <CartaoPedido key={pedido.id} pedido={pedido} acao={acao} novo={novos.has(pedido.id)} />
                    ))}
                </section>
              ))}
            </div>
          </section>
          <ChamadosDaFila chamados={fila.chamados} acao={acao} novos={novos} agora={agora} />
          <SessoesAbertas sessoes={fila.sessoes} acao={acao} />
        </>
      )}
    </main>
  );
}
