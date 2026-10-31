import {
  rotaCom,
  ROTAS_DA_PLATAFORMA as ROTAS,
  type RespostaConviteGerado,
  type RespostaFinanceiroDoRestaurante,
} from '@cardapio/contratos';
import { Aviso, Botao, CampoTexto, Esqueleto, formatarReais, Tabela } from '@cardapio/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.ts';
import {
  CHAVE_DA_VISAO_GERAL,
  CHAVE_DOS_RESTAURANTES,
  NOMES_DAS_SITUACOES,
  useRestaurantes,
} from './api-da-plataforma.ts';
import { LinkDoConvite } from './LinkDoConvite.tsx';
import estilos from './Plataforma.module.css';

const dia = (iso: string | null) => (iso === null ? '' : new Date(iso).toLocaleDateString('pt-BR'));

function Financeiro({ slug }: { readonly slug: string }) {
  const consulta = useQuery({
    queryKey: ['plataforma', 'financeiro', slug],
    queryFn: () => api.pedir<RespostaFinanceiroDoRestaurante>('GET', rotaCom(ROTAS.financeiro, { slug })),
  });
  if (consulta.data === undefined) {
    return <Esqueleto rotulo="Carregando a cobrança" />;
  }
  if (!consulta.data.ok) {
    return <Aviso tipo="erro">{consulta.data.problema.detail}</Aviso>;
  }
  const { assinatura, cobrancas } = consulta.data.dados;
  return (
    <section aria-labelledby="titulo-cobranca" className={estilos.secao}>
      <h2 id="titulo-cobranca">Cobrança (somente leitura)</h2>
      <p>
        {assinatura === null
          ? 'Sem assinatura.'
          : `Plano ${assinatura.plano}, assinatura ${assinatura.situacao}, pago até ${dia(assinatura.pagoAte) || 'nunca'}.`}
      </p>
      <Tabela
        legenda="Cobranças"
        linhas={cobrancas}
        chaveDaLinha={(cobranca) => `${cobranca.venceEm}-${cobranca.situacao}`}
        mensagemVazia="Nenhuma cobrança ainda."
        colunas={[
          { chave: 'vence', titulo: 'Vencimento', celula: (cobranca) => dia(cobranca.venceEm) },
          {
            chave: 'valor',
            titulo: 'Valor',
            numerica: true,
            celula: (cobranca) => formatarReais(cobranca.valorCentavos),
          },
          { chave: 'situacao', titulo: 'Situação', celula: (cobranca) => cobranca.situacao },
          { chave: 'paga', titulo: 'Paga em', celula: (cobranca) => dia(cobranca.pagaEm) },
        ]}
      />
    </section>
  );
}

function Suspensao({ slug, suspenso }: { readonly slug: string; readonly suspenso: boolean }) {
  const consultas = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const enviar = (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    void api
      .pedir('POST', rotaCom(suspenso ? ROTAS.reativacao : ROTAS.suspensao, { slug }), { motivo })
      .then((resposta) => {
        setErro(resposta.ok ? null : resposta.problema.detail);
        if (resposta.ok) {
          setMotivo('');
          void consultas.invalidateQueries({ queryKey: CHAVE_DOS_RESTAURANTES });
          void consultas.invalidateQueries({ queryKey: CHAVE_DA_VISAO_GERAL });
        }
      });
  };
  return (
    <section aria-labelledby="titulo-suspensao" className={estilos.secao}>
      <h2 id="titulo-suspensao">{suspenso ? 'Reativar' : 'Suspender'}</h2>
      <p>
        {suspenso
          ? 'O restaurante está suspenso: o cardápio fica no ar, mas não recebe pedidos.'
          : 'Suspenso, o restaurante continua com o cardápio no ar, mas não recebe pedidos.'}
      </p>
      <form className={estilos.formulario} onSubmit={enviar}>
        <CampoTexto
          rotulo={suspenso ? 'Motivo da reativação' : 'Motivo da suspensão'}
          required
          minLength={3}
          maxLength={500}
          value={motivo}
          onChange={(evento) => {
            setMotivo(evento.target.value);
          }}
        />
        <Botao type="submit" variante={suspenso ? 'principal' : 'perigo'}>
          {suspenso ? 'Reativar restaurante' : 'Suspender restaurante'}
        </Botao>
      </form>
      {erro === null ? null : <Aviso tipo="erro">{erro}</Aviso>}
    </section>
  );
}

function NovoConvite({ slug }: { readonly slug: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const gerar = () => {
    void api.pedir<RespostaConviteGerado>('POST', rotaCom(ROTAS.convite, { slug })).then((resposta) => {
      setErro(resposta.ok ? null : resposta.problema.detail);
      setLink(resposta.ok ? resposta.dados.linkDoConvite : null);
    });
  };
  return (
    <section aria-labelledby="titulo-convite" className={estilos.secao}>
      <h2 id="titulo-convite">Convite do dono</h2>
      <p>Um convite novo invalida o anterior.</p>
      <Botao variante="secundario" onClick={gerar}>
        Gerar novo convite
      </Botao>
      {erro === null ? null : <Aviso tipo="erro">{erro}</Aviso>}
      <LinkDoConvite link={link} />
    </section>
  );
}

export function TelaDoRestaurante() {
  const { slug = '' } = useParams();
  const lista = useRestaurantes();
  const restaurante =
    lista.data?.ok === true ? lista.data.dados.restaurantes.find((item) => item.slug === slug) : undefined;
  return (
    <main className={estilos.pagina}>
      <Link to="/restaurantes">Voltar aos restaurantes</Link>
      <h1>{restaurante?.nome ?? slug}</h1>
      {restaurante === undefined ? (
        <Esqueleto rotulo="Carregando o restaurante" />
      ) : (
        <>
          <p>Situação: {NOMES_DAS_SITUACOES[restaurante.situacao] ?? restaurante.situacao}</p>
          <Suspensao slug={slug} suspenso={restaurante.situacao === 'suspenso'} />
          <NovoConvite slug={slug} />
          <Financeiro slug={slug} />
        </>
      )}
    </main>
  );
}
