
import { PrismaClient, AccountType } from '@prisma/client';

export type TrialBalanceRow = {
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
  balance: number; // debit - credit for Assets/Expenses; credit - debit otherwise
};

export async function trialBalance(prisma: PrismaClient, from?: Date, to?: Date): Promise<TrialBalanceRow[]> {
  const accounts = await prisma.account.findMany({
    include: {
      postings: {
        where: {
          entry: {
            date: {
              gte: from,
              lte: to,
            }
          }
        }
      }
    },
    orderBy: { code: 'asc' }
  });

  const rows: TrialBalanceRow[] = [];
  for (const a of accounts as any[]) {
    const debit = a.postings.reduce((acc: number, p: any) => acc + Number(p.debit || 0), 0);
    const credit = a.postings.reduce((acc: number, p: any) => acc + Number(p.credit || 0), 0);
    let balance = 0;
    if (a.type === 'Asset' || a.type === 'Expense') { 
      balance = debit - credit; 
    } else { 
      balance = credit - debit; 
    }
    rows.push({ code: a.code, name: a.name, type: a.type, debit, credit, balance });
  }

  // NOTE: Keep the implementation minimal; full report logic will be added later.
  return rows;
}
