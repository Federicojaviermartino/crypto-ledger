export type ChainType = 'ethereum' | 'polygon' | 'arbitrum' | 'optimism';
export type NetworkType = 'mainnet' | 'goerli' | 'sepolia' | 'testnet';
export type EventType = 'NATIVE_TRANSFER' | 'ERC20_TRANSFER' | 'ERC721_TRANSFER' | 'CONTRACT_CALL';

export interface AssetInfo {
  symbol: string;
  address?: string; // Undefined for native assets (ETH, MATIC, etc.)
  decimals: number;
  name?: string;
}

export interface NormalizedBlockchainEvent {
  chain: ChainType;
  network: NetworkType;
  blockNumber: bigint;
  blockTimestamp: Date;
  txHash: string;
  logIndex?: number;
  eventType: EventType;
  from: string;
  to: string;
  asset: AssetInfo;
  quantity: string; // Decimal string for precision
  feeAmount?: string;
  feeAsset?: AssetInfo;
  rawData: any;
}

export interface ERC20TransferEvent {
  address: string; // Token contract address
  from: string;
  to: string;
  value: bigint;
  transactionHash: string;
  logIndex: number;
  blockNumber: number;
  blockTimestamp: number;
}

export interface NativeTransferEvent {
  from: string;
  to: string;
  value: bigint;
  transactionHash: string;
  blockNumber: number;
  blockTimestamp: number;
  gasUsed: bigint;
  gasPrice: bigint;
}

export interface IndexerConfig {
  chain: ChainType;
  network: NetworkType;
  rpcUrl: string;
  startBlock?: bigint;
  batchSize?: number;
  confirmations?: number;
}
