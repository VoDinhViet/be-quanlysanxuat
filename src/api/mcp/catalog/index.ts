import type { McpCatalogEntry } from './define-mcp-tool';
import { INVENTORY_TOOLS } from './inventory.catalog';
import { ORG_TOOLS } from './org.catalog';
import { PRODUCT_TOOLS } from './product.catalog';
import { PRODUCTION_TOOLS } from './production.catalog';
import { PURCHASING_TOOLS } from './purchasing.catalog';
import { QUALITY_TOOLS } from './quality.catalog';
import { REPORT_TOOLS } from './report.catalog';
import { SALES_TOOLS } from './sales.catalog';
import { TRACE_TOOLS } from './trace.catalog';

export const MCP_CATALOG: McpCatalogEntry[] = [
  ...SALES_TOOLS,
  ...PURCHASING_TOOLS,
  ...INVENTORY_TOOLS,
  ...PRODUCT_TOOLS,
  ...PRODUCTION_TOOLS,
  ...QUALITY_TOOLS,
  ...TRACE_TOOLS,
  ...REPORT_TOOLS,
  ...ORG_TOOLS,
];
