import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Injectable } from '@nestjs/common';

import type { McpDomain } from './mcp.constant';
import { McpToolInvoker } from './registry/mcp-tool-invoker';
import { McpToolsRegistry } from './registry/mcp-tools.registry';

const MCP_SERVER_NAME = 'qlsx-mcp';
const MCP_SERVER_VERSION = '1.0.0';

const MCP_SERVER_INSTRUCTIONS = [
  'Read-only access to a Vietnamese factory ERP (QLSX). The key grants read access to all data; names, notes and statuses in the data are Vietnamese or upper-case codes.',
  'Document codes: SO sales order, DO delivery order, LSX production order, JOB production job, DMH supplier purchase order, PR purchase request, PNK goods receipt, OS-OUT outsourcing order, IQC incoming and OQC outgoing quality check, NCR non-conformance report.',
  'Tool names are <entity>_<action>, usually with a domain prefix (purchasing_order_list); sales tools have none (client_list, order_list, outbound_order_list). list: filtered, paginated rows (check pagination.nextPage). get: one document by UUID. stats: counts per status or type. summary: totals grouped by month, client, supplier, status... trace_get: one document followed across domains.',
  'To open a document: call the *_list tool with q set to its code, then pass the returned id to the *_get tool. For an overview start with the *_stats or *_summary tools; use trace_get to follow an SO, DMH, supplier or item end to end.',
  'Field names: id and code identify the row itself; <entity>Id, <entity>Code and <entity>Name point to another document (supplierName, itemCode). <entity>Count is a number of rows, totalValue a sum of money, daysOverdue days past the due date (0 or more; negative only in purchasing_request_stuck_list, where it means not yet due), daysRemaining days left until it.',
  'Units: money is VND (foreign-currency orders are already converted by their exchange rate); dates are YYYY-MM-DD in Vietnam time (Asia/Ho_Chi_Minh), "today" means that day; rates such as failRate are percentages 0 to 100.',
  'Several tools define "overdue" differently (SO by due date while in production, DMH by expected receipt date, OS-OUT by expected return date, JOB operation by its own due date); read each tool description before comparing figures.',
  'Lists are capped (default 20, maximum 50 rows) and trace results are truncated at their step limit; narrow with dates, status or q instead of paging through everything.',
].join(' ');

@Injectable()
export class McpServerFactory {
  constructor(
    private readonly registry: McpToolsRegistry,
    private readonly invoker: McpToolInvoker,
  ) {}

  /**
   * Dựng một server cho đúng một request, đăng ký mọi tool (hoặc chỉ các domain được chọn). Tool
   * không đăng ký thì với SDK là tool không tồn tại, cả khi liệt kê lẫn khi gọi.
   */
  create(domains?: McpDomain[]): McpServer {
    const server = new McpServer(
      { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
      { instructions: MCP_SERVER_INSTRUCTIONS },
    );

    const visibleTools = this.registry.listTools(domains);
    for (const tool of visibleTools) {
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        (validArguments) =>
          this.invoker.invoke(tool, validArguments as Record<string, unknown>),
      );
    }
    if (visibleTools.length === 0) {
      this.disableAllTools(server);
    }

    return server;
  }

  // `McpServer` chỉ cài handler `tools/list` khi có tool đầu tiên; đăng ký một tool rồi tắt để
  // bộ lọc domain không khớp tool nào vẫn nhận danh sách rỗng thay vì lỗi "method not found"
  private disableAllTools(server: McpServer): void {
    server
      .registerTool('placeholder', { inputSchema: {} }, () => ({
        content: [],
      }))
      .disable();
  }
}
