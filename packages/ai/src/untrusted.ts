/**
 * Wraps third-party text (reviews, complaints, dispute messages, web pages) so the model treats it as data.
 * Any untrusted_input tag inside the text is defanged, so the text cannot close the wrapper early.
 */
export function wrapUntrusted(text: string): string {
  const defanged = text.replace(/<(\/?)untrusted_input/gi, '&lt;$1untrusted_input');
  return `<untrusted_input>${defanged}</untrusted_input>`;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
/**
 * 7 to 15 digits, optionally led by + or 00 or a bracket and separated by spaces, dots, dashes or brackets, not
 * inside a longer word (so tracking numbers, SKUs and ids such as FF-<uuid> or 1Z999AA10123456784 are kept).
 */
const PHONE = /(?<![\w+(])(?:\+|00)?\(?\d(?:[ .\-()]*\d){6,14}(?!\w)/g;
/** Dates that look like digit runs: 2026-11-09, 09.11.2026, 9-11-26. */
const DATE = /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}[.-]\d{1,2}[.-]\d{2,4})$/;

/**
 * Removes email addresses and phone numbers a buyer typed into free text, before the text reaches a model
 * (section 10: model inputs carry no buyer email). Dates are kept. A street address typed into free text is not
 * detected; stored address fields are never sent to a model.
 */
export function removeContactDetails(text: string): string {
  return text
    .replace(EMAIL, '[email removed]')
    .replace(PHONE, (m) => (DATE.test(m) ? m : '[phone removed]'));
}
