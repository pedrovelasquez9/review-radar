// Harder cases: the defect only shows next to code the diff does not include
// (a callee's units or argument order, a config key read elsewhere), hides in a
// larger refactor, or reads as plausible code. And clean changes that are large
// or touch several files without changing behaviour.

import type { BenchCase } from './cases'

export const HARD_CASES: BenchCase[] = [
  {
    id: 'hard-bug-price-divided-twice',
    kind: 'bug',
    summary: 'The invoice divides cents by 100 before formatPrice, which divides again: totals show 100 times too small.',
    request: 'Add a one-line invoice total',
    newFiles: {
      'src/invoice.ts': `import { formatPrice } from './format'
import { totalCents } from './pricing'
import type { Line } from './pricing'

export function invoiceTotalLine(lines: Line[], discountRate: number): string {
  const total = totalCents(lines, discountRate) / 100
  return \`Total: \${formatPrice(total)}\`
}
`,
    },
    defect: {
      category: 'suspicious',
      places: [
        { file: 'src/invoice.ts', marker: 'totalCents(lines, discountRate) / 100' },
        { file: 'src/invoice.ts', marker: 'formatPrice(total)' },
      ],
    },
  },
  {
    id: 'hard-bug-arguments-swapped',
    kind: 'bug',
    summary: 'discountCents is called with rate and subtotal swapped: both are numbers, so it compiles, and the discount is wrong.',
    request: 'Add a checkout summary with the promo discount',
    newFiles: {
      'src/checkout.ts': `import { discountCents, shippingCents, subtotalCents } from './pricing'
import type { Line } from './pricing'

export type CheckoutSummary = { subtotalCents: number; discountCents: number; shippingCents: number }

export function checkoutSummary(lines: Line[], promoRate: number): CheckoutSummary {
  const subtotal = subtotalCents(lines)
  return {
    subtotalCents: subtotal,
    discountCents: discountCents(promoRate, subtotal),
    shippingCents: shippingCents(subtotal),
  }
}
`,
    },
    defect: { category: 'suspicious', places: [{ file: 'src/checkout.ts', marker: 'discountCents(promoRate, subtotal)' }] },
  },
  {
    id: 'hard-bug-config-key-renamed',
    kind: 'bug',
    summary: 'The session config key is renamed in config/app.json only; src/session.ts still reads the old one, so the lifetime becomes NaN.',
    request: 'Rename the session config key so its unit is clear',
    edits: [{ file: 'config/app.json', find: '"sessionMinutes": 30', replace: '"sessionTtlMinutes": 30' }],
    defect: {
      category: 'suspicious',
      places: [
        { file: 'config/app.json', marker: '"sessionTtlMinutes": 30' },
        { file: 'src/session.ts', marker: 'config.sessionMinutes' },
      ],
    },
  },
  {
    id: 'hard-bug-boundary-in-refactor',
    kind: 'bug',
    summary: 'A naming and comment refactor of cart.ts also turns the unit limit check into >=, so a cart can no longer hold the 50 units the rules allow.',
    request: 'Tidy up the naming and comments in cart.ts',
    edits: [
      {
        file: 'src/cart.ts',
        find: `export function addItem(items: CartItem[], item: CartItem): CartItem[] {
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    throw new Error('quantity must be a positive whole number')
  }
  const existing = items.find(other => other.productId === item.productId)
  const quantity = (existing?.quantity ?? 0) + item.quantity
  if (quantity > MAX_UNITS_PER_PRODUCT) {
    throw new Error(\`at most \${MAX_UNITS_PER_PRODUCT} units of one product\`)
  }
  const others = items.filter(other => other.productId !== item.productId)
  return [...others, { ...item, quantity }]
}

export function removeItem(items: CartItem[], productId: string): CartItem[] {
  return items.filter(other => other.productId !== productId)
}`,
        replace: `// Adds a product to the cart, or more units of one already in it. The cart
// passed in is never changed: a new one is returned.
export function addItem(cartItems: CartItem[], newItem: CartItem): CartItem[] {
  // Quantities are whole units: no zero, no negatives, no fractions.
  if (!Number.isInteger(newItem.quantity) || newItem.quantity <= 0) {
    throw new Error('quantity must be a positive whole number')
  }

  const alreadyInCart = cartItems.find(candidate => candidate.productId === newItem.productId)
  const totalQuantity = (alreadyInCart?.quantity ?? 0) + newItem.quantity

  // The rules cap the units of one product in a cart.
  if (totalQuantity >= MAX_UNITS_PER_PRODUCT) {
    throw new Error(\`at most \${MAX_UNITS_PER_PRODUCT} units of one product\`)
  }

  const otherItems = cartItems.filter(candidate => candidate.productId !== newItem.productId)
  return [...otherItems, { ...newItem, quantity: totalQuantity }]
}

// The cart without the given product, whatever its quantity.
export function removeItem(cartItems: CartItem[], productId: string): CartItem[] {
  return cartItems.filter(candidate => candidate.productId !== productId)
}`,
      },
    ],
    defect: { category: 'business-logic', places: [{ file: 'src/cart.ts', marker: 'totalQuantity >= MAX_UNITS_PER_PRODUCT' }] },
  },
  {
    id: 'hard-bug-idempotency-key-dropped',
    kind: 'bug',
    summary: 'Moving the headers into a helper drops the idempotency key, so a retried charge can be charged twice.',
    request: 'Move the payment request headers into a helper',
    edits: [
      {
        file: 'src/payments.ts',
        find: `        // The order id makes a retried charge count once at the provider.
        headers: { authorization: \`Bearer \${apiKey}\`, 'content-type': 'application/json', 'idempotency-key': orderId },`,
        replace: '        headers: requestHeaders(apiKey),',
      },
      {
        file: 'src/payments.ts',
        find: '  throw lastError\n}\n',
        replace: `  throw lastError
}

function requestHeaders(apiKey: string): Record<string, string> {
  return { authorization: \`Bearer \${apiKey}\`, 'content-type': 'application/json' }
}
`,
      },
    ],
    defect: {
      category: 'business-logic',
      places: [
        { file: 'src/payments.ts', marker: 'headers: requestHeaders(apiKey),' },
        { file: 'src/payments.ts', marker: "return { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }" },
      ],
    },
  },
  {
    id: 'hard-bug-seconds-for-milliseconds',
    kind: 'bug',
    summary: 'The middleware passes the time in seconds where isSessionValid expects milliseconds: every session looks valid forever.',
    request: 'Add a middleware that rejects expired sessions',
    newFiles: {
      'src/middleware.ts': `import { isSessionValid } from './auth'
import type { User } from './auth'

export function requireSession(user: User): void {
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (!isSessionValid(user, nowSeconds)) throw new Error('session expired')
}
`,
    },
    defect: {
      category: 'security',
      places: [
        { file: 'src/middleware.ts', marker: 'isSessionValid(user, nowSeconds)' },
        { file: 'src/middleware.ts', marker: 'const nowSeconds' },
      ],
    },
  },
  {
    id: 'hard-bug-sort-reversed',
    kind: 'bug',
    summary: 'sortCheapestFirst sorts the most expensive first.',
    request: 'Add a helper that sorts cart items cheapest first',
    edits: [
      {
        file: 'src/cart.ts',
        find: 'export function removeItem(',
        replace:
          '// Cheapest product first.\nexport function sortCheapestFirst(items: CartItem[]): CartItem[] {\n  return [...items].sort((a, b) => b.priceCents - a.priceCents)\n}\n\nexport function removeItem(',
      },
    ],
    defect: { category: 'suspicious', places: [{ file: 'src/cart.ts', marker: 'b.priceCents - a.priceCents' }] },
  },
  {
    id: 'hard-bug-cart-mutated',
    kind: 'bug',
    summary: 'removeItem now changes the cart it is given instead of returning a new one, unlike the rest of the cart API.',
    request: 'Make removeItem avoid building a new array',
    edits: [
      {
        file: 'src/cart.ts',
        find: 'export function removeItem(items: CartItem[], productId: string): CartItem[] {\n  return items.filter(other => other.productId !== productId)\n}',
        replace:
          'export function removeItem(items: CartItem[], productId: string): CartItem[] {\n  const index = items.findIndex(other => other.productId === productId)\n  if (index !== -1) items.splice(index, 1)\n  return items\n}',
      },
    ],
    defect: { category: 'suspicious', places: [{ file: 'src/cart.ts', marker: 'items.splice(index, 1)' }] },
  },
  {
    id: 'hard-bug-page-drops-last-item',
    kind: 'bug',
    summary: 'Each page leaves out its last item: slice already excludes its end.',
    request: 'Add pagination for order lists',
    newFiles: {
      'src/pagination.ts': `// The items of one page; pages start at 0.
export function pageOf<T>(items: T[], page: number, pageSize: number): T[] {
  const start = page * pageSize
  return items.slice(start, start + pageSize - 1)
}
`,
    },
    defect: { category: 'suspicious', places: [{ file: 'src/pagination.ts', marker: 'start + pageSize - 1' }] },
  },
  {
    id: 'hard-bug-buyer-can-refund',
    kind: 'bug',
    summary: 'Asked to let buyers cancel orders; the change lets them refund their own orders, against the rules.',
    request: 'Let buyers cancel their own orders',
    edits: [
      {
        file: 'src/orders.ts',
        find: "if (!canRefund(user)) throw new Error('only admins can refund')",
        replace: "if (!canRefund(user) && user.id !== order.customerId) throw new Error('only admins or the buyer can refund')",
      },
    ],
    defect: { category: 'security', places: [{ file: 'src/orders.ts', marker: 'user.id !== order.customerId' }] },
  },
  {
    id: 'hard-bug-installments-fractional',
    kind: 'bug',
    summary: 'Installments are total / months, unrounded: fractional cents, against the rules, and nothing for zero months.',
    request: 'Split a payment into monthly installments',
    newFiles: {
      'src/installments.ts': `// Splits a total into equal monthly installments.
export function installments(totalCents: number, months: number): number[] {
  return Array.from({ length: months }, () => totalCents / months)
}
`,
    },
    defect: { category: 'business-logic', places: [{ file: 'src/installments.ts', marker: 'totalCents / months' }] },
  },

  {
    id: 'hard-clean-move-shipping',
    kind: 'clean',
    summary: 'Moves shippingCents into its own module and re-exports it, same behaviour.',
    request: 'Move the shipping calculation into its own file',
    edits: [
      {
        file: 'src/pricing.ts',
        find: "import { FREE_SHIPPING_FROM_CENTS, MAX_DISCOUNT_RATE, SHIPPING_FEE_CENTS } from './rules'",
        replace: "import { MAX_DISCOUNT_RATE } from './rules'\nimport { shippingCents } from './shipping'\n\nexport { shippingCents }",
      },
      {
        file: 'src/pricing.ts',
        find: 'export function shippingCents(subtotal: number): number {\n  return subtotal >= FREE_SHIPPING_FROM_CENTS ? 0 : SHIPPING_FEE_CENTS\n}\n\n',
        replace: '',
      },
    ],
    newFiles: {
      'src/shipping.ts': `import { FREE_SHIPPING_FROM_CENTS, SHIPPING_FEE_CENTS } from './rules'

export function shippingCents(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_FROM_CENTS ? 0 : SHIPPING_FEE_CENTS
}
`,
    },
  },
  {
    id: 'hard-clean-loop-instead-of-reduce',
    kind: 'clean',
    summary: 'Rewrites subtotalCents as a loop, same result.',
    request: 'Write subtotalCents as a plain loop',
    edits: [
      {
        file: 'src/pricing.ts',
        find: '  return lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0)',
        replace: '  let sum = 0\n  for (const line of lines) sum += line.priceCents * line.quantity\n  return sum',
      },
    ],
  },
  {
    id: 'hard-clean-rename-across-files',
    kind: 'clean',
    summary: 'Renames canRefund to mayRefund in its module and its caller.',
    request: 'Rename canRefund to mayRefund',
    edits: [
      { file: 'src/auth.ts', find: 'export function canRefund(user: User): boolean {', replace: 'export function mayRefund(user: User): boolean {' },
      { file: 'src/orders.ts', find: "import { canRefund } from './auth'", replace: "import { mayRefund } from './auth'" },
      { file: 'src/orders.ts', find: 'if (!canRefund(user))', replace: 'if (!mayRefund(user))' },
    ],
  },
]
