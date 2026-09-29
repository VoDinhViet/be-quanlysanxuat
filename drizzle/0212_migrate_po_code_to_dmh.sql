UPDATE "purchase_orders"
SET "code" = regexp_replace("code", '^PO-', 'DMH-')
WHERE "code" ~ '^PO-[0-9]+$';
