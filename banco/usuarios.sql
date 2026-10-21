-- Executado por um administrador com as variáveis do psql
-- senha_migracao, senha_api e senha_worker. Idempotente.

SELECT format('CREATE ROLE %I LOGIN', nome)
FROM (VALUES ('cardapio_migracao'), ('cardapio_api'), ('cardapio_worker')) AS usuarios (nome)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = nome) \gexec

ALTER ROLE cardapio_migracao WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD :'senha_migracao';
ALTER ROLE cardapio_api WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD :'senha_api';
ALTER ROLE cardapio_worker WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD :'senha_worker';

GRANT cardapio_dono TO cardapio_migracao WITH INHERIT TRUE, SET TRUE;
GRANT app_runtime TO cardapio_api WITH INHERIT TRUE;
GRANT app_runtime TO cardapio_worker WITH INHERIT TRUE;
GRANT app_sistema TO cardapio_worker WITH INHERIT FALSE, SET TRUE;
