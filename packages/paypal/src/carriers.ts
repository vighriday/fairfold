import { type PayPalClient } from '@fairfold/contracts';
import { inputText, invalidInput } from './validation.js';

const mapping: Record<string, string> = {
  DHL: 'DHL',
  FEDEX: 'FEDEX',
  UPS: 'UPS',
  INDIA_POST: 'IN_INDIAPOST',
  INDIA_POST_INT: 'IN_INDIAPOST',
  IN_INDIAPOST: 'IN_INDIAPOST',
  IND_DELHIVERY: 'IND_DELHIVERY',
  DELHIVERY: 'IND_DELHIVERY',
  BLUEDART: 'BLUEDART',
  BLUE_DART: 'BLUEDART',
};

export const carriers: PayPalClient['carriers'] = {
  toDisputeCarrier(trackingCarrier) {
    const name = inputText(trackingCarrier, 'carrier name', 2000).trim();
    if (
      [...name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    )
      return invalidInput('carrier name');
    const normalized = name.toUpperCase().replace(/[\s-]+/g, '_');
    if (normalized === 'OTHER') return invalidInput('named OTHER carrier');
    if (Object.hasOwn(mapping, normalized)) return { carrier_name: mapping[normalized]! };
    // For a tracking OTHER entry the caller supplies its stored carrierNameOther here.
    // Preserve the supplied name; never manufacture a missing carrier identity.
    return { carrier_name: 'OTHER', carrier_name_other: name };
  },
};
