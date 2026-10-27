export const MAX_OPENING_BALANCE = 999999999.99;

export function parseOpeningBalanceCents(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;

  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents > MAX_OPENING_BALANCE * 100) return null;
  return cents;
}
