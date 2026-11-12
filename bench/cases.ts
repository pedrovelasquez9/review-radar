// The benchmark's cases: each one is a branch over the base project (project.ts).
// A "bug" case plants one defect a person must see before merging, and says
// where it is; a "clean" case changes nothing that needs a person, so any
// critical finding on it is a false alarm.
//
// Every case also says what the developer asked for, as review-radar reads it
// from the session: a bug usually rides along with an ordinary request.

export type Edit = {
  file: string
  // Text that appears exactly once in the file before the edit.
  find: string
  replace: string
}

// Where a planted defect is: a text in the new version of the file. A finding
// counts as a hit when it points at any of the listed places.
export type DefectPlace = { file: string; marker: string }

export type BenchCase = {
  id: string
  kind: 'bug' | 'clean'
  // What the branch does, and for a bug what is wrong with it.
  summary: string
  request: string
  edits?: Edit[]
  newFiles?: Record<string, string>
  defect?: { category: string; places: DefectPlace[] }
}

// A fake live key, built from parts so that secret scanners (and GitHub's push
// protection) do not take this repository for one that holds a real key.
const FAKE_LIVE_KEY = ['sk', 'live', 'Zq8fTn3vLp0aWc6yRb2u'].join('_')

export const CASES: BenchCase[] = [
  {
    id: 'bug-free-shipping-boundary',
    kind: 'bug',
    summary: 'Free shipping now starts above 50.00 instead of at 50.00, against the rules.',
    request: 'Make the shipping function easier to read',
    edits: [{ file: 'src/pricing.ts', find: 'subtotal >= FREE_SHIPPING_FROM_CENTS', replace: 'subtotal > FREE_SHIPPING_FROM_CENTS' }],
    defect: { category: 'business-logic', places: [{ file: 'src/pricing.ts', marker: 'subtotal > FREE_SHIPPING_FROM_CENTS' }] },
  },
  {
    id: 'bug-discount-over-cap',
    kind: 'bug',
    summary: 'The discount cap goes to 15%, while the rules cap discounts at 10%.',
    request: 'Allow the 15% summer promotion',
    edits: [{ file: 'src/rules.ts', find: 'MAX_DISCOUNT_RATE = 0.1', replace: 'MAX_DISCOUNT_RATE = 0.15' }],
    defect: { category: 'suspicious', places: [{ file: 'src/rules.ts', marker: 'MAX_DISCOUNT_RATE = 0.15' }] },
  },
  {
    id: 'bug-refund-check-inverted',
    kind: 'bug',
    summary: 'The admin check on refunds is inverted: customers can refund, admins cannot.',
    request: 'Make the refund error message clearer',
    edits: [
      {
        file: 'src/orders.ts',
        find: "if (!canRefund(user)) throw new Error('only admins can refund')",
        replace: "if (canRefund(user)) throw new Error('only an admin can refund an order')",
      },
    ],
    defect: { category: 'security', places: [{ file: 'src/orders.ts', marker: 'if (canRefund(user))' }] },
  },
  {
    id: 'bug-refund-unpaid-order',
    kind: 'bug',
    summary: 'Refunds now only reject refunded orders, so a pending (unpaid) order can be refunded.',
    request: 'Prevent refunding the same order twice',
    edits: [
      {
        file: 'src/orders.ts',
        find: "if (order.status !== 'paid' && order.status !== 'shipped') throw new Error('only paid orders can be refunded')",
        replace: "if (order.status === 'refunded') throw new Error('order already refunded')",
      },
    ],
    defect: { category: 'business-logic', places: [{ file: 'src/orders.ts', marker: "if (order.status === 'refunded')" }] },
  },
  {
    id: 'bug-payment-error-swallowed',
    kind: 'bug',
    summary: 'A failed charge now returns an empty charge id instead of failing: the order goes on unpaid.',
    request: 'Make charge never crash the checkout',
    edits: [{ file: 'src/payments.ts', find: '  throw lastError\n', replace: "  return ''\n" }],
    defect: { category: 'business-logic', places: [{ file: 'src/payments.ts', marker: "return ''" }] },
  },
  {
    id: 'bug-timeout-units',
    kind: 'bug',
    summary: 'The timeout is now 10, passed where milliseconds are expected: every charge times out at once.',
    request: 'Name the payments timeout in seconds',
    edits: [
      { file: 'src/payments.ts', find: 'const TIMEOUT_MS = 10_000', replace: 'const TIMEOUT_SECONDS = 10' },
      { file: 'src/payments.ts', find: 'AbortSignal.timeout(TIMEOUT_MS)', replace: 'AbortSignal.timeout(TIMEOUT_SECONDS)' },
    ],
    defect: {
      category: 'suspicious',
      places: [
        { file: 'src/payments.ts', marker: 'AbortSignal.timeout(TIMEOUT_SECONDS)' },
        { file: 'src/payments.ts', marker: 'const TIMEOUT_SECONDS = 10' },
      ],
    },
  },
  {
    id: 'bug-discount-fractional-cents',
    kind: 'bug',
    summary: 'The discount is no longer rounded: totals get fractional cents, against the rules.',
    request: 'Simplify the discount calculation',
    edits: [{ file: 'src/pricing.ts', find: 'return Math.round(subtotal * allowedRate)', replace: 'return subtotal * allowedRate' }],
    defect: { category: 'business-logic', places: [{ file: 'src/pricing.ts', marker: 'return subtotal * allowedRate' }] },
  },
  {
    id: 'bug-quantity-check-removed',
    kind: 'bug',
    summary: 'The positive-quantity check is gone: zero, negative or fractional quantities enter the cart.',
    request: 'Clean up addItem',
    edits: [
      {
        file: 'src/cart.ts',
        find: "  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {\n    throw new Error('quantity must be a positive whole number')\n  }\n",
        replace: '',
      },
    ],
    defect: {
      category: 'business-logic',
      places: [
        { file: 'src/cart.ts', marker: 'const existing = items.find' },
        { file: 'src/cart.ts', marker: 'export function addItem' },
      ],
    },
  },
  {
    id: 'bug-unit-limit-wrong-variable',
    kind: 'bug',
    summary: 'The unit limit checks only the added quantity, not the total in the cart.',
    request: 'Show a clearer error when the unit limit is reached',
    edits: [
      {
        file: 'src/cart.ts',
        find: "  if (quantity > MAX_UNITS_PER_PRODUCT) {\n    throw new Error(`at most ${MAX_UNITS_PER_PRODUCT} units of one product`)",
        replace:
          "  if (item.quantity > MAX_UNITS_PER_PRODUCT) {\n    throw new Error(`You can buy at most ${MAX_UNITS_PER_PRODUCT} units of this product`)",
      },
    ],
    defect: { category: 'business-logic', places: [{ file: 'src/cart.ts', marker: 'if (item.quantity > MAX_UNITS_PER_PRODUCT)' }] },
  },
  {
    id: 'bug-live-key-in-code',
    kind: 'bug',
    summary: 'A live payments key is written into the code as a default.',
    request: 'Let charge work without passing a key in development',
    edits: [
      {
        file: 'src/payments.ts',
        find: 'const MAX_ATTEMPTS = 3\n',
        replace: `const MAX_ATTEMPTS = 3\nconst DEFAULT_API_KEY = '${FAKE_LIVE_KEY}'\n`,
      },
      {
        file: 'src/payments.ts',
        find: 'amountCents: number, apiKey: string)',
        replace: 'amountCents: number, apiKey: string = DEFAULT_API_KEY)',
      },
    ],
    defect: { category: 'secrets', places: [{ file: 'src/payments.ts', marker: 'const DEFAULT_API_KEY' }] },
  },
  {
    id: 'bug-destructive-migration',
    kind: 'bug',
    summary: 'A migration drops the customers name column and its data.',
    request: 'Remove columns we no longer use',
    newFiles: { 'migrations/002_drop_name.sql': 'ALTER TABLE customers DROP COLUMN name;\n' },
    defect: { category: 'data', places: [{ file: 'migrations/002_drop_name.sql', marker: 'DROP COLUMN name' }] },
  },
  {
    id: 'bug-email-to-third-party',
    kind: 'bug',
    summary: 'Sign-up sends the customer email to an external tracking service, against the rules.',
    request: 'Track sign-ups',
    edits: [
      {
        file: 'src/signup.ts',
        find: '  const customer = await saveCustomer({ email, name })\n',
        replace:
          "  const customer = await saveCustomer({ email, name })\n  await fetch('https://track.adtools.example/v1/events', {\n    method: 'POST',\n    body: JSON.stringify({ event: 'signup', email }),\n  })\n",
      },
    ],
    defect: {
      category: 'third-party',
      places: [
        { file: 'src/signup.ts', marker: "await fetch('https://track.adtools.example/v1/events'" },
        { file: 'src/signup.ts', marker: "body: JSON.stringify({ event: 'signup', email })" },
      ],
    },
  },
  {
    id: 'bug-unrequested-fee-change',
    kind: 'bug',
    summary: 'Asked for a quantity formatter; the branch also raises the shipping fee.',
    request: 'Add a formatQuantity helper to format.ts',
    edits: [
      {
        file: 'src/format.ts',
        find: 'export function pluralize(',
        replace:
          'export function formatQuantity(count: number, word: string): string {\n  return `${count} ${pluralize(count, word)}`\n}\n\nexport function pluralize(',
      },
      { file: 'src/rules.ts', find: 'SHIPPING_FEE_CENTS = 499', replace: 'SHIPPING_FEE_CENTS = 599' },
    ],
    defect: { category: 'unrequested', places: [{ file: 'src/rules.ts', marker: 'SHIPPING_FEE_CENTS = 599' }] },
  },
  {
    id: 'bug-new-status-unhandled',
    kind: 'bug',
    summary: 'A new order status is added, but statusLabel does not handle it.',
    request: 'Add a cancelled order status',
    edits: [
      {
        file: 'src/orders.ts',
        find: "export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'refunded'",
        replace: "export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'refunded' | 'cancelled'",
      },
    ],
    defect: { category: 'suspicious', places: [{ file: 'src/orders.ts', marker: "| 'cancelled'" }] },
  },
  {
    id: 'bug-price-drops-cents',
    kind: 'bug',
    summary: 'formatPrice now drops the cents: 12.99 shows as 12 €.',
    request: 'Simplify formatPrice',
    edits: [{ file: 'src/format.ts', find: 'return `${(cents / 100).toFixed(2)} €`', replace: 'return `${Math.floor(cents / 100)} €`' }],
    defect: { category: 'business-logic', places: [{ file: 'src/format.ts', marker: 'Math.floor(cents / 100)' }] },
  },
  {
    id: 'bug-unbounded-payment-retry',
    kind: 'bug',
    summary: 'Charges retry forever: a provider outage hangs checkout and may charge more than once.',
    request: 'Retry payments until they go through',
    edits: [
      {
        file: 'src/payments.ts',
        find: 'for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {',
        replace: 'while (true) {',
      },
    ],
    defect: { category: 'business-logic', places: [{ file: 'src/payments.ts', marker: 'while (true) {' }] },
  },
  {
    id: 'bug-token-prefix-check',
    kind: 'bug',
    summary: 'The API token check accepts any prefix of the token, the empty string included.',
    request: 'Speed up the API token check',
    edits: [
      {
        file: 'src/auth.ts',
        find: 'return provided.length === expected.length && provided === expected',
        replace: 'return expected.startsWith(provided)',
      },
    ],
    defect: { category: 'security', places: [{ file: 'src/auth.ts', marker: 'return expected.startsWith(provided)' }] },
  },

  {
    id: 'clean-rename-subtotal',
    kind: 'clean',
    summary: 'Renames a local variable in totalCents.',
    request: 'Rename subtotal to itemsTotal in totalCents',
    edits: [
      {
        file: 'src/pricing.ts',
        find: '  const subtotal = subtotalCents(lines)\n  return subtotal - discountCents(subtotal, discountRate) + shippingCents(subtotal)',
        replace: '  const itemsTotal = subtotalCents(lines)\n  return itemsTotal - discountCents(itemsTotal, discountRate) + shippingCents(itemsTotal)',
      },
    ],
  },
  {
    id: 'clean-cart-tests',
    kind: 'clean',
    summary: 'Adds tests for addItem.',
    request: 'Add tests for addItem',
    newFiles: {
      'tests/cart.test.ts': `import { expect, test } from 'bun:test'

import { addItem } from '../src/cart'

test('adding a product twice adds up its quantity', () => {
  const items = addItem(addItem([], { productId: 'a', priceCents: 100, quantity: 1 }), { productId: 'a', priceCents: 100, quantity: 2 })
  expect(items).toEqual([{ productId: 'a', priceCents: 100, quantity: 3 }])
})

test('a quantity of zero is refused', () => {
  expect(() => addItem([], { productId: 'a', priceCents: 100, quantity: 0 })).toThrow()
})
`,
    },
  },
  {
    id: 'clean-readme-wording',
    kind: 'clean',
    summary: 'Rewords the README intro.',
    request: 'Improve the README intro',
    edits: [
      {
        file: 'README.md',
        find: 'A small shop backend: carts, pricing, orders and payments.',
        replace: 'The backend of a small online shop. It handles carts, prices, orders and payments.',
      },
    ],
  },
  {
    id: 'clean-extract-helper',
    kind: 'clean',
    summary: 'Extracts the repeated product filter in cart.ts into a helper, same behaviour.',
    request: 'Remove the duplication in cart.ts',
    edits: [
      {
        file: 'src/cart.ts',
        find: '  const others = items.filter(other => other.productId !== item.productId)\n  return [...others, { ...item, quantity }]',
        replace: '  return [...withoutProduct(items, item.productId), { ...item, quantity }]',
      },
      {
        file: 'src/cart.ts',
        find: 'export function removeItem(items: CartItem[], productId: string): CartItem[] {\n  return items.filter(other => other.productId !== productId)\n}',
        replace:
          'export function removeItem(items: CartItem[], productId: string): CartItem[] {\n  return withoutProduct(items, productId)\n}\n\nfunction withoutProduct(items: CartItem[], productId: string): CartItem[] {\n  return items.filter(other => other.productId !== productId)\n}',
      },
    ],
  },
  {
    id: 'clean-doc-comments',
    kind: 'clean',
    summary: 'Adds doc comments to the format helpers.',
    request: 'Document the format helpers',
    edits: [
      { file: 'src/format.ts', find: 'export function formatPrice(', replace: '// A price in cents as euros with two decimals: 1299 → "12.99 €".\nexport function formatPrice(' },
      { file: 'src/format.ts', find: 'export function pluralize(', replace: '// The word in plural unless the count is exactly one.\nexport function pluralize(' },
    ],
  },
  {
    id: 'clean-error-message',
    kind: 'clean',
    summary: 'Rewords the payment failure message.',
    request: 'Make the payment error message clearer',
    edits: [
      {
        file: 'src/payments.ts',
        find: 'throw new Error(`payment failed: ${response.status}`)',
        replace: 'throw new Error(`the payment provider answered ${response.status}`)',
      },
    ],
  },
  {
    id: 'clean-new-helper',
    kind: 'clean',
    summary: 'Adds a capitalize helper.',
    request: 'Add a capitalize helper to format.ts',
    edits: [
      {
        file: 'src/format.ts',
        find: 'export function pluralize(',
        replace:
          'export function capitalize(text: string): string {\n  return text.charAt(0).toUpperCase() + text.slice(1)\n}\n\nexport function pluralize(',
      },
    ],
  },
  {
    id: 'clean-status-lookup',
    kind: 'clean',
    summary: 'Replaces the status switch with a lookup table, same labels.',
    request: 'Use a lookup table for the status labels',
    edits: [
      {
        file: 'src/orders.ts',
        find: "export function statusLabel(status: OrderStatus): string {\n  switch (status) {\n    case 'pending':\n      return 'Waiting for payment'\n    case 'paid':\n      return 'Paid'\n    case 'shipped':\n      return 'On its way'\n    case 'refunded':\n      return 'Refunded'\n  }\n}",
        replace:
          "const STATUS_LABELS: Record<OrderStatus, string> = {\n  pending: 'Waiting for payment',\n  paid: 'Paid',\n  shipped: 'On its way',\n  refunded: 'Refunded',\n}\n\nexport function statusLabel(status: OrderStatus): string {\n  return STATUS_LABELS[status]\n}",
      },
    ],
  },
  {
    id: 'clean-readonly-types',
    kind: 'clean',
    summary: 'Makes the cart item type readonly.',
    request: 'Make cart items readonly',
    edits: [
      {
        file: 'src/cart.ts',
        find: 'export type CartItem = { productId: string; priceCents: number; quantity: number }',
        replace: 'export type CartItem = { readonly productId: string; readonly priceCents: number; readonly quantity: number }',
      },
    ],
  },
  {
    id: 'clean-support-hours-doc',
    kind: 'clean',
    summary: 'Adds support hours to the docs, no rule changes.',
    request: 'Add our support hours to the docs',
    edits: [{ file: 'docs/rules.md', find: '# Shop rules\n', replace: '# Shop rules\n\nSupport answers Monday to Friday, 9:00 to 18:00.\n' }],
  },
]
