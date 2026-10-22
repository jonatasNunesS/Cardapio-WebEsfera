SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

REVOKE UPDATE (fechada_em) ON public.sessoes_mesa FROM app_sistema;
