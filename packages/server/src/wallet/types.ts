/** What a wallet pass needs to know about a member. Shared by both platforms. */
export interface WalletMember {
  memberCode: string;
  fullName: string | null;
  balance: number;
}
