import { Controller, Get, Query, BadRequestException, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('reports')
@UseGuards(PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('trial-balance')
  @RequirePermissions('reports:read')
  async trialBalance(
    @Query('asOf') asOf?: string,
    @Query('groupBy') groupBy?: string,
    @Query() filters?: Record<string, string>,
    @CurrentUser() user: any,
  ) {
    const groupByDimensions = groupBy ? groupBy.split(',') : [];
    
    // Extract dimension filters (exclude known params)
    const dimensionFilters: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters || {})) {
      if (key !== 'asOf' && key !== 'groupBy' && typeof value === 'string') {
        dimensionFilters[key] = value;
      }
    }

    const balances = await this.reportsService.trialBalance({
      asOf: asOf ? new Date(asOf) : undefined,
      groupBy: groupByDimensions,
      filterBy: dimensionFilters,
    });

    const isBalanced = await this.reportsService.verifyGlobalBalance(balances);

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId: user.userId,
        action: 'report.view',
        resource: 'trial_balance',
        details: {
          asOf,
          groupBy: groupByDimensions,
          filters: dimensionFilters,
        },
      },
    });
    
    return {
      balances,
      summary: {
        totalDebit: balances.reduce((sum, b) => sum + b.debit, 0),
        totalCredit: balances.reduce((sum, b) => sum + b.credit, 0),
        isBalanced,
        groupedBy: groupByDimensions,
        filters: dimensionFilters,
      },
    };
  }
}
