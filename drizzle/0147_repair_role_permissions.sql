-- Custom SQL migration file, put your code below! --

-- Repairs `roles.permissions` after the products+materials -> items merge (commit c1bbcaa,
-- 2026-08-07) renamed/dropped several codes in PERMISSION_CODES. That commit's migrations
-- (0089-0090) backfilled tables but never touched this jsonb column, so any role granted
-- `products:*`/`materials:*` before the merge has carried dead codes ever since — `hasPermission`
-- silently never matches them (see docs/domains/identity-access.md, "Permission rác vẫn có thể
-- được cấp"). Maps the known 1:1 renames, drops `materials:delete` (no replacement in `items:*`)
-- and any other code no longer in the current catalogue (e.g. a leftover `<resource>:manage` code
-- from the earlier granular-permissions refactor, commit 359623d), then re-aggregates with
-- duplicates removed (`products:read` and `materials:read` both map to `items:read`).
WITH permission_rename AS (
  SELECT * FROM (VALUES
    ('products:read', 'items:read'),
    ('products:create', 'items:create'),
    ('products:update', 'items:update'),
    ('products:copy', 'items:copy'),
    ('products:bom-manage', 'items:bom-manage'),
    ('materials:read', 'items:read'),
    ('materials:create', 'items:create'),
    ('materials:update', 'items:update')
  ) AS t(old_code, new_code)
),
valid_codes AS (
  SELECT unnest(ARRAY[
    'system:manage',
    'users:create', 'users:update',
    'roles:read', 'roles:create', 'roles:update', 'roles:delete',
    'clients:read', 'clients:create', 'clients:update', 'clients:delete',
    'items:read', 'items:create', 'items:update', 'items:copy', 'items:bom-manage',
    'operations:read',
    'suppliers:read', 'suppliers:create', 'suppliers:update', 'suppliers:delete',
    'orders:read', 'orders:create', 'orders:update', 'orders:approve',
    'inventory:read', 'inventory:create', 'inventory:update', 'inventory:delete',
    'inventory-requisitions:read', 'inventory-requisitions:create',
    'inventory-requisitions:update', 'inventory-requisitions:delete',
    'inventory-requisitions:approve', 'inventory-requisitions:issue',
    'production:read', 'production:create', 'production:update', 'production:approve',
    'purchase-requests:read', 'purchase-requests:create', 'purchase-requests:update',
    'purchase-requests:delete', 'purchase-requests:approve',
    'purchasing:read', 'purchasing:create', 'purchasing:update', 'purchasing:delete',
    'purchasing:approve',
    'iqc:read', 'iqc:create', 'iqc:update', 'iqc:delete',
    'outsourcing:read', 'outsourcing:create', 'outsourcing:update', 'outsourcing:delete',
    'oqc:read', 'oqc:create', 'oqc:update', 'oqc:delete',
    'qc-aql:read', 'qc-aql:create', 'qc-aql:update',
    'outbound:read', 'outbound:create', 'outbound:update'
  ]) AS code
),
repaired AS (
  SELECT
    r.id,
    coalesce(
      jsonb_agg(DISTINCT mapped.code ORDER BY mapped.code) FILTER (WHERE mapped.code IS NOT NULL),
      '[]'::jsonb
    ) AS new_permissions
  FROM roles r
  CROSS JOIN LATERAL jsonb_array_elements_text(r.permissions) AS p(code)
  LEFT JOIN permission_rename ON permission_rename.old_code = p.code
  CROSS JOIN LATERAL (SELECT coalesce(permission_rename.new_code, p.code) AS code) AS mapped
  WHERE mapped.code IN (SELECT code FROM valid_codes)
  GROUP BY r.id
)
UPDATE roles
SET permissions = repaired.new_permissions,
    updated_at = now()
FROM repaired
WHERE roles.id = repaired.id
  AND roles.permissions IS DISTINCT FROM repaired.new_permissions;
