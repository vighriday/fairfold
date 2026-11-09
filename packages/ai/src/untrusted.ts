/**
 * Wraps third-party text (reviews, complaints, dispute messages, web pages) so the model treats it as data.
 * Any untrusted_input tag inside the text is defanged, so the text cannot close the wrapper early.
 */
export function wrapUntrusted(text: string): string {
  const defanged = text.replace(/<(\/?)untrusted_input/gi, '&lt;$1untrusted_input');
  return `<untrusted_input>${defanged}</untrusted_input>`;
}
