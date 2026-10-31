import { rotaCom, ROTAS_DA_EQUIPE as ROTAS, type PedidoNaFilaApi } from '@cardapio/contratos';
import { Botao, CampoTexto, formatarReais } from '@cardapio/ui';
import { useState, type SubmitEvent } from 'react';
import type { AcaoNaFila } from './api-da-fila.ts';
import estilos from './Fila.module.css';

const AVANCO: Readonly<Partial<Record<PedidoNaFilaApi['situacao'], string>>> = {
  enviado: 'Começar preparo',
  em_preparo: 'Marcar pronto',
  pronto: 'Marcar entregue',
};

function Cancelar({ pedido, acao }: { readonly pedido: PedidoNaFilaApi; readonly acao: AcaoNaFila }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  if (!aberto) {
    return (
      <Botao
        variante="secundario"
        onClick={() => {
          setAberto(true);
        }}
      >
        Cancelar<span className={estilos.somenteLeitor}> pedido {pedido.numero}</span>
      </Botao>
    );
  }
  const enviar = (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    void acao(
      rotaCom(ROTAS.cancelamentoDoPedido, { id: pedido.id }),
      { situacaoEsperada: pedido.situacao, motivo },
      `Pedido ${String(pedido.numero)} cancelado.`,
    ).then((resposta) => {
      setAberto(!resposta.ok);
    });
  };
  return (
    <form className={estilos.cancelar} onSubmit={enviar}>
      <CampoTexto
        rotulo={`Motivo do cancelamento do pedido ${String(pedido.numero)}`}
        required
        minLength={3}
        maxLength={200}
        value={motivo}
        onChange={(evento) => {
          setMotivo(evento.target.value);
        }}
      />
      <Botao type="submit" variante="perigo">
        Confirmar cancelamento
      </Botao>
    </form>
  );
}

export function CartaoPedido({
  pedido,
  acao,
  novo,
}: {
  readonly pedido: PedidoNaFilaApi;
  readonly acao: AcaoNaFila;
  readonly novo: boolean;
}) {
  const avanco = AVANCO[pedido.situacao];
  return (
    <article className={[estilos.cartao, novo ? estilos.novo : ''].join(' ')}>
      <h3 className={estilos.cartaoTitulo}>
        Mesa {pedido.mesaNumero} · Pedido {pedido.numero}
      </h3>
      <ul className={estilos.itens}>
        {pedido.itens.map((item) => (
          <li key={`${item.nome}-${String(item.quantidade)}-${item.observacao}`}>
            {item.quantidade}x {item.nome}
            {item.observacao === '' ? null : <span className={estilos.observacao}> ({item.observacao})</span>}
          </li>
        ))}
      </ul>
      <p className={estilos.total}>{formatarReais(pedido.totalCentavos)}</p>
      {avanco === undefined ? null : (
        <div className={estilos.acoes}>
          <Botao
            onClick={() => {
              void acao(
                rotaCom(ROTAS.avancoDoPedido, { id: pedido.id }),
                { situacaoEsperada: pedido.situacao },
                `Pedido ${String(pedido.numero)} atualizado.`,
              );
            }}
          >
            {avanco}
            <span className={estilos.somenteLeitor}> do pedido {pedido.numero}</span>
          </Botao>
          <Cancelar pedido={pedido} acao={acao} />
        </div>
      )}
    </article>
  );
}
