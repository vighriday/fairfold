export const DevCheckoutHtml = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fairfold sandbox checkout</title></head>
<body>
<h1>Fairfold sandbox checkout</h1>
<p>Developer harness: buy one hoodie using a PayPal personal sandbox account. The server supplies the price.</p>
<form id="setup">
<p><label>Merchant slug <input id="merchant" value="neel-block-prints" required></label></p>
<p><label>SKU <input id="sku" value="HD-IND-01" required></label></p>
<button id="load" type="submit">Load checkout</button>
</form>
<p id="status" role="status">Load the configured sandbox merchant to begin.</p>
<paypal-button id="pay" type="pay" hidden></paypal-button>
<button id="retry" type="button" hidden>Check the approved capture again</button>
<pre id="result" aria-live="polite"></pre>
<script src="/dev/checkout.js" defer></script>
</body></html>`;

// Plain browser JavaScript served directly: no bundler, frontend scaffold or client secret.
export const DevCheckoutScript = String.raw`(() => {
  const byId = (id) => document.getElementById(id);
  const form = byId('setup');
  const pay = byId('pay');
  const retry = byId('retry');
  const load = byId('load');
  const status = byId('status');
  const result = byId('result');
  let sdkPromise;
  let session;
  let selection;
  let currentOrder;
  let approvedId;
  let busy = false;
  let captureFailed = false;

  function report(text) { status.textContent = text; }
  function safeCode(error) {
    return error && typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)
      ? error.code : 'CHECKOUT_FAILED';
  }
  async function request(path, options) {
    const response = await fetch(path, { ...options, credentials: 'same-origin' });
    let body;
    try { body = await response.json(); } catch { throw new Error('Invalid server response'); }
    if (!response.ok) {
      const error = new Error('Checkout request failed');
      error.code = safeCode(body && body.error);
      throw error;
    }
    return body;
  }
  function sdk() {
    if (!sdkPromise) sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://www.sandbox.paypal.com/web-sdk/v6/core';
      script.addEventListener('load', () => {
        if (window.paypal && typeof window.paypal.createInstance === 'function') resolve(window.paypal);
        else reject(new Error('SDK unavailable'));
      });
      script.addEventListener('error', () => { sdkPromise = undefined; reject(new Error('SDK unavailable')); });
      document.head.appendChild(script);
    });
    return sdkPromise;
  }
  async function capture(id) {
    try {
      const summary = await request('/api/checkout/orders/' + encodeURIComponent(id) + '/capture', { method: 'POST' });
      if (!summary || summary.id !== currentOrder.orderId || summary.merchantId !== selection.merchantId ||
          !['captured', 'packing', 'sealed', 'shipped', 'delivered', 'refunded'].includes(summary.status)) throw new Error('Completed capture was not confirmed');
      captureFailed = false;
      retry.hidden = true;
      pay.hidden = true;
      result.textContent = JSON.stringify(summary, null, 2);
      report('Sandbox capture recorded. Current order state: ' + summary.status + '. Load checkout again only to begin another purchase.');
      return summary;
    } catch (error) {
      captureFailed = true;
      retry.hidden = false;
      pay.hidden = true;
      report(safeCode(error) + ': completion was not confirmed. Check this approved capture again before starting another purchase.');
      throw error;
    }
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || captureFailed) return;
    busy = true; load.disabled = true; pay.hidden = true; retry.hidden = true;
    session = undefined; currentOrder = undefined; approvedId = undefined; result.textContent = '';
    try {
      const merchant = byId('merchant').value.trim();
      const sku = byId('sku').value.trim();
      const config = await request('/api/checkout/config?merchant=' + encodeURIComponent(merchant));
      if (!sku || !config || typeof config.clientId !== 'string' || !config.clientId ||
          typeof config.merchantId !== 'string' || !/^[A-Z]{3}$/.test(config.currency)) throw new Error('Invalid checkout configuration');
      selection = { merchantId: config.merchantId, sku };
      const paypal = await sdk();
      const instance = await paypal.createInstance({ clientId: config.clientId, components: ['paypal-payments'] });
      const eligibility = await instance.findEligibleMethods({ currencyCode: config.currency });
      if (!eligibility.isEligible('paypal')) { report('PayPal sandbox checkout is not eligible for this configuration.'); return; }
      session = await instance.createPayPalOneTimePaymentSession({
        onApprove: async (data) => {
          if (!currentOrder || !data || data.orderId !== currentOrder.paypalOrderId) {
            const error = new Error('Approval does not match checkout'); error.code = 'APPROVAL_CONTEXT_MISMATCH'; throw error;
          }
          approvedId = currentOrder.paypalOrderId;
          return capture(approvedId);
        },
        onCancel: () => { approvedId = undefined; report('Sandbox checkout cancelled. No completed capture was confirmed.'); },
        onError: () => { if (!captureFailed) report('PayPal sandbox checkout failed. No completed capture was confirmed.'); },
      });
      pay.hidden = false;
      report('Ready: one ' + sku + '. Review the server-priced total inside PayPal before approving.');
    } catch (error) { report(safeCode(error) + ': sandbox setup is incomplete or checkout could not load.'); }
    finally { busy = false; load.disabled = captureFailed; }
  });
  pay.addEventListener('click', async () => {
    if (busy || !session || captureFailed) return;
    busy = true; load.disabled = true; pay.hidden = true;
    currentOrder = undefined; approvedId = undefined; result.textContent = '';
    const orderPromise = request('/api/checkout/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantId: selection.merchantId, items: [{ sku: selection.sku, quantity: 1 }] }),
    }).then((created) => {
      if (!created || !/^[A-Z0-9]{1,36}$/.test(created.paypalOrderId)) throw new Error('Invalid created order');
      currentOrder = created;
      return { orderId: created.paypalOrderId };
    });
    void orderPromise.catch(() => {});
    try {
      // Start immediately on the click; do not await order creation before opening the SDK session.
      await session.start({ presentationMode: 'auto' }, orderPromise);
    } catch (error) { if (!captureFailed) report(safeCode(error) + ': no completed capture was confirmed.'); }
    finally { busy = false; load.disabled = captureFailed; if (!approvedId && !captureFailed) pay.hidden = false; }
  });
  retry.addEventListener('click', async () => {
    if (busy || !approvedId || !captureFailed) return;
    busy = true; retry.disabled = true;
    try { await capture(approvedId); } catch { /* The capture function has displayed the safe recovery state. */ }
    finally { busy = false; retry.disabled = false; load.disabled = captureFailed; }
  });
})();`;
