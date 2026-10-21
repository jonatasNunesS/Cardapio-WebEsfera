SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE SCHEMA app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO app_runtime, app_sistema;
GRANT USAGE, CREATE ON SCHEMA app TO funcoes_privilegiadas;

ALTER DEFAULT PRIVILEGES FOR ROLE cardapio_dono REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE FUNCTION app.restaurante_atual() RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT nullif(current_setting('app.restaurante_id', true), '')::uuid
$$;

REVOKE ALL ON FUNCTION app.restaurante_atual() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.restaurante_atual() TO app_runtime, app_sistema, funcoes_privilegiadas;
