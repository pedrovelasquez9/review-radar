// The repository every case starts from: a small shop backend, with its business
// rules written down where review-radar reads them (docs/rules.md). Each case
// edits it on a branch (see cases.ts).

export const BASE_PROJECT: Record<string, string> = {
  'README.md': `# Shop

A small shop backend: carts, pricing, orders and payments. The business rules are in docs/rules.md.
`,

  'docs/rules.md': `# Shop rules

- Prices are stored and computed in cents, as whole numbers.
- A discount never exceeds 10% of the subtotal.
- Orders with a subtotal of 50.00 or more ship free; the others pay a flat 4.99.
- A cart holds at most 50 units of one product.
- Only admins can refund an order, and only once it is paid.
- Customer emails never leave our own backend.
`,

  'src/rules.ts': `// The business rules in docs/rules.md, as numbers.
export const MAX_DISCOUNT_RATE = 0.1
export const FREE_SHIPPING_FROM_CENTS = 5000
export const SHIPPING_FEE_CENTS = 499
export const MAX_UNITS_PER_PRODUCT = 50
`,

  'src/pricing.ts': `import { FREE_SHIPPING_FROM_CENTS, MAX_DISCOUNT_RATE, SHIPPING_FEE_CENTS } from './rules'

export type Line = { priceCents: number; quantity: number }

export function subtotalCents(lines: Line[]): number {
  return lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0)
}

export function discountCents(subtotal: number, rate: number): number {
  const allowedRate = Math.min(rate, MAX_DISCOUNT_RATE)
  return Math.round(subtotal * allowedRate)
}

export function shippingCents(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_FROM_CENTS ? 0 : SHIPPING_FEE_CENTS
}

export function totalCents(lines: Line[], discountRate: number): number {
  const subtotal = subtotalCents(lines)
  return subtotal - discountCents(subtotal, discountRate) + shippingCents(subtotal)
}
`,

  'src/cart.ts': `import { MAX_UNITS_PER_PRODUCT } from './rules'

export type CartItem = { productId: string; priceCents: number; quantity: number }

export function addItem(items: CartItem[], item: CartItem): CartItem[] {
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
}
`,

  'src/auth.ts': `export type User = { id: string; role: 'admin' | 'customer'; sessionStartedAt: number }

const SESSION_LIFETIME_MS = 30 * 60 * 1000

export function isSessionValid(user: User, now: number): boolean {
  return now - user.sessionStartedAt < SESSION_LIFETIME_MS
}

export function canRefund(user: User): boolean {
  return user.role === 'admin'
}

export function hasValidApiToken(provided: string, expected: string): boolean {
  return provided.length === expected.length && provided === expected
}
`,

  'src/orders.ts': `import { canRefund } from './auth'
import type { User } from './auth'

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'refunded'

export type Order = { id: string; status: OrderStatus; totalCents: number }

export function refundOrder(order: Order, user: User): Order {
  if (!canRefund(user)) throw new Error('only admins can refund')
  if (order.status !== 'paid' && order.status !== 'shipped') throw new Error('only paid orders can be refunded')
  return { ...order, status: 'refunded' }
}

export function statusLabel(status: OrderStatus): string {
  switch (status) {
    case 'pending':
      return 'Waiting for payment'
    case 'paid':
      return 'Paid'
    case 'shipped':
      return 'On its way'
    case 'refunded':
      return 'Refunded'
  }
}
`,

  'src/payments.ts': `const PAYMENTS_URL = 'https://payments.internal.example/charge'
const TIMEOUT_MS = 10_000
const MAX_ATTEMPTS = 3

export async function charge(orderId: string, amountCents: number, apiKey: string): Promise<string> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(PAYMENTS_URL, {
        method: 'POST',
        headers: { authorization: \`Bearer \${apiKey}\`, 'content-type': 'application/json' },
        body: JSON.stringify({ orderId, amountCents }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) throw new Error(\`payment failed: \${response.status}\`)
      const { chargeId } = (await response.json()) as { chargeId: string }
      return chargeId
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}
`,

  'src/format.ts': `export function formatPrice(cents: number): string {
  return \`\${(cents / 100).toFixed(2)} €\`
}

export function pluralize(count: number, word: string): string {
  return count === 1 ? word : \`\${word}s\`
}
`,

  'src/db.ts': `export type Customer = { id: string; email: string; name: string }

export async function saveCustomer(data: Omit<Customer, 'id'>): Promise<Customer> {
  return { id: crypto.randomUUID(), ...data }
}
`,

  'src/signup.ts': `import { saveCustomer } from './db'

export async function signUp(email: string, name: string): Promise<string> {
  const customer = await saveCustomer({ email, name })
  return customer.id
}
`,

  'config/app.json': `{
  "sessionMinutes": 30,
  "maxUploadMb": 10,
  "paymentsHost": "payments.internal.example"
}
`,

  'migrations/001_customers.sql': `CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
`,
}
