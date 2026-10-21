-- Executado por um administrador (superusuário), nunca pelas migrações.
-- Idempotente. Cria os papéis sem login e as permissões no banco atual.
-- Os usuários de login (com senha) são criados à parte: docs/runbooks/banco.md.

DO $$
DECLARE
  papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['cardapio_dono', 'app_runtime', 'app_sistema'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE', papel);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'funcoes_privilegiadas') THEN
    CREATE ROLE funcoes_privilegiadas NOLOGIN NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  EXECUTE format('GRANT CREATE ON DATABASE %I TO cardapio_dono', current_database());
END
$$;

GRANT funcoes_privilegiadas TO cardapio_dono WITH INHERIT FALSE, SET TRUE;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO cardapio_dono;
GRANT USAGE ON SCHEMA public TO app_runtime, app_sistema, funcoes_privilegiadas;
