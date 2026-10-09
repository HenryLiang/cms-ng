/**
 * One-time seed script: create the CMS-NG subscription catalog in the
 * Paddle *sandbox* account — 3 products (Starter / Pro / Advanced),
 * each with monthly + annual USD prices, a 7-day trial on every price,
 * and regional overrides for the UK (GBP), Ireland (EUR), Australia (AUD).
 *
 * Usage:
 *   PADDLE_API_KEY=pdl_sdbx_... npx tsx scripts/seed-paddle-catalog.ts
 *
 * Amounts are strings in the lowest currency unit ("1000" = USD 10.00).
 */
import { Environment, Paddle } from '@paddle/paddle-node-sdk';

const apiKey = process.env.PADDLE_API_KEY;
if (!apiKey) {
  console.error(
    'PADDLE_API_KEY is not set. Create a sandbox key at ' +
      'https://sandbox-vendors.paddle.com/authentication-v2 ' +
      '(needs product.write + price.write) and rerun with ' +
      'PADDLE_API_KEY=pdl_sdbx_... npx tsx scripts/seed-paddle-catalog.ts',
  );
  process.exit(1);
}

const paddle = new Paddle(apiKey, { environment: Environment.sandbox });

const TRIAL = { interval: 'day', frequency: 7 } as const;

interface RegionalPrice {
  gbp: string; // UK
  eur: string; // Ireland
  aud: string; // Australia
}

interface PlanSpec {
  name: string;
  description: string;
  monthlyUsd: string;
  yearlyUsd: string;
  monthlyRegional: RegionalPrice;
  yearlyRegional: RegionalPrice;
}

const PLANS: PlanSpec[] = [
  {
    name: 'Starter',
    description: 'For individual creators getting started.',
    monthlyUsd: '1000', // USD 10.00
    yearlyUsd: '10000', // USD 100.00
    monthlyRegional: { gbp: '800', eur: '900', aud: '1500' },
    yearlyRegional: { gbp: '8000', eur: '9000', aud: '15000' },
  },
  {
    name: 'Pro',
    description: 'For professional creators and small teams.',
    monthlyUsd: '4000', // USD 40.00
    yearlyUsd: '40000', // USD 400.00
    monthlyRegional: { gbp: '3200', eur: '3600', aud: '6000' },
    yearlyRegional: { gbp: '32000', eur: '36000', aud: '60000' },
  },
  {
    name: 'Advanced',
    description: 'For power users and content teams at scale.',
    monthlyUsd: '12000', // USD 120.00
    yearlyUsd: '120000', // USD 1200.00
    monthlyRegional: { gbp: '9600', eur: '10800', aud: '18000' },
    yearlyRegional: { gbp: '96000', eur: '108000', aud: '180000' },
  },
];

function overrides(regional: RegionalPrice) {
  return [
    {
      countryCodes: ['GB'],
      unitPrice: { amount: regional.gbp, currencyCode: 'GBP' },
    },
    {
      countryCodes: ['IE'],
      unitPrice: { amount: regional.eur, currencyCode: 'EUR' },
    },
    {
      countryCodes: ['AU'],
      unitPrice: { amount: regional.aud, currencyCode: 'AUD' },
    },
  ];
}

async function seed() {
  const created: Array<{
    product: string;
    productId: string;
    monthlyPriceId: string;
    yearlyPriceId: string;
  }> = [];

  for (const plan of PLANS) {
    const product = await paddle.products.create({
      name: plan.name,
      taxCategory: 'saas',
      description: plan.description,
    });

    const monthly = await paddle.prices.create({
      productId: product.id,
      description: `${plan.name} monthly USD`,
      unitPrice: { amount: plan.monthlyUsd, currencyCode: 'USD' },
      billingCycle: { interval: 'month', frequency: 1 },
      trialPeriod: TRIAL,
      unitPriceOverrides: overrides(plan.monthlyRegional),
    });

    const yearly = await paddle.prices.create({
      productId: product.id,
      description: `${plan.name} yearly USD`,
      unitPrice: { amount: plan.yearlyUsd, currencyCode: 'USD' },
      billingCycle: { interval: 'year', frequency: 1 },
      trialPeriod: TRIAL,
      unitPriceOverrides: overrides(plan.yearlyRegional),
    });

    created.push({
      product: plan.name,
      productId: product.id,
      monthlyPriceId: monthly.id,
      yearlyPriceId: yearly.id,
    });
  }

  // Verification read-back: list products with their prices.
  const listed: Array<{
    id: string;
    name: string;
    prices: Array<{ id: string; description: string | null }>;
  }> = [];
  for await (const product of paddle.products.list({ include: ['prices'] })) {
    listed.push({
      id: product.id,
      name: product.name,
      prices: (product.prices ?? []).map((p) => ({
        id: p.id,
        description: p.description,
      })),
    });
  }

  console.log('\n=== Created ID mapping ===');
  console.log(JSON.stringify(created, null, 2));
  console.log('\n=== Sandbox catalog read-back ===');
  console.log(JSON.stringify(listed, null, 2));
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
