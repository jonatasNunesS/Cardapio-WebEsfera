import '@cardapio/ui/fontes/painel.css';
import { configuracaoDoBuild, FronteiraDeErro, iniciarSentryWeb } from '@cardapio/observabilidade/web';
import { montarAplicacao, TelaErro } from '@cardapio/ui';
import { Aplicacao } from './Aplicacao.tsx';

iniciarSentryWeb({ app: 'painel', ...configuracaoDoBuild() });
montarAplicacao(Aplicacao, (conteudo) => <FronteiraDeErro TelaDeErro={TelaErro}>{conteudo}</FronteiraDeErro>);
