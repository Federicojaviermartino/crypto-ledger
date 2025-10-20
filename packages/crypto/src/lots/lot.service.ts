import { PrismaClient } from '@prisma/client';
import { CreateLotInput, DisposeLotInput, LotDisposalResult, LotBalance } from '@crypto-ledger/shared/types/lot.types';

export class LotService {
  constructor(private prisma: PrismaClient) {}

  async createLot(input: CreateLotInput): Promise<string> {
    const lot = await this.prisma.lot.create({
      data: {
        asset: input.asset.toUpperCase(),
        quantity: input.quantity,
        remainingQty: input.quantity,
        costBasis: input.costBasis,
        acquisitionDate: input.acquisitionDate,
        acquisitionTxHash: input.acquisitionTxHash,
        sourceType: input.sourceType,
        sourceEventId: input.sourceEventId,
        journalEntryId: input.journalEntryId,
        fullyDisposed: false,
        metadata: input.metadata || {},
      },
    });

    return lot.id;
  }

  async disposeLots(input: DisposeLotInput): Promise<LotDisposalResult> {
    const method = input.method || 'fifo';

    // Get available lots
    const availableLots = await this.getAvailableLots(input.asset, method);

    let remainingQty = input.quantity;
    const disposals: LotDisposalResult['disposals'] = [];
    let totalCostBasis = 0;

    for (const lot of availableLots) {
      if (remainingQty <= 0) break;

      const qtyToDispose = Math.min(remainingQty, lot.remainingQty);
      const proportionDisposed = qtyToDispose / lot.quantity;
      const allocatedCostBasis = lot.costBasis * proportionDisposed;

      // Calculate proceeds for this disposal (proportional)
      const allocatedProceeds = (input.proceedsAmount / input.quantity) * qtyToDispose;
      const allocatedFee = ((input.feeAmount || 0) / input.quantity) * qtyToDispose;
      const netProceeds = allocatedProceeds - allocatedFee;
      const realizedPnL = netProceeds - allocatedCostBasis;

      // Create disposal record
      const disposal = await this.prisma.lotDisposal.create({
        data: {
          lotId: lot.id,
          disposalTxHash: input.disposalTxHash,
          disposalEventId: input.disposalEventId,
          disposalDate: input.disposalDate,
          quantityDisposed: qtyToDispose,
          proceedsAmount: allocatedProceeds,
          costBasis: allocatedCostBasis,
          realizedPnL,
          feeAmount: allocatedFee,
          metadata: input.metadata || {},
        },
      });

      // Update lot
      const newRemainingQty = lot.remainingQty - qtyToDispose;
      await this.prisma.lot.update({
        where: { id: lot.id },
        data: {
          remainingQty: newRemainingQty,
          fullyDisposed: newRemainingQty <= 0.00000001, // Floating point tolerance
          disposalDate: newRemainingQty <= 0.00000001 ? input.disposalDate : null,
        },
      });

      disposals.push({
        lotId: lot.id,
        quantityDisposed: qtyToDispose,
        costBasis: allocatedCostBasis,
        realizedPnL,
      });

      totalCostBasis += allocatedCostBasis;
      remainingQty -= qtyToDispose;
    }

    if (remainingQty > 0.00000001) {
      throw new Error(
        `Insufficient lots for disposal: needed ${input.quantity}, only ${input.quantity - remainingQty} available`
      );
    }

    const totalRealizedPnL = input.proceedsAmount - (input.feeAmount || 0) - totalCostBasis;

    // Create P&L journal entry if significant gain/loss
    let journalEntryId: string | undefined;
    if (Math.abs(totalRealizedPnL) > 0.01) {
      journalEntryId = await this.createPnLEntry(
        input.asset,
        totalRealizedPnL,
        input.disposalDate,
        input.disposalTxHash
      );

      // Link journal entry to disposals
      for (const disposal of disposals) {
        await this.prisma.lotDisposal.updateMany({
          where: { lotId: disposal.lotId, disposalDate: input.disposalDate },
          data: { journalEntryId },
        });
      }
    }

    return {
      disposals,
      totalCostBasis,
      totalRealizedPnL,
      journalEntryId,
    };
  }

  private async getAvailableLots(asset: string, method: 'fifo' | 'lifo' | 'specific') {
    const orderBy = method === 'lifo' 
      ? { acquisitionDate: 'desc' as const }
      : { acquisitionDate: 'asc' as const };

    return this.prisma.lot.findMany({
      where: {
        asset: asset.toUpperCase(),
        fullyDisposed: false,
        remainingQty: { gt: 0 },
      },
      orderBy,
    });
  }

