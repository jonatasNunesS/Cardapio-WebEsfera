import '@cardapio/ui/fontes/painel.css';
import { configuracaoDoBuild, FronteiraDeErro, iniciarSentryWeb } from '@cardapio/observabilidade/web';
import { montarAplicacao, TelaDeErro } from '@cardapio/ui';
import { PaginaInicial } from './PaginaInicial.tsx';

iniciarSentryWeb({ app: 'admin', ...configuracaoDoBuild() });
montarAplicacao(PaginaInicial, (conteudo) => (
  <FronteiraDeErro TelaDeErro={TelaDeErro}>{conteudo}</FronteiraDeErro>
));
