import { TracesController } from '../../traces/traces.controller';
import { defineMcpTool } from './define-mcp-tool';

export const TRACE_TOOLS = [
  defineMcpTool({
    name: 'order_trace_get',
    domain: 'sales',
    title: 'Truy vết đơn bán',
    hint: 'Trace one sales order (SO) by orderCode through LSX, JOB, operations, OQC, purchase requests, DMH, receipts, IQC and returns',
    controller: TracesController,
    method: 'getOrderTrace',
  }),
  defineMcpTool({
    name: 'purchasing_document_trace_get',
    title: 'Truy vết chứng từ mua hàng',
    hint: 'Trace a purchasing document by code (purchase request, DMH, receipt, IQC, supplier return or payment request) in both directions',
    controller: TracesController,
    method: 'getPurchaseTrace',
  }),
  defineMcpTool({
    name: 'purchasing_supplier_trace_get',
    title: 'Truy vết nhà cung cấp',
    hint: 'Trace a supplier by code or name: open DMH, recent IQC failures, pending returns, open OS-OUT and affected sales orders (SO)',
    controller: TracesController,
    method: 'getSupplierTrace',
  }),
  defineMcpTool({
    name: 'product_item_supply_trace_get',
    title: 'Truy vết nguồn cung vật tư',
    hint: 'Trace the supply of an item by itemCode: products using it in BOM, open purchase requests and open DMH',
    controller: TracesController,
    method: 'getItemSupplyTrace',
  }),
  defineMcpTool({
    name: 'product_item_structure_trace_get',
    title: 'Truy vết cấu trúc sản phẩm',
    hint: 'Trace the BOM tree and operations of a product by itemCode',
    controller: TracesController,
    method: 'getItemStructureTrace',
  }),
];
