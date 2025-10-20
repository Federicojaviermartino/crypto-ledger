
export class CreatePostingDto {
  accountId!: string;
  debit?: number;   // >= 0
  credit?: number;  // >= 0
  assetId?: string;
  quantity?: number;
  price?: number;
  fxRate?: number;
  lotId?: string;
}

export class CreateEntryDto {
  date!: string;  // ISO date
  memo?: string;
  postings!: CreatePostingDto[];
}
