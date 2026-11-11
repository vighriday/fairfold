import {
  beginShopperRun,
  completeShopperRun,
  confirmShopperStore,
  type CheckoutAdapter,
  type ShopperTool,
  type ShopperRun,
} from '@fairfold/shopper';

export async function runShopperSession(options: {
  tools: ShopperTool;
  checkout: CheckoutAdapter;
  request: { query: string; maxPrice: string };
  confirm: (stage: 'store' | 'paypal', message: string) => Promise<boolean>;
  onApprovalLink: (url: string) => void;
}): Promise<ShopperRun> {
  let run = await beginShopperRun(options.tools, options.checkout, options.request);
  if (run.status === 'awaiting_store_confirmation') {
    if (!(await options.confirm('store', 'This store is not verified. Continue with this store?')))
      return run;
    run = await confirmShopperStore(options.checkout, run, ['store-confirmed']);
  }
  if (run.status === 'awaiting_paypal_approval') {
    options.onApprovalLink(run.approvalUrl);
    if (
      !(await options.confirm(
        'paypal',
        'Complete approval on PayPal, then press Enter to capture.',
      ))
    )
      return run;
    return completeShopperRun(options.checkout, run, ['paypal-approved']);
  }
  return run;
}
