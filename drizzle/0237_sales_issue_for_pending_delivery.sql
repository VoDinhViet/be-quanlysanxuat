-- DO đang "Chờ xuất kho" (PENDING_DELIVERY) được duyệt theo luồng cũ nên chưa có phiếu xuất kho.
-- Từ giờ DO chỉ thành DELIVERED khi thủ kho ghi sổ phiếu xuất SALES gắn DO, nên tạo phiếu nháp cho
-- các DO đó (mã PXK lấy từ `document_sequences` giống `generateDocumentSequence`). Chạy lại không
-- tạo trùng vì chỉ chọn DO chưa có phiếu xuất.
DO $$
DECLARE
  pending_delivery RECORD;
  issue_year integer := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::integer;
  issue_sequence integer;
  new_issue_id uuid;
BEGIN
  FOR pending_delivery IN
    SELECT outbound_order.id, outbound_order.approved_by
    FROM outbound_orders AS outbound_order
    WHERE outbound_order.status = 'PENDING_DELIVERY'
      AND NOT EXISTS (
        SELECT 1 FROM inventory_issues AS issue
        WHERE issue.outbound_order_id = outbound_order.id
      )
    ORDER BY outbound_order.approved_at, outbound_order.created_at
  LOOP
    INSERT INTO document_sequences (document_type, year, current_value)
    VALUES ('INVENTORY_ISSUE', issue_year, 1)
    ON CONFLICT (document_type, year)
    DO UPDATE SET current_value = document_sequences.current_value + 1
    RETURNING current_value INTO issue_sequence;

    INSERT INTO inventory_issues (code, issue_type, status, issue_date, outbound_order_id, created_by)
    VALUES (
      'PXK-' || issue_year || '-' || lpad(issue_sequence::text, 5, '0'),
      'SALES',
      'DRAFT',
      (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      pending_delivery.id,
      pending_delivery.approved_by
    )
    RETURNING id INTO new_issue_id;

    INSERT INTO inventory_issue_items (issue_id, item_id, unit_id, quantity, order_item_id)
    SELECT new_issue_id, outbound_item.item_id, item.unit_id, outbound_item.quantity, outbound_item.order_item_id
    FROM outbound_order_items AS outbound_item
    JOIN items AS item ON item.id = outbound_item.item_id
    WHERE outbound_item.outbound_order_id = pending_delivery.id;
  END LOOP;
END $$;
