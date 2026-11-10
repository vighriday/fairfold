import { config } from 'dotenv';
import { createDatabase, merchants, products } from '@fairfold/db';
config({ path: new URL('../.env', import.meta.url), quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required; run pnpm setup:local first');
const seedName = process.env.SEED_NAME ?? 'fairfold';
if (seedName !== 'fairfold') throw new Error('Only the documented fairfold seed is supported');

const seedMerchants = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    slug: 'neel',
    name: 'Neel Apparel (seed)',
    domain: 'neel-seed.example',
    country: 'IN',
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    slug: 'indigo',
    name: 'Indigo Loom (seed)',
    domain: 'indigo-seed.example',
    country: 'IN',
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    slug: 'quicktees',
    name: 'QuickTees (seed)',
    domain: 'quicktees-seed.example',
    country: 'IN',
  },
] as const;

const seedProducts = [
  {
    merchant_id: seedMerchants[0].id,
    sku: 'SEED-NAVY-HOODIE',
    name: 'Navy hoodie',
    description: 'Seed catalogue placeholder; not a PayPal item.',
    unit_value: '40.00',
  },
  {
    merchant_id: seedMerchants[1].id,
    sku: 'SEED-NAVY-HOODIE',
    name: 'Navy hoodie',
    description: 'Seed catalogue placeholder; not a PayPal item.',
    unit_value: '42.00',
  },
  {
    merchant_id: seedMerchants[2].id,
    sku: 'SEED-NAVY-HOODIE',
    name: 'Navy hoodie',
    description: 'Seed catalogue placeholder; not a PayPal item.',
    unit_value: '39.00',
  },
] as const;

const database = createDatabase(databaseUrl);
try {
  await database.db.transaction(async (tx) => {
    for (const merchant of seedMerchants) {
      await tx
        .insert(merchants)
        .values({ ...merchant, is_simulated: true })
        .onConflictDoUpdate({
          target: merchants.id,
          set: {
            slug: merchant.slug,
            name: merchant.name,
            domain: merchant.domain,
            country: merchant.country,
            is_simulated: true,
          },
        });
    }
    for (const product of seedProducts) {
      await tx
        .insert(products)
        .values({ ...product, currency: 'USD', listing_version: 'seed-v1' })
        .onConflictDoUpdate({
          target: [products.merchant_id, products.sku],
          set: {
            name: product.name,
            description: product.description,
            unit_value: product.unit_value,
            currency: 'USD',
            listing_version: 'seed-v1',
          },
        });
    }
  });
  console.log(
    JSON.stringify({
      seed: 'fairfold',
      merchants: seedMerchants.length,
      products: seedProducts.length,
      paypalRequests: 0,
      realSandboxIds: false,
      note: 'B17 orders, complaints, attestations and real PayPal IDs require Ishaan fixtures and sandbox acceptance.',
    }),
  );
} finally {
  await database.close();
}
