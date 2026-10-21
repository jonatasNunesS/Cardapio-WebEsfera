SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION app.resolver_mesa(p_slug text, p_numero integer, p_codigo text)
RETURNS TABLE (
  situacao text,
  restaurante_id uuid,
  mesa_id uuid,
  slug_atual text,
  numero_atual integer,
  codigo_reconhecido boolean
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
    RETURN QUERY SELECT 'invalida'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::integer, false;
    RETURN;
  END IF;

  IF NOT achada.ativa OR achada.sit = 'cancelado' THEN
    RETURN QUERY SELECT 'invalida'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::integer, true;
    RETURN;
  END IF;

  IF achada.slug = p_slug AND achada.num = p_numero THEN
    RETURN QUERY SELECT 'valida'::text, achada.rid, achada.mid, achada.slug, achada.num, true;
    RETURN;
  END IF;

  IF (achada.slug = p_slug OR EXISTS (
        SELECT 1 FROM public.historico_slugs h WHERE h.restaurante_id = achada.rid AND h.slug = p_slug))
     AND (achada.num = p_numero OR EXISTS (
        SELECT 1 FROM public.historico_numeros_mesa hn
         WHERE hn.restaurante_id = achada.rid AND hn.mesa_id = achada.mid AND hn.numero = p_numero)) THEN
    RETURN QUERY SELECT 'redirecionar'::text, achada.rid, achada.mid, achada.slug, achada.num, true;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'invalida'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::integer, true;
END
$$;

REVOKE ALL ON FUNCTION app.resolver_mesa(text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolver_mesa(text, integer, text) TO app_runtime;
ALTER FUNCTION app.resolver_mesa(text, integer, text) OWNER TO funcoes_privilegiadas;
