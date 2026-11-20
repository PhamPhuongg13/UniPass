export function normalizeStudentEmail(address: string): string;
export function deriveEmailNullifier(secret: string | Buffer, normalizedEmail: string): string;
export function deriveWalletNullifier(secret: string | Buffer, wallet: string): string;
export function deriveEventNullifier(secret: string | Buffer, emailNullifier: string, event: { chainId: number; manager: string; eventId: string | number | bigint }): string;
export function getNullifierSecret(): Buffer;
export function derivePollNullifier(secret: string | Buffer, baseNullifier: string, poll: { chainId: number; contract: string; pollId: string | number | bigint }): string;
export function deriveProgramNullifier(secret: string | Buffer, baseNullifier: string, program: { chainId: number; contract: string; programId: string | number | bigint }): string;
export function deriveZkEmailNullifier(secret: string | Buffer, senderHash: string): string;
