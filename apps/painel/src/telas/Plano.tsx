import type { CobrancaNaApi, RespostaPlanoECobranca } from '@cardapio/contratos';
import {
  Aviso,
  Botao,
  CampoTexto,
  Esqueleto,
  formatarReais,
  GrupoRadio,
  LinkBotao,
  Tabela,
} from '@cardapio/ui';
import { useState, type SubmitEvent } from 'react';
import { useAssinar, usePlano } from '../plano.ts';
import painel from './Painel.module.css';
import estilos from './Plano.module.css';

const formatoDeData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });
const data = (iso: string | null) => (iso === null ? '' : formatoDeData.format(new Date(iso)));

const SITUACAO_DA_COBRANCA: Readonly<Record<CobrancaNaApi['situacao'], string>> = {
  agendada: 'Agendada',
  paga: 'Paga',
  recusada: 'Recusada',
  em_retentativa: 'Em nova tentativa',
  cancelada: 'Cancelada',
};

function Situacao({ plano }: { readonly plano: RespostaPlanoECobranca }) {
  const ultimoDiaDeCarencia = plano.diaDaInadimplencia - 1;
  switch (plano.situacao) {
    case 'teste':
      return (
        <Aviso tipo="informacao" titulo="Período de teste">
          Seu teste vai até {data(plano.testeTerminaEm)}. Assine para continuar recebendo pedidos depois
          disso.
        </Aviso>
      );
    case 'ativo':
      return (
        <Aviso tipo="sucesso" titulo="Assinatura em dia">
          Pagamento confirmado. Seu acesso está garantido até {data(plano.vencimento)}.
        </Aviso>
      );
    case 'carencia':
      return (
        <Aviso tipo="aviso" titulo="Pagamento pendente">
          Dia {plano.diaDeAtraso} de {ultimoDiaDeCarencia} de carência. A partir do dia{' '}
          {plano.diaDaInadimplencia}, os pedidos ficam suspensos. O cardápio continua no ar.
        </Aviso>
      );
    case 'inadimplente':
      return (
        <Aviso tipo="erro" titulo="Pedidos suspensos">
          Não recebemos o pagamento. O cardápio continua no ar, mas os pedidos estão suspensos até o pagamento
          ser confirmado.
        </Aviso>
      );
    case 'cancelado':
      return (
        <Aviso tipo="erro" titulo="Conta cancelada">
          Esta conta foi cancelada. Fale com o suporte.
        </Aviso>
      );
  }
}

function Assinatura({ plano }: { readonly plano: RespostaPlanoECobranca }) {
  const { assinatura } = plano;
  if (assinatura === null) {
    return <p>Você ainda não escolheu um plano.</p>;
  }
  if (assinatura.linkDePagamento !== null) {
    return (
      <Aviso
        tipo="aviso"
        titulo={`Plano ${assinatura.nomeDoPlano}: falta autorizar o pagamento`}
        acao={<LinkBotao href={assinatura.linkDePagamento}>Pagar no Mercado Pago</LinkBotao>}
      >
        A assinatura só começa depois que você autorizar a cobrança no Mercado Pago.
      </Aviso>
    );
  }
  return (
    <p>
      Plano {assinatura.nomeDoPlano}
      {assinatura.proximaCobrancaEm === null
        ? '.'
        : `, próxima cobrança em ${data(assinatura.proximaCobrancaEm)}.`}
    </p>
  );
}

function EscolherPlano({ plano }: { readonly plano: RespostaPlanoECobranca }) {
  const assinar = useAssinar();
  const [codigo, setCodigo] = useState(plano.assinatura?.codigoDoPlano ?? plano.planos[0]?.codigo ?? '');
  const [email, setEmail] = useState('');
  const [chave, setChave] = useState(() => crypto.randomUUID());
  const [erro, setErro] = useState<string | null>(null);
  const enviar = (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    void assinar({ codigoDoPlano: codigo, emailDoPagador: email, chaveDeIdempotencia: chave }).then(
      (resposta) => {
        setErro(resposta.ok ? null : resposta.problema.detail);
        if (resposta.ok) {
          setChave(crypto.randomUUID());
        }
      },
    );
  };
  return (
    <form className={estilos.formulario} onSubmit={enviar}>
      <GrupoRadio
        legenda="Plano"
        nome="plano"
        valor={codigo}
        aoMudar={setCodigo}
        opcoes={plano.planos.map((opcao) => ({
          valor: opcao.codigo,
          rotulo: `${opcao.nome}: ${formatarReais(opcao.precoCentavos)} por mês, até ${String(opcao.limiteMesas)} mesas`,
        }))}
      />
      <CampoTexto
        rotulo="E-mail da sua conta do Mercado Pago"
        dica="A cobrança mensal sai desta conta. Pode ser diferente do e-mail de acesso ao painel."
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(evento) => {
          setEmail(evento.target.value);
        }}
      />
      {erro === null ? null : <Aviso tipo="erro">{erro}</Aviso>}
      <Botao type="submit">Assinar pelo Mercado Pago</Botao>
    </form>
  );
}

function Historico({ cobrancas }: { readonly cobrancas: readonly CobrancaNaApi[] }) {
  return (
    <Tabela
      legenda="Histórico de cobranças"
      linhas={cobrancas}
      chaveDaLinha={(cobranca) => cobranca.id}
      mensagemVazia="Nenhuma cobrança ainda."
      colunas={[
        { chave: 'vence', titulo: 'Vencimento', celula: (cobranca) => data(cobranca.venceEm) },
        {
          chave: 'valor',
          titulo: 'Valor',
          numerica: true,
          celula: (cobranca) => formatarReais(cobranca.valorCentavos),
        },
        {
          chave: 'situacao',
          titulo: 'Situação',
          celula: (cobranca) => SITUACAO_DA_COBRANCA[cobranca.situacao],
        },
        { chave: 'paga', titulo: 'Pago em', celula: (cobranca) => data(cobranca.pagaEm) },
      ]}
    />
  );
}

export function Plano() {
  const consulta = usePlano();
  if (consulta.data === undefined) {
    return <Esqueleto rotulo="Carregando o plano" />;
  }
  if (!consulta.data.ok) {
    return (
      <main className={painel.conteudo}>
        <h1 className={painel.titulo}>Plano e cobrança</h1>
        <Aviso tipo="erro">{consulta.data.problema.detail}</Aviso>
      </main>
    );
  }
  const plano = consulta.data.dados;
  return (
    <main className={painel.conteudo}>
      <h1 className={painel.titulo}>Plano e cobrança</h1>
      <section className={estilos.secao} aria-labelledby="situacao">
        <h2 id="situacao" className={estilos.subtitulo}>
          Situação
        </h2>
        <Situacao plano={plano} />
        <Assinatura plano={plano} />
      </section>
      {plano.podeAssinar ? (
        <section className={estilos.secao} aria-labelledby="escolher">
          <h2 id="escolher" className={estilos.subtitulo}>
            {plano.assinatura === null ? 'Escolha seu plano' : 'Trocar o plano antes de pagar'}
          </h2>
          <EscolherPlano plano={plano} />
        </section>
      ) : null}
      <section className={estilos.secao} aria-labelledby="historico">
        <h2 id="historico" className={estilos.subtitulo}>
          Cobranças
        </h2>
        <Historico cobrancas={plano.cobrancas} />
      </section>
    </main>
  );
}
