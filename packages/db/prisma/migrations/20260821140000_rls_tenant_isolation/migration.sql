-- Hardening multi-tenant: Row Level Security (organización)
-- Cuando app.current_org_id está definido, filtra por organización.
-- Sin setting (boot/seed/login) no bloquea — defensa en profundidad gradual.
-- Bypass explícito: set_config('app.rls_bypass', 'on', true)

CREATE OR REPLACE FUNCTION fleetline_rls_org_ok(org_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    current_setting('app.rls_bypass', true) = 'on'
    OR NULLIF(current_setting('app.current_org_id', true), '') IS NULL
    OR org_id = current_setting('app.current_org_id', true);
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'User',
    'Employee',
    'Driver',
    'Vehicle',
    'Customer',
    'Trip',
    'WorkOrder',
    'ArchiveDocument',
    'StationeryItem',
    'DocumentLoan',
    'ParkingLog',
    'Visitor',
    'Invoice',
    'PurchaseOrder',
    'Payment',
    'AuditLog'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      -- FORCE solo cuando el rol de app no es owner; con owner se documenta en SECURITY.md
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I
           FOR ALL
           USING (fleetline_rls_org_ok("organizationId"))
           WITH CHECK (fleetline_rls_org_ok("organizationId"))',
        t
      );
    END IF;
  END LOOP;
END $$;
