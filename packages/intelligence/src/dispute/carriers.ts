// Tracking-carrier enum → disputes evidence carrier enum (section 3: the two enums differ, e.g. INDIA_POST
// versus IN_INDIAPOST). Covers the carriers the seed uses; anything else is filed as OTHER with its name.
export interface DisputeCarrier {
  carrier_name: string;
  carrier_name_other?: string;
}

const SAME = new Set(['DHL', 'FEDEX', 'UPS', 'USPS']);
const MAPPED: Record<string, string> = { INDIA_POST: 'IN_INDIAPOST' };

export function toDisputeCarrier(
  trackingCarrier: string,
  carrierNameOther?: string | null,
): DisputeCarrier {
  const c = trackingCarrier.trim().toUpperCase();
  if (SAME.has(c)) return { carrier_name: c };
  const mapped = MAPPED[c];
  if (mapped) return { carrier_name: mapped };
  return { carrier_name: 'OTHER', carrier_name_other: carrierNameOther?.trim() || trackingCarrier };
}
