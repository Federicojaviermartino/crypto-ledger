import { PrismaClient } from '@prisma/client';

/**
 * Classification engine
 * Applies rule-based classification to blockchain events
 */
export class ClassificationEngine {
  constructor(private prisma: PrismaClient) {}

  /**
   * Classify a blockchain event based on rules
   */
  async classifyEvent(eventId: string): Promise<string | null> {
    const event = await this.prisma.blockchainEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new Error(`Event ${eventId} not found`);
    }

    // Get active rules sorted by priority
    const rules = await this.prisma.classificationRule.findMany({
      where: { isActive: true },
      orderBy: { priority: 'desc' },
    });

    for (const rule of rules) {
      if (this.matchesConditions(event, rule.conditions as any)) {
        const classification = this.applyActions(event, rule.actions as any);
        
        // Update event
        await this.prisma.blockchainEvent.update({
          where: { id: eventId },
          data: {
            classifiedAs: classification,
            processed: true,
          },
        });

        return classification;
      }
    }

    // No rule matched - mark as unclassified
    await this.prisma.blockchainEvent.update({
      where: { id: eventId },
      data: {
        classifiedAs: 'unclassified',
      },
    });

    return null;
  }

  /**
   * Check if event matches rule conditions
   */
  private matchesConditions(event: any, conditions: any): boolean {
    // Direction check
    if (conditions.direction) {
      const watchedAddresses = this.getWatchedAddresses();
      const isInbound = watchedAddresses.has(event.to.toLowerCase());
      const isOutbound = watchedAddresses.has(event.from.toLowerCase());

      if (conditions.direction === 'inbound' && !isInbound) return false;
      if (conditions.direction === 'outbound' && !isOutbound) return false;
    }

    // Counterparty check
    if (conditions.counterparty && Array.isArray(conditions.counterparty)) {
      const counterparty = event.from.toLowerCase() !== this.getWatchedAddresses().values().next().value
        ? event.from.toLowerCase()
        : event.to.toLowerCase();

      const matches = conditions.counterparty.some((addr: string) =>
        addr.toLowerCase() === counterparty
      );

      if (!matches) return false;
    }

    // Asset check
    if (conditions.asset && event.asset !== conditions.asset) {
      return false;
    }

    // Amount range check
    if (conditions.minAmount && event.quantity < conditions.minAmount) {
      return false;
    }

    if (conditions.maxAmount && event.quantity > conditions.maxAmount) {
      return false;
    }

    return true;
  }

  /**
   * Apply rule actions and return classification
   */
  private applyActions(event: any, actions: any[]): string {
    for (const action of actions) {
      if (action.type === 'mark_trade') {
        return action.params.tradeType || 'trade';
      }

      if (action.type === 'mark_deposit') {
        return 'deposit';
      }

      if (action.type === 'mark_withdrawal') {
        return 'withdrawal';
      }

      if (action.type === 'mark_internal') {
        return 'internal_transfer';
      }

      if (action.type === 'custom') {
        return action.params.classification || 'custom';
      }
    }

    return 'unclassified';
  }

  /**
   * Get watched addresses from environment
   */
  private getWatchedAddresses(): Set<string> {
    const addresses = process.env.OUR_WALLET_ADDRESSES || '';
    return new Set(
      addresses
        .split(',')
        .map(addr => addr.trim().toLowerCase())
        .filter(addr => addr.length > 0)
    );
  }

  /**
   * Classify all unprocessed events
   */
  async classifyUnprocessed(): Promise<number> {
    const unprocessed = await this.prisma.blockchainEvent.findMany({
      where: { processed: false },
      take: 100, // Process in batches
    });

    let classified = 0;

    for (const event of unprocessed) {
      try {
        await this.classifyEvent(event.id);
        classified++;
      } catch (error) {
        console.error(`Error classifying event ${event.id}:`, error);
      }
    }

    return classified;
  }
}
