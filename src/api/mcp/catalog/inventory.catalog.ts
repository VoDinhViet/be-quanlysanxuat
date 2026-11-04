import { InventoryAdjustmentsController } from '../../inventory-adjustments/inventory-adjustments.controller';
import { InventoryDirectsController } from '../../inventory-directs/inventory-directs.controller';
import { InventoryIssuesController } from '../../inventory-issues/inventory-issues.controller';
import { InventoryProductsController } from '../../inventory-products/inventory-products.controller';
import { InventoryReceiptsController } from '../../inventory-receipts/inventory-receipts.controller';
import { InventoryRequisitionsController } from '../../inventory-requisitions/inventory-requisitions.controller';
import { InventoryController } from '../../inventory/inventory.controller';
import { SupplierReturnsController } from '../../supplier-returns/supplier-returns.controller';
import { defineMcpTool } from './define-mcp-tool';

export const INVENTORY_TOOLS = [
  defineMcpTool({
    name: 'inventory_balance_list',
    title: 'Tồn kho theo kho và mã hàng',
    hint: 'Raw stock balance per warehouse and item; reservedQuantity is computed when read; use inventory_stock_ranking_list for the highest, lowest or below-minimum items',
    controller: InventoryController,
    method: 'getInventoryBalances',
  }),
  defineMcpTool({
    name: 'inventory_stock_ranking_list',
    title: 'Xếp hạng vật tư theo tồn kho',
    hint: 'Items ranked by stock quantity, highest or lowest first, optionally only items below their minimum stock',
    controller: InventoryController,
    method: 'getStockRanking',
  }),
  defineMcpTool({
    name: 'inventory_transaction_list',
    title: 'Sổ cái kho',
    hint: 'Stock ledger movements (in, out, adjustment) filtered by item, type, reference document or date',
    controller: InventoryController,
    method: 'getInventoryTransactions',
  }),
  defineMcpTool({
    name: 'inventory_material_stock_list',
    title: 'Tồn kho vật tư',
    hint: 'Material (DIRECT) stock with onHand, reserved, bomDemand, available and status per item',
    controller: InventoryDirectsController,
    method: 'getInventoryDirects',
  }),
  defineMcpTool({
    name: 'inventory_material_held_requisition_list',
    title: 'Phiếu lãnh đang giữ vật tư',
    hint: 'Requisitions currently holding stock of one material, by itemId; explains why available is lower than onHand',
    controller: InventoryDirectsController,
    method: 'getHeldRequisitions',
  }),
  defineMcpTool({
    name: 'inventory_product_stock_list',
    title: 'Tồn kho thành phẩm',
    hint: 'Finished-goods stock with onHand, reserved, bomDemand, available and status per item',
    controller: InventoryProductsController,
    method: 'getInventoryProducts',
  }),
  defineMcpTool({
    name: 'inventory_product_ledger_list',
    title: 'Sổ kho thành phẩm',
    hint: 'Stock ledger of one finished good by itemId',
    controller: InventoryProductsController,
    method: 'getProductLedger',
  }),
  defineMcpTool({
    name: 'inventory_receipt_list',
    title: 'Danh sách phiếu nhập kho',
    hint: 'Goods receipts filtered by receipt type, status, supplier, customer, LSX/JOB or DMH',
    controller: InventoryReceiptsController,
    method: 'getInventoryReceipts',
  }),
  defineMcpTool({
    name: 'inventory_receipt_status_stats',
    title: 'Số phiếu nhập kho theo loại và trạng thái',
    hint: 'Goods receipt counts by receipt type and status over a receipt date range',
    controller: InventoryReceiptsController,
    method: 'getReceiptStatusStats',
  }),
  defineMcpTool({
    name: 'inventory_receipt_get',
    title: 'Chi tiết phiếu nhập kho',
    hint: 'One goods receipt by receiptId, with its lines',
    controller: InventoryReceiptsController,
    method: 'getInventoryReceipt',
  }),
  defineMcpTool({
    name: 'inventory_receipt_note_list',
    title: 'Ghi chú theo chuỗi mua hàng của phiếu nhập',
    hint: 'Notes written along the purchasing chain of one goods receipt',
    controller: InventoryReceiptsController,
    method: 'getRelatedNotes',
  }),
  defineMcpTool({
    name: 'inventory_issue_list',
    title: 'Danh sách phiếu xuất kho',
    hint: 'Goods issues filtered by issue type, status, LSX/JOB or department',
    controller: InventoryIssuesController,
    method: 'getInventoryIssues',
  }),
  defineMcpTool({
    name: 'inventory_issue_get',
    title: 'Chi tiết phiếu xuất kho',
    hint: 'One goods issue by issueId, with its lines',
    controller: InventoryIssuesController,
    method: 'getInventoryIssue',
  }),
  defineMcpTool({
    name: 'inventory_requisition_list',
    title: 'Danh sách phiếu lãnh vật tư',
    hint: 'Material requisitions filtered by type, status, creator or LSX/JOB',
    controller: InventoryRequisitionsController,
    method: 'getInventoryRequisitions',
  }),
  defineMcpTool({
    name: 'inventory_requisition_get',
    title: 'Chi tiết phiếu lãnh vật tư',
    hint: 'One material requisition by requisitionId, with its lines',
    controller: InventoryRequisitionsController,
    method: 'getInventoryRequisition',
  }),
  defineMcpTool({
    name: 'inventory_requisition_line_list',
    title: 'Dòng vật tư có thể lãnh theo JOB',
    hint: 'Requisition picker lines of a JOB: BOM quantity, already issued, on hand, reserved and available',
    controller: InventoryRequisitionsController,
    method: 'getRequisitionLines',
  }),
  defineMcpTool({
    name: 'inventory_adjustment_list',
    title: 'Danh sách phiếu điều chỉnh tồn kho',
    hint: 'Inventory adjustments (stocktake corrections)',
    controller: InventoryAdjustmentsController,
    method: 'getInventoryAdjustments',
  }),
  defineMcpTool({
    name: 'inventory_adjustment_get',
    title: 'Chi tiết phiếu điều chỉnh tồn kho',
    hint: 'One inventory adjustment by adjustmentId',
    controller: InventoryAdjustmentsController,
    method: 'getInventoryAdjustment',
  }),
  defineMcpTool({
    name: 'inventory_supplier_return_list',
    title: 'Danh sách phiếu trả nhà cung cấp',
    hint: 'Returns of goods to suppliers',
    controller: SupplierReturnsController,
    method: 'getSupplierReturns',
  }),
  defineMcpTool({
    name: 'inventory_supplier_return_get',
    title: 'Chi tiết phiếu trả nhà cung cấp',
    hint: 'One supplier return by supplierReturnId',
    controller: SupplierReturnsController,
    method: 'getSupplierReturn',
  }),
  defineMcpTool({
    name: 'inventory_supplier_return_summary',
    title: 'Tổng hợp phiếu trả nhà cung cấp',
    hint: 'Supplier return count and quantity grouped by status or supplier, optionally within a return date range',
    controller: SupplierReturnsController,
    method: 'getSupplierReturnSummary',
  }),
];
