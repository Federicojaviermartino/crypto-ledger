import { ethers } from 'ethers';
import {
  NormalizedBlockchainEvent,
  IndexerConfig,
  ERC20TransferEvent,
  NativeTransferEvent,
} from '../types/blockchain.types';

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export class EthereumIndexer {
  private provider: ethers.JsonRpcProvider;
  private config: IndexerConfig;

  constructor(config: IndexerConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  async getLatestBlockNumber(): Promise<bigint> {
    return BigInt(await this.provider.getBlockNumber());
  }

  async indexBlockRange(fromBlock: bigint, toBlock: bigint): Promise<NormalizedBlockchainEvent[]> {
    const events: NormalizedBlockchainEvent[] = [];

    // Index ERC-20 transfers
    const erc20Events = await this.indexERC20Transfers(fromBlock, toBlock);
    events.push(...erc20Events);

    // Index native ETH transfers (from transaction receipts)
    const nativeEvents = await this.indexNativeTransfers(fromBlock, toBlock);
    events.push(...nativeEvents);

    return events;
  }

  private async indexERC20Transfers(
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<NormalizedBlockchainEvent[]> {
    const logs = await this.provider.getLogs({
      fromBlock: Number(fromBlock),
      toBlock: Number(toBlock),
      topics: [ERC20_TRANSFER_TOPIC],
    });

    const events: NormalizedBlockchainEvent[] = [];

    for (const log of logs) {
      try {
        const block = await this.provider.getBlock(log.blockNumber);
        if (!block) continue;

        const from = ethers.getAddress('0x' + log.topics[1].slice(26));
        const to = ethers.getAddress('0x' + log.topics[2].slice(26));
        const value = BigInt(log.data);

        // Try to get token metadata
        let symbol = 'UNKNOWN';
        let decimals = 18;
        let name = 'Unknown Token';

        try {
          const tokenContract = new ethers.Contract(
            log.address,
            ['function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function name() view returns (string)'],
            this.provider
          );

          [symbol, decimals, name] = await Promise.all([
            tokenContract.symbol().catch(() => 'UNKNOWN'),
            tokenContract.decimals().catch(() => 18),
            tokenContract.name().catch(() => 'Unknown Token'),
          ]);
        } catch (error) {
          // Token metadata unavailable, use defaults
        }

        events.push({
          chain: this.config.chain,
          network: this.config.network,
          blockNumber: BigInt(log.blockNumber),
          blockTimestamp: new Date(block.timestamp * 1000),
          txHash: log.transactionHash,
          logIndex: log.index,
          eventType: 'ERC20_TRANSFER',
          from,
          to,
          asset: {
            symbol,
            address: log.address,
            decimals,
            name,
          },
          quantity: ethers.formatUnits(value, decimals),
          rawData: {
            address: log.address,
            topics: log.topics,
            data: log.data,
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
            logIndex: log.index,
          },
        });
      } catch (error) {
        console.error(`Error processing ERC20 log ${log.transactionHash}:${log.index}`, error);
      }
    }

    return events;
  }

  private async indexNativeTransfers(
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<NormalizedBlockchainEvent[]> {
    const events: NormalizedBlockchainEvent[] = [];

    for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
      try {
        const block = await this.provider.getBlock(Number(blockNum), true);
        if (!block || !block.transactions) continue;

        for (const tx of block.transactions) {
          if (typeof tx === 'string') continue;

          // Only process transactions with ETH value
          if (tx.value > 0n) {
            const receipt = await this.provider.getTransactionReceipt(tx.hash);
            if (!receipt) continue;

            const gasUsed = receipt.gasUsed;
            const gasPrice = tx.gasPrice || 0n;
            const fee = gasUsed * gasPrice;

            events.push({
              chain: this.config.chain,
              network: this.config.network,
              blockNumber: BigInt(block.number),
              blockTimestamp: new Date(block.timestamp * 1000),
              txHash: tx.hash,
              eventType: 'NATIVE_TRANSFER',
              from: tx.from,
              to: tx.to || ethers.ZeroAddress,
              asset: {
                symbol: 'ETH',
                decimals: 18,
                name: 'Ethereum',
              },
              quantity: ethers.formatEther(tx.value),
              feeAmount: ethers.formatEther(fee),
              feeAsset: {
                symbol: 'ETH',
                decimals: 18,
                name: 'Ethereum',
              },
              rawData: {
                hash: tx.hash,
                from: tx.from,
                to: tx.to,
                value: tx.value.toString(),
                gasUsed: gasUsed.toString(),
                gasPrice: gasPrice.toString(),
                nonce: tx.nonce,
              },
            });
          }
        }
      } catch (error) {
        console.error(`Error processing block ${blockNum}`, error);
      }
    }

    return events;
  }

  async getBlockTimestamp(blockNumber: bigint): Promise<Date> {
    const block = await this.provider.getBlock(Number(blockNumber));
    if (!block) throw new Error(`Block ${blockNumber} not found`);
    return new Date(block.timestamp * 1000);
  }
}
