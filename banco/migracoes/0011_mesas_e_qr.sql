SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- O código é a identidade permanente da mesa; slug e número no link só servem para redirecionar: docs/adr/0012-mesas-e-qr.md
DROP FUNCTION app.resolver_mesa(text, integer, text);

CREATE FUNCTION app.resolver_mesa(p_slug text, p_numero integer, p_codigo text)
RETURNS TABLE (
  situacao text,
  restaurante_id uuid,
  mesa_id uuid,
  slug_atual text,
  numero_atual integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  achada record;
BEGIN
  SELECT m.restaurante_id AS rid, m.id AS mid, m.numero AS num, m.ativa AS ativa, r.slug AS slug, r.situacao AS sit
    INTO achada
    FROM public.mesas m
    JOIN public.restaurantes r ON r.id = m.restaurante_id
   WHERE m.codigo = p_codigo;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'desconhecido'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::integer;
    RETURN;
  END IF;

  IF achada.sit = 'cancelado' THEN
    RETURN QUERY SELECT 'cancelado'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::integer;
    RETURN;
  END IF;

  IF NOT achada.ativa THEN
    RETURN QUERY SELECT 'inativa'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::integer;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    CASE WHEN achada.slug = p_slug AND achada.num = p_numero THEN 'valida' ELSE 'redirecionar' END,
    achada.rid, achada.mid, achada.slug, achada.num;
END
$$;

REVOKE ALL ON FUNCTION app.resolver_mesa(text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolver_mesa(text, integer, text) TO app_runtime;
ALTER FUNCTION app.resolver_mesa(text, integer, text) OWNER TO funcoes_privilegiadas;

GRANT INSERT ON public.auditoria TO funcoes_privilegiadas;

CREATE FUNCTION app.admin_listar_mesas(p_administrador_id uuid, p_slug text)
RETURNS TABLE (
  restaurante_id uuid,
  restaurante_nome text,
  slug text,
  mesa_id uuid,
  numero integer,
  nome text,
  area text,
  codigo text,
  ativa boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  restaurante record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.administradores a
     WHERE a.id = p_administrador_id AND a.ativo AND a.segredo_totp_cifrado IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  SELECT r.id AS id, r.nome AS nome, r.slug AS slug INTO restaurante
    FROM public.restaurantes r WHERE r.slug = p_slug;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.auditoria (restaurante_id, autor_tipo, autor_id, acao, entidade)
  VALUES (restaurante.id, 'administrador', p_administrador_id, 'consultar', 'mesas');

  RETURN QUERY
    SELECT restaurante.id, restaurante.nome, restaurante.slug, m.id, m.numero, m.nome, m.area, m.codigo, m.ativa
      FROM (SELECT 1) AS sempre
      LEFT JOIN public.mesas m ON m.restaurante_id = restaurante.id
     ORDER BY m.numero;
END
$$;

REVOKE ALL ON FUNCTION app.admin_listar_mesas(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.admin_listar_mesas(uuid, text) TO app_runtime;
ALTER FUNCTION app.admin_listar_mesas(uuid, text) OWNER TO funcoes_privilegiadas;