  private async createPnLEntry(
    asset: string,
    realizedPnL: number,
    date: Date,
    txHash?: string
  ): Promise<string> {
    const isGain = realizedPnL > 0;
    const description = `Realized ${isGain ? 'gain' : 'loss'} on ${asset} disposal`;

    // Fetch accounts for P&L
    const proceedsAccount = await this.prisma.account.findUnique({
      where: { code: '1100' }, // Cash/crypto wallet
    });

    const costBasisAccount = await this.prisma.account.findUnique({
      where: { code: '1110' }, // Crypto holdings at cost
    });

    const pnlAccount = await this.prisma.account.findUnique({
      where: { code: isGain ? '4100' : '6200' }, // Gain/Loss account
    });

    if (!proceedsAccount || !costBasisAccount || !pnlAccount) {
      throw new Error('Required accounts not found for P&L entry');
    }

    const entry = await this.prisma.journalEntry.create({
      data: {
        date,
        description,
        reference: txHash,
        metadata: {
          asset,
          realizedPnL,
          type: 'crypto_pnl',
        },
        postings: {
          create: isGain
            ? [
                // Gain: Debit Cash (increase), Credit Gain (income)
                { accountId: proceedsAccount.id, debit: Math.abs(realizedPnL), credit: 0 },
                { accountId: pnlAccount.id, debit: 0, credit: Math.abs(realizedPnL) },
              ]
            : [
                // Loss: Debit Loss (expense), Credit Cash (decrease)
                { accountId: pnlAccount.id, debit: Math.abs(realizedPnL), credit: 0 },
                { accountId: proceedsAccount.id, debit: 0, credit: Math.abs(realizedPnL) },
              ],
        },
      },
    });

    return entry.id;
  }

  async getLotBalance(asset: string): Promise<LotBalance> {
    const lots = await this.prisma.lot.findMany({
      where: {
        asset: asset.toUpperCase(),
        fullyDisposed: false,
        remainingQty: { gt: 0 },
      },
    });

    const totalQuantity = lots.reduce((sum, lot) => sum + lot.remainingQty, 0);
    const totalCostBasis = lots.reduce((sum, lot) => {
      const proportion = lot.remainingQty / lot.quantity;
      return sum + (lot.costBasis * proportion);
    }, 0);

    return {
      asset: asset.toUpperCase(),
      totalQuantity,
      totalCostBasis,
      averageCostBasis: totalQuantity > 0 ? totalCostBasis / totalQuantity : 0,
      lotCount: lots.length,
    };
  }

  async getAllBalances(): Promise<LotBalance[]> {
    const lots = await this.prisma.lot.findMany({
      where: {
        fullyDisposed: false,
        remainingQty: { gt: 0 },
      },
      distinct: ['asset'],
      select: { asset: true },
    });

    const balances = await Promise.all(
      lots.map(lot => this.getLotBalance(lot.asset))
    );

    return balances;
  }

  async getRealizedPnL(params: {
    asset?: string;
    from: Date;
    to: Date;
  }) {
    const where: any = {
      disposalDate: {
        gte: params.from,
        lte: params.to,
      },
    };

    const disposals = await this.prisma.lotDisposal.findMany({
      where,
      include: {
        lot: true,
      },
      orderBy: { disposalDate: 'asc' },
    });

    // Filter by asset if specified
    const filteredDisposals = params.asset
      ? disposals.filter(d => d.lot.asset === params.asset.toUpperCase())
      : disposals;

    const totalProceeds = filteredDisposals.reduce((sum, d) => sum + d.proceedsAmount, 0);
    const totalCostBasis = filteredDisposals.reduce((sum, d) => sum + d.costBasis, 0);
    const totalRealizedPnL = filteredDisposals.reduce((sum, d) => sum + d.realizedPnL, 0);

    // Calculate short-term vs long-term (1 year holding period)
    const oneYearAgo = new Date(params.to);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const shortTermGains = filteredDisposals
      .filter(d => d.lot.acquisitionDate > oneYearAgo && d.realizedPnL > 0)
      .reduce((sum, d) => sum + d.realizedPnL, 0);

    const longTermGains = filteredDisposals
      .filter(d => d.lot.acquisitionDate <= oneYearAgo && d.realizedPnL > 0)
      .reduce((sum, d) => sum + d.realizedPnL, 0);

    return {
      asset: params.asset,
      period: {
        from: params.from,
        to: params.to,
      },
      disposals: filteredDisposals.map(d => ({
        date: d.disposalDate,
        asset: d.lot.asset,
        quantity: d.quantityDisposed,
        proceeds: d.proceedsAmount,
        costBasis: d.costBasis,
        realizedPnL: d.realizedPnL,
        txHash: d.disposalTxHash,
      })),
      summary: {
        totalDisposals: filteredDisposals.length,
        totalProceeds,
        totalCostBasis,
        totalRealizedPnL,
        shortTermGains,
        longTermGains,
      },
    };
  }
}
