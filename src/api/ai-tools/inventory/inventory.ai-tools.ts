import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';

import { GetInventoryDirectsReqDto } from '../../inventory-directs/dto/get-inventory-directs.req.dto';
import { InventoryDirectsService } from '../../inventory-directs/inventory-directs.service';
import { AiToolPermissionService } from '../core/ai-tool-permission.service';
import {
  clampLimit,
  createRequestDto,
  formatListResult,
  serializeToolRows,
} from '../core/ai-tool.result';
import type { AiToolProvider } from '../core/ai-tool.type';
import { MaterialShortageResDto } from './dto/material-shortage.res.dto';
import {
  listInventoryShortagesSchema,
  type ListInventoryShortagesInput,
} from './inventory.schemas';

@Injectable()
export class InventoryAiTools implements AiToolProvider {
  constructor(
    private readonly inventoryDirectsService: InventoryDirectsService,
    private readonly toolPermission: AiToolPermissionService,
  ) {}

  getTools(): StructuredToolInterface[] {
    return [
      tool(
        this.toolPermission.withPermission(
          'inventory:read',
          (input: ListInventoryShortagesInput) =>
            this.listInventoryShortages(input),
        ),
        {
          name: 'list_inventory_shortages',
          description:
            'Vật tư thiếu hoặc sắp thiếu: tồn khả dụng (tồn kho trừ hàng đã giữ trừ nhu cầu BOM) so với tồn tối thiểu. ' +
            'status=SHORTAGE: đã thiếu (khả dụng < 0); status=WARNING: sắp thiếu (dưới tồn tối thiểu).',
          schema: listInventoryShortagesSchema,
        },
      ),
    ];
  }

  private async listInventoryShortages({
    status,
    limit,
  }: ListInventoryShortagesInput): Promise<string> {
    const page = await this.inventoryDirectsService.getInventoryDirects(
      createRequestDto(GetInventoryDirectsReqDto, {
        limit: clampLimit(limit),
        status,
      }),
    );
    return formatListResult({
      rows: serializeToolRows(MaterialShortageResDto, page.data),
      total: page.pagination.totalRecords,
      extra: { status },
    });
  }
}
