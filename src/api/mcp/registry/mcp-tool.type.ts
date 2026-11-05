import type { Type } from '@nestjs/common';
import type { z } from 'zod';

import type { McpDomain } from '../mcp.constant';
import type { HandlerArg } from './handler-args';

export interface McpTool {
  name: string;
  title: string;
  description: string;
  domain: McpDomain;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  controller: Type<object>;
  method: string;
  handlerArgs: HandlerArg[];
}
