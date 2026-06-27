import { Injectable, Logger } from '@nestjs/common';
import { ArticleRunStatus } from '@cms-ng/shared';
import { PipelineStep, PipelineContext } from '../step.interface';
import { BillingService } from '../../../billing/billing.service';
import { EstimateOperationType } from '../../../billing/dto/estimate-cost.dto';

@Injectable()
export class BillingCheckStep implements PipelineStep {
  readonly name = 'billing_check';
  readonly successStatus = ArticleRunStatus.PENDING; // Pre-check only — doesn't advance status
  private readonly logger = new Logger(BillingCheckStep.name);

  constructor(private billingService: BillingService) {}

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const trace = ctx.trace?.[ctx.trace.length - 1];

    // If billing is disabled, skip entirely
    if (!this.billingService.isEnabled()) {
      this.logger.debug('Billing disabled — skipping balance check');
      if (trace) {
        trace.metadata = { balanceCheckEnabled: false };
        trace.decisions = ['Billing disabled — skipping balance check'];
      }
      return ctx;
    }

    // Estimate cost for a single auto-published article (AI generation + platform publish)
    const estimation = await this.billingService.estimateCost(ctx.userId, {
      operationType: EstimateOperationType.AUTO_PUBLISH,
      batchSize: 1,
      platforms: [ctx.publishConfig.platform],
    });

    if (!estimation.sufficientBalance) {
      if (trace) {
        trace.metadata = {
          balanceCheckEnabled: true,
          currentBalance: Number(estimation.currentBalance),
          estimatedCost: Number(estimation.estimatedCost),
          breakdown: estimation.breakdown,
        };
        trace.decisions = [
          `Insufficient balance: need ¥${estimation.estimatedCost.toFixed(4)}, have ¥${estimation.currentBalance.toFixed(4)}`,
        ];
      }
      throw new Error(
        `Insufficient balance for auto-publish: need ¥${estimation.estimatedCost.toFixed(4)}, ` +
          `have ¥${estimation.currentBalance.toFixed(4)}`,
      );
    }

    if (trace) {
      trace.metadata = {
        balanceCheckEnabled: true,
        currentBalance: Number(estimation.currentBalance),
        estimatedCost: Number(estimation.estimatedCost),
        breakdown: estimation.breakdown,
      };
      trace.decisions = [
        `Balance check passed: ¥${estimation.currentBalance.toFixed(4)} available, ¥${estimation.estimatedCost.toFixed(4)} estimated`,
      ];
    }

    this.logger.debug(
      `Balance check passed for user ${ctx.userId}: ` +
        `balance=¥${estimation.currentBalance.toFixed(4)}, ` +
        `estimated=¥${estimation.estimatedCost.toFixed(4)}`,
    );

    return ctx;
  }
}
