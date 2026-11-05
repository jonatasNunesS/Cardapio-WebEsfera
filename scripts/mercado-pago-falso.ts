import { criarMercadoPagoFalso } from '../pacotes/infraestrutura/src/index.ts';

const porta = Number(process.env.PORTA_MERCADO_PAGO_FALSO ?? '3999');
const falso = criarMercadoPagoFalso({
  tokenDeAcesso: process.env.MP_ACCESS_TOKEN ?? '',
  segredoDoWebhook: process.env.MP_WEBHOOK_SECRET ?? '',
  webhook:
    process.env.URL_AVISO_FALSO === undefined
      ? undefined
      : { url: process.env.URL_AVISO_FALSO, host: process.env.HOST_AVISO_FALSO ?? 'painel.localhost' },
});

const endereco = await falso.ouvir(porta, process.env.HOST_MERCADO_PAGO_FALSO ?? '127.0.0.1');
process.stdout.write(`mercado pago falso pronto em ${endereco}\n`);

process.on('SIGTERM', () => {
  void falso.encerrar().then(() => process.exit(0));
});
