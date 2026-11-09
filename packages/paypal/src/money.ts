import { MoneySchema, type Money } from '@fairfold/contracts';
import { invalidInput } from './validation.js';

// PayPal's supported currency list; HUF/JPY/TWD require integral wire amounts.
const currencies = new Set(
  'AUD BRL CAD CNY CZK DKK EUR HKD HUF ILS JPY MYR MXN TWD NZD NOK PHP PLN GBP RUB SGD SEK CHF THB USD'.split(
    ' ',
  ),
);
const integralCurrencies = new Set(['HUF', 'JPY', 'TWD']);
const maximumMinor = 999_999_999_999n; // Existing numeric(12,2)/Money contract.

export function moneyMinor(input: Money): bigint {
  if (!MoneySchema.safeParse(input).success || !currencies.has(input.currency_code))
    return invalidInput('amount');
  const [whole, fraction = ''] = input.value.split('.');
  const minor = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (integralCurrencies.has(input.currency_code) && minor % 100n !== 0n)
    return invalidInput('currency precision');
  return minor;
}

export function formatMoney(currency: string, minor: bigint): Money {
  if (minor < 0n || minor > maximumMinor) return invalidInput('amount range');
  return {
    currency_code: currency,
    value: integralCurrencies.has(currency)
      ? (minor / 100n).toString()
      : `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`,
  };
}
