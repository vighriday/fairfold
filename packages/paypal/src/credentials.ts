import { eq } from 'drizzle-orm';
import { merchants, type Database } from '@fairfold/db';
import { AppError, UuidSchema } from '@fairfold/contracts';

export interface MerchantCredentials {
  clientId: string | null;
  secretEncrypted: string | null;
  simulated: boolean;
}

export interface PayPalCredentials {
  lookup(merchantId: string): Promise<MerchantCredentials | null>;
}

export function validateMerchantId(merchantId: string): void {
  if (!UuidSchema.safeParse(merchantId).success)
    throw new AppError('INVALID_MERCHANT_ID', 'A valid merchant ID is required');
}

export function databaseCredentials(database: Database): PayPalCredentials {
  return {
    async lookup(merchantId) {
      validateMerchantId(merchantId);
      const [row] = await database
        .select({
          clientId: merchants.paypal_client_id,
          secretEncrypted: merchants.paypal_client_secret_enc,
          simulated: merchants.is_simulated,
        })
        .from(merchants)
        .where(eq(merchants.id, merchantId))
        .limit(1);
      return row ?? null;
    },
  };
}
