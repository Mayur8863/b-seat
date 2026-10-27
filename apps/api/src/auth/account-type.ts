/** The single list of account types. The DB CHECK `user_account_type_valid` must match (ADR-0010). */
export const ACCOUNT_TYPES = ['owner', 'renter'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
