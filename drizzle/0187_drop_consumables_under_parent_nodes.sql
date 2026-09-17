-- Data migration: vật tư (CONSUMABLE) chỉ được gắn vào node BOM lá — xoá mọi CONSUMABLE đang nằm
-- dưới node đã có con COMPONENT (docs/domains/product-structure.md). Không đổi schema.
DELETE FROM "bom_items" c
USING "bom_items" p
WHERE c."parent_id" = p."id"
  AND c."type" = 'CONSUMABLE'
  AND EXISTS (
    SELECT 1 FROM "bom_items" s
    WHERE s."parent_id" = p."id" AND s."type" = 'COMPONENT'
  );
