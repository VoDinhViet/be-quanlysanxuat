import type { RunnableConfig } from '@langchain/core/runnables';
import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';

import type { PermissionCode } from '../../../constants/permission.constant';
import { InventoryDirectsService } from '../../inventory-directs/inventory-directs.service';
import { PurchaseOrdersService } from '../../purchase-orders/purchase-orders.service';
import { ReportsService } from '../../reports/reports.service';
import { getUserIdFromConfig } from '../core/ai-tool.context';
import {
  isPermissionGranted,
  AiToolPermissionService,
} from '../core/ai-tool-permission.service';
import { formatToolResult } from '../core/ai-tool.result';
import type { AiToolProvider } from '../core/ai-tool.type';
import { evaluateRisks } from './risk-evaluator';
import { RISK_LEVEL_LABELS } from './risk.constant';
import { assessOperationalRisksSchema } from './risk.schemas';
import {
  collectMaterialSignals,
  collectPurchasingSignals,
  collectReportSignals,
} from './risk.signals';
import type { RiskSignals } from './risk.type';

/** One place the risk signals come from, and the permission needed to read it. */
type RiskSource = {
  label: string;
  requiredPermission: PermissionCode;
  collect: () => Promise<RiskSignals>;
};

@Injectable()
export class RiskAiTools implements AiToolProvider {
  private readonly sources: RiskSource[] = [
    {
      label: 'Báo cáo tổng hợp (job, đơn bán, NCR, gia công, giao hàng)',
      requiredPermission: 'reports:read',
      collect: () => collectReportSignals(this.reportsService),
    },
    {
      label: 'Tồn kho vật tư',
      requiredPermission: 'inventory:read',
      collect: () => collectMaterialSignals(this.inventoryDirectsService),
    },
    {
      label: 'Đơn mua hàng',
      requiredPermission: 'purchasing:read',
      collect: () => collectPurchasingSignals(this.purchaseOrdersService),
    },
  ];

  constructor(
    private readonly reportsService: ReportsService,
    private readonly inventoryDirectsService: InventoryDirectsService,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly toolPermission: AiToolPermissionService,
  ) {}

  getTools(): StructuredToolInterface[] {
    return [
      tool((_input, config) => this.assessOperationalRisks(config), {
        name: 'assess_operational_risks',
        description:
          'Đánh giá rủi ro vận hành bằng quy tắc cố định: job và đơn bán trễ hạn, vật tư thiếu, NCR mở, gia công trễ, ' +
          'giao hàng sắp tới, đơn mua trễ ngày giao. Trả về mức rủi ro (CAO / TRUNG BÌNH / THẤP) cho từng nhóm kèm mã chứng từ ví dụ. ' +
          'skippedSources là các nguồn dữ liệu chưa đánh giá do người dùng thiếu quyền. Dùng khi hỏi về rủi ro, cảnh báo, điểm cần chú ý.',
        schema: assessOperationalRisksSchema,
      }),
    ];
  }

  private async assessOperationalRisks(
    config: RunnableConfig,
  ): Promise<string> {
    const grantedCodes = await this.toolPermission.loadGrantedCodes(
      getUserIdFromConfig(config),
    );
    const permitted = this.sources.filter((source) =>
      isPermissionGranted(grantedCodes, source.requiredPermission),
    );
    const skippedSources = this.sources
      .filter((source) => !permitted.includes(source))
      .map((source) => source.label);

    const collected = await Promise.all(
      permitted.map((source) => source.collect()),
    );
    const { overallLevel, risks } = evaluateRisks(
      Object.assign({}, ...collected) as RiskSignals,
    );

    return formatToolResult({
      overallLevel: RISK_LEVEL_LABELS[overallLevel],
      risks: risks.map((risk) => ({
        ...risk,
        level: RISK_LEVEL_LABELS[risk.level],
      })),
      skippedSources,
    });
  }
}
