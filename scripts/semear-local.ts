import { generate } from 'otplib';
import { CONTAS_LOCAIS, lerAmbienteDaSemente, SEGREDO_TOTP_LOCAL } from './semear-local/ambiente.ts';
import { semearAdmin } from './semear-local/admin.ts';
import { semearRestaurante } from './semear-local/restaurante.ts';

const PORTAS = { painel: 5173, admin: 5174, cardapio: 5175 } as const;

function linkLocal(link: string, hostDoCardapio: string): string {
  const lido = new URL(link);
  return `http://${hostDoCardapio}:${String(PORTAS.cardapio)}${lido.pathname}${lido.search}`;
}

async function executar(): Promise<void> {
  const ambiente = lerAmbienteDaSemente(process.env);
  await semearAdmin(ambiente);
  const { slug, mesas } = await semearRestaurante(ambiente);
  const { hosts } = ambiente;
  console.log('Semente local pronta (pode rodar de novo: nada é duplicado).');
  console.log(`\nAdmin:  http://${hosts.admin}:${String(PORTAS.admin)}/entrar`);
  console.log(`  e-mail ${CONTAS_LOCAIS.admin.email}  senha ${CONTAS_LOCAIS.admin.senha}`);
  console.log(
    `  segredo TOTP ${SEGREDO_TOTP_LOCAL} (código agora: ${await generate({ secret: SEGREDO_TOTP_LOCAL })}; depois: pnpm totp:local)`,
  );
  console.log(`\nPainel: http://${hosts.painel}:${String(PORTAS.painel)}/entrar`);
  console.log(`  e-mail ${CONTAS_LOCAIS.dono.email}  senha ${CONTAS_LOCAIS.dono.senha}  restaurante ${slug}`);
  console.log('\nMesas:');
  for (const mesa of mesas) {
    console.log(`  ${String(mesa.numero)}: ${linkLocal(mesa.link, hosts.cardapio)}`);
  }
}

if (import.meta.main) {
  await executar();
}
