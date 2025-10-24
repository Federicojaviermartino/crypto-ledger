import { PrismaClient } from '@prisma/client';

/**
 * FIFO lot tracking service
 * Manages cost basis and realized P&L for crypto disposals
 */
export class LotService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new lot from acquisition
   */
  async createLot(data: {
    asset: string;
    quantity: number;
    costBasis: number;
    acquiredAt: Date;
    acquiredFrom?: string;
    sourceEventId?: string;
    journalEntryId?: string;
  }): Promise<any> {
    const costPerUnit = data.costBasis / data.quantity;

    return this.prisma.lot.create({
      data: {
        asset: data.asset,
        quantity: data.quantity,
        costBasis: data.costBasis,
        costPerUnit,
        acquiredAt: data.acquiredAt,
        acquiredFrom: data.acquiredFrom,
        sourceEventId: data.sourceEventId,
        journalEntryId: data.journalEntryId,
        remainingQty: data.quantity,
        disposed: false,
      },
    });
  }

  /**
   * Dispose lots using FIFO method
   * Returns array of disposals with realized P&L
   */
  async disposeLots(data: {
    asset: string;
    quantity: number;
    proceeds: number;
    disposedAt: Date;
    disposalEventId?: string;
    journalEntryId?: string;
  }): Promise<{
    disposals: any[];
    totalCostBasis: number;
    totalProceeds: number;
    totalRealizedPnL: number;
  }> {
    // Get available lots in FIFO order (oldest first)
    const availableLots = await this.prisma.lot.findMany({
      where: {
        asset: data.asset,
        disposed: false,
        remainingQty: { gt: 0 },
      },
      orderBy: { acquiredAt: 'asc' },
    });

    if (availableLots.length === 0) {
      throw new Error(`No available lots for ${data.asset}`);
    }

    // Calculate total available quantity
    const totalAvailable = availableLots.reduce((sum, lot) => sum + lot.remainingQty, 0);

    if (totalAvailable < data.quantity) {
      throw new Error(
        `Insufficient lots for ${data.asset}. Required: ${data.quantity}, Available: ${totalAvailable}`
      );
    }

    const disposals: any[] = [];
    let remainingToDispose = data.quantity;
    let totalCostBasis = 0;
    const proceedsPerUnit = data.proceeds / data.quantity;

    // Process lots in FIFO order
    for (const lot of availableLots) {
      if (remainingToDispose <= 0) break;

      const qtyFromThisLot = Math.min(lot.remainingQty, remainingToDispose);
      const costBasisForDisposal = qtyFromThisLot * lot.costPerUnit;
      const proceedsForDisposal = qtyFromThisLot * proceedsPerUnit;
      const realizedPnL = proceedsForDisposal - costBasisForDisposal;

      // Create disposal record
      const disposal = await this.prisma.lotDisposal.create({
        data: {
          lotId: lot.id,
          quantityDisposed: qtyFromThisLot,
          proceedsPerUnit,
          totalProceeds: proceedsForDisposal,
          costBasisPerUnit: lot.costPerUnit,
          totalCostBasis: costBasisForDisposal,
          realizedPnL,
          disposedAt: data.disposedAt,
          disposalEventId: data.disposalEventId,
          journalEntryId: data.journalEntryId,
        },
      });

      disposals.push(disposal);
      totalCostBasis += costBasisForDisposal;
      remainingToDispose -= qtyFromThisLot;

      // Update lot remaining quantity
      const newRemainingQty = lot.remainingQty - qtyFromThisLot;
      await this.prisma.lot.update({
        where: { id: lot.id },
        data: {
          remainingQty: newRemainingQty,
          disposed: newRemainingQty <= 0,
        },
      });
    }

    return {
      disposals,
      totalCostBasis,
      totalProceeds: data.proceeds,
      totalRealizedPnL: data.proceeds - totalCostBasis,
    };
  }

  /**
   * Get lot balances for an asset
   */
  async getLotBalances(asset: string): Promise<{
    totalQuantity: number;
    totalCostBasis: number;
    averageCostBasis: number;
    lots: any[];
  }> {
    const lots = await this.prisma.lot.findMany({
      where: {
        asset,
        disposed: false,
        remainingQty: { gt: 0 },
      },
      orderBy: { acquiredAt: 'asc' },
    });

    const totalQuantity = lots.reduce((sum, lot) => sum + lot.remainingQty, 0);
    const totalCostBasis = lots.reduce(
      (sum, lot) => sum + lot.remainingQty * lot.costPerUnit,
      0
    );

    return {
      totalQuantity,
      totalCostBasis,
      averageCostBasis: totalQuantity > 0 ? totalCostBasis / totalQuantity : 0,
      lots: lots.map(lot => ({
        id: lot.id,
        quantity: lot.remainingQty,
        costBasis: lot.remainingQty * lot.costPerUnit,
        costPerUnit: lot.costPerUnit,
        acquiredAt: lot.acquiredAt,
      })),
    };
  }

  async getRealizedPnL(params: {
    asset?: string;
    startDate: Date;
    endDate: Date;
  }): Promise<{
    totalRealized: number;
    totalCostBasis: number;
    totalProceeds: number;
    disposals: any[];
  }> {
    const where: any = {
      disposedAt: {
        gte: params.startDate,
        lte: params.endDate,
      },
    };

    if (params.asset) {
      where.lot = { asset: params.asset };
    }

    const disposals = await this.prisma.lotDisposal.findMany({
      where,
      include: {
        lot: true,
      },
      orderBy: { disposedAt: 'asc' },
    });

    const totalRealized = disposals.reduce((sum, d) => sum + d.realizedPnL, 0);
    const totalCostBasis = disposals.reduce((sum, d) => sum + d.totalCostBasis, 0);
    const totalProceeds = disposals.reduce((sum, d) => sum + d.totalProceeds, 0);

    return {
      totalRealized,
      totalCostBasis,
      totalProceeds,
      disposals: disposals.map(d => ({
        id: d.id,
        asset: d.lot.asset,
        quantity: d.quantityDisposed,
        costBasis: d.totalCostBasis,
        proceeds: d.totalProceeds,
        realizedPnL: d.realizedPnL,
        disposedAt: d.disposedAt,
      })),
    };
  }
}
