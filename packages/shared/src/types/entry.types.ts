/**
 * Types for journal entries and postings
 */

export interface CreatePostingDto {
  accountCode: string;
  debit?: number;
  credit?: number;
  description?: string;
  dimensions?: Record<string, string>;
}

export interface CreateEntryDto {
  date: string;
  description: string;
  reference?: string;
  postings: CreatePostingDto[];
  metadata?: Record<string, any>;
}

export interface EntryResponse {
  id: string;
  date: Date;
  description: string;
  reference?: string;
  hash: string;
  prevHash?: string;
  postings: PostingResponse[];
  createdAt: Date;
}

export interface PostingResponse {
  id: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description?: string;
  dimensions?: Array<{
    dimension: string;
    value: string;
  }>;
}

export interface HashProof {
  entryId: string;
  hash: string;
  prevHash?: string;
  prevEntryId?: string;
  nextEntryId?: string;
  chainIntact: boolean;
  proof: string[];
}