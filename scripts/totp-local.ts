import { generate } from 'otplib';
import { SEGREDO_TOTP_LOCAL } from './semear-local/ambiente.ts';

if (import.meta.main) {
  if (process.env.APP_ENV !== 'local') {
    throw new Error('pnpm totp:local só roda com APP_ENV=local.');
  }
  console.log(await generate({ secret: SEGREDO_TOTP_LOCAL }));
}
