import { ethers } from 'ethers';

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export class BalanceChecker {
  private provider: ethers.JsonRpcProvider;

  constructor(rpcUrl: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  async getNativeBalance(address: string): Promise<{
    balance: number;
    blockNumber: bigint;
    timestamp: Date;
  }> {
    const balanceWei = await this.provider.getBalance(address);
    const blockNumber = BigInt(await this.provider.getBlockNumber());
    const block = await this.provider.getBlock(Number(blockNumber));

    return {
      balance: parseFloat(ethers.formatEther(balanceWei)),
      blockNumber,
      timestamp: new Date((block?.timestamp || 0) * 1000),
    };
  }

  async getERC20Balance(
    walletAddress: string,
    tokenAddress: string
  ): Promise<{
    balance: number;
    symbol: string;
    decimals: number;
    blockNumber: bigint;
    timestamp: Date;
  }> {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);

    const [balanceRaw, decimals, symbol] = await Promise.all([
      contract.balanceOf(walletAddress),
      contract.decimals(),
      contract.symbol(),
    ]);

    const blockNumber = BigInt(await this.provider.getBlockNumber());
    const block = await this.provider.getBlock(Number(blockNumber));

    return {
      balance: parseFloat(ethers.formatUnits(balanceRaw, decimals)),
      symbol,
      decimals,
      blockNumber,
      timestamp: new Date((block?.timestamp || 0) * 1000),
    };
  }

  async getBalances(
    walletAddress: string,
    tokenAddresses: string[] = []
  ): Promise<Array<{
    asset: string;
    balance: number;
    blockNumber: bigint;
    timestamp: Date;
  }>> {
    const balances = [];

    // Native balance (ETH)
    const nativeBalance = await this.getNativeBalance(walletAddress);
    balances.push({
      asset: 'ETH',
      ...nativeBalance,
    });

    // ERC-20 balances
    for (const tokenAddress of tokenAddresses) {
      try {
        const tokenBalance = await this.getERC20Balance(walletAddress, tokenAddress);
        if (tokenBalance.balance > 0) {
          balances.push({
            asset: tokenBalance.symbol,
            balance: tokenBalance.balance,
            blockNumber: tokenBalance.blockNumber,
            timestamp: tokenBalance.timestamp,
          });
        }
      } catch (error) {
        console.error(`Error fetching balance for token ${tokenAddress}:`, error);
      }
    }

    return balances;
  }
}
