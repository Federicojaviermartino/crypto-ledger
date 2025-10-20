import * as crypto from 'crypto';

/**
 * Hash service for generating SHA-256 hashes for entry chain
 * Ensures immutability through cryptographic linking
 */
export class HashService {
  /**
   * Generate SHA-256 hash for a journal entry
   * Includes entry data and previous hash for chain linking
   */
  static generateEntryHash(entryData: {
    date: Date;
    description: string;
    reference?: string;
    postings: Array<{
      accountCode: string;
      debit: number;
      credit: number;
      description?: string;
    }>;
    prevHash?: string;
  }): string {
    const data = {
      date: entryData.date.toISOString(),
      description: entryData.description,
      reference: entryData.reference || '',
      postings: entryData.postings.map(p => ({
        account: p.accountCode,
        debit: p.debit,
        credit: p.credit,
        desc: p.description || '',
      })),
      prevHash: entryData.prevHash || '',
    };

    const jsonString = JSON.stringify(data);
    return crypto.createHash('sha256').update(jsonString).digest('hex');
  }

  /**
   * Verify hash chain integrity between entries
   */
  static verifyChain(currentHash: string, prevHash: string, calculatedHash: string): boolean {
    return currentHash === calculatedHash;
  }

  /**
   * Generate proof of hash chain for audit trail
   */
  static generateProof(entries: Array<{ id: string; hash: string; prevHash?: string }>): string[] {
    const proof: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const prevEntry = i > 0 ? entries[i - 1] : null;

      if (prevEntry) {
        const isValid = entry.prevHash === prevEntry.hash;
        proof.push(
          `Entry ${entry.id}: ${isValid ? '✓' : '✗'} Links to ${prevEntry.id} (${prevEntry.hash.substring(0, 8)}...)`
        );
      } else {
        proof.push(`Entry ${entry.id}: ✓ Genesis entry (${entry.hash.substring(0, 8)}...)`);
      }
    }

    return proof;
  }
}
