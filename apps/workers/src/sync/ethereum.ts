
import { JsonRpcProvider, Log } from 'ethers';

export async function syncWallet(provider: JsonRpcProvider, walletAddress: string, fromBlock: number) {
  // Minimal skeleton: fetch logs; in real code, add topics for ERC20 Transfer and ETH transfers (receipts)
  const filter = { fromBlock, toBlock: 'latest' as const };
  const logs: Log[] = await provider.getLogs(filter);
  console.log(`Fetched ${logs.length} logs for ${walletAddress}`);
  // TODO: normalize transfers -> enqueue classification -> create journal entries
}
