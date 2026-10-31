import { rotaCom, ROTAS_DA_EQUIPE as ROTAS, type SessaoNaFilaApi } from '@cardapio/contratos';
import { Aviso, Botao } from '@cardapio/ui';
import { useState } from 'react';
import type { AcaoNaFila } from './api-da-fila.ts';
import estilos from './Fila.module.css';

interface Pendencia {
  readonly sessao: SessaoNaFilaApi;
  readonly pedidos: number;
  readonly chamados: number;
}

export function SessoesAbertas({
  sessoes,
  acao,
}: {
  readonly sessoes: readonly SessaoNaFilaApi[];
  readonly acao: AcaoNaFila;
}) {
  const [pendencia, setPendencia] = useState<Pendencia | null>(null);
  const encerrar = async (sessao: SessaoNaFilaApi, confirmado: boolean) => {
    const resposta = await acao(
      rotaCom(ROTAS.encerramentoDaSessao, { id: sessao.id }),
      { confirmado },
      `Mesa ${String(sessao.mesaNumero)} encerrada.`,
    );
    const detalhes = resposta.ok ? undefined : resposta.problema.detalhes;
    setPendencia(
      detalhes === undefined
        ? null
        : {
            sessao,
            pedidos: Number(detalhes.pedidosAbertos ?? 0),
            chamados: Number(detalhes.chamadosAbertos ?? 0),
          },
    );
  };
  return (
    <section aria-labelledby="titulo-mesas" className={estilos.secao}>
      <h2 id="titulo-mesas">Mesas abertas</h2>
      {pendencia === null ? null : (
        <Aviso tipo="aviso">
          <p>
            A mesa {pendencia.sessao.mesaNumero} tem {pendencia.pedidos} pedido(s) e {pendencia.chamados}{' '}
            chamado(s) em aberto.
          </p>
          <div className={estilos.acoes}>
            <Botao variante="perigo" onClick={() => void encerrar(pendencia.sessao, true)}>
              Encerrar mesmo assim
            </Botao>
            <Botao
              variante="secundario"
              onClick={() => {
                setPendencia(null);
              }}
            >
              Voltar
            </Botao>
          </div>
        </Aviso>
      )}
      {sessoes.length === 0 ? (
        <p>Nenhuma mesa aberta agora.</p>
      ) : (
        <ul className={estilos.mesas}>
          {sessoes.map((sessao) => (
            <li key={sessao.id}>
              <Botao variante="secundario" onClick={() => void encerrar(sessao, false)}>
                Encerrar mesa {sessao.mesaNumero}
              </Botao>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
