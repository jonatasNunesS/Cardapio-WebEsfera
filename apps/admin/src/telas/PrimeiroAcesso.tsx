import {
  ROTAS_DO_ADMIN,
  type RespostaCadastroConcluido,
  type RespostaCadastroIniciado,
} from '@cardapio/contratos';
import { Aviso, Botao, CampoTexto, LinkBotao, PaginaDeAcesso, useEnvioDeFormulario } from '@cardapio/ui';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, MARCA } from '../api.ts';
import estilos from './Admin.module.css';

function Chave({ iniciado }: { iniciado: RespostaCadastroIniciado }) {
  return (
    <ol className={estilos.passos}>
      <li>
        Abra o aplicativo autenticador e adicione uma conta com a chave abaixo, ou toque em &quot;Abrir no
        autenticador&quot; se estiver no celular.
        <p className={estilos.chave}>{iniciado.segredo}</p>
        <LinkBotao href={iniciado.uriOtpauth} variante="secundario">
          Abrir no autenticador
        </LinkBotao>
      </li>
      <li>Digite o código de 6 dígitos que o aplicativo mostrar e escolha a sua senha definitiva.</li>
    </ol>
  );
}

function CodigosDeRecuperacao({ codigos }: { codigos: readonly string[] }) {
  const navegar = useNavigate();
  return (
    <>
      <Aviso tipo="aviso" titulo="Guarde estes códigos agora">
        Cada código vale uma vez, se você perder o celular. Eles não aparecem de novo.
      </Aviso>
      <ul className={estilos.codigos} aria-label="Códigos de recuperação">
        {codigos.map((codigo) => (
          <li key={codigo}>{codigo}</li>
        ))}
      </ul>
      <Botao
        larguraTotal
        onClick={() => {
          void navegar('/');
        }}
      >
        Já guardei os códigos
      </Botao>
    </>
  );
}

function Confirmacao({ aoConcluir }: { aoConcluir: (codigos: readonly string[]) => void }) {
  const [dados, setDados] = useState({ codigoDeVerificacao: '', senhaNova: '' });
  const envio = useEnvioDeFormulario(
    () => api.pedir<RespostaCadastroConcluido>('POST', ROTAS_DO_ADMIN.confirmacaoDoCadastro, dados),
    (resposta) => {
      aoConcluir(resposta.codigosDeRecuperacao);
    },
  );
  return (
    <form noValidate onSubmit={envio.aoEnviar} className={estilos.formulario}>
      {envio.erros.geral !== undefined && <Aviso tipo="erro">{envio.erros.geral}</Aviso>}
      <CampoTexto
        id={envio.idDoCampo('codigo')}
        rotulo="Código do aplicativo"
        autoComplete="one-time-code"
        inputMode="numeric"
        value={dados.codigoDeVerificacao}
        onChange={(evento) => {
          setDados((atuais) => ({ ...atuais, codigoDeVerificacao: evento.target.value }));
        }}
        erro={envio.erroDe('codigo')}
      />
      <CampoTexto
        id={envio.idDoCampo('senha')}
        rotulo="Senha definitiva"
        type="password"
        autoComplete="new-password"
        dica="Pelo menos 10 caracteres. Não use a senha temporária."
        value={dados.senhaNova}
        onChange={(evento) => {
          setDados((atuais) => ({ ...atuais, senhaNova: evento.target.value }));
        }}
        erro={envio.erroDe('senha')}
      />
      <Botao type="submit" larguraTotal carregando={envio.enviando}>
        Ativar o segundo fator
      </Botao>
    </form>
  );
}

export function PrimeiroAcesso() {
  const [codigos, setCodigos] = useState<readonly string[] | null>(null);
  const inicio = useEnvioDeFormulario(
    () => api.pedir<RespostaCadastroIniciado>('POST', ROTAS_DO_ADMIN.cadastroDoSegundoFator),
    useCallback(() => undefined, []),
  );
  if (codigos !== null) {
    return (
      <PaginaDeAcesso marca={MARCA} titulo="Segundo fator ativo">
        <CodigosDeRecuperacao codigos={codigos} />
      </PaginaDeAcesso>
    );
  }
  return (
    <PaginaDeAcesso
      marca={MARCA}
      titulo="Primeiro acesso"
      descricao="Todo acesso ao admin usa senha e código do aplicativo autenticador."
    >
      {inicio.concluido === null ? (
        <form noValidate onSubmit={inicio.aoEnviar} className={estilos.formulario}>
          {inicio.erros.geral !== undefined && <Aviso tipo="erro">{inicio.erros.geral}</Aviso>}
          <Botao type="submit" larguraTotal carregando={inicio.enviando}>
            Gerar a chave do autenticador
          </Botao>
        </form>
      ) : (
        <>
          <Chave iniciado={inicio.concluido} />
          <Confirmacao aoConcluir={setCodigos} />
        </>
      )}
    </PaginaDeAcesso>
  );
}
