// Words a finding uses when it names each planted defect (lowercase, matched as
// substrings of the finding's title and reason). Broad on purpose: any one of
// them is enough, so a strict hit only rules out findings about something else.

export const DEFECT_KEYWORDS: Record<string, string[]> = {
  'bug-free-shipping-boundary': ['exactly', 'or more', '>=', 'boundary', 'equal'],
  'bug-discount-over-cap': ['10%', '0.1', 'cap', 'exceed', 'rule'],
  'bug-refund-check-inverted': ['invert', 'negat', 'non-admin', 'customers can', 'any customer', 'reverse', 'backward', 'flipped', 'opposite', 'admins cannot'],
  'bug-refund-unpaid-order': ['pending', 'unpaid', 'not paid', 'not been paid', 'before payment'],
  'bug-payment-error-swallowed': ['empty', "''", 'swallow', 'silent', 'unpaid', 'failure'],
  'bug-timeout-units': ['millisecond', 'seconds', 'unit'],
  'bug-discount-fractional-cents': ['round', 'fraction', 'whole', 'integer', 'decimal'],
  'bug-quantity-check-removed': ['validation', 'negative', 'zero', 'positive', 'whole number', 'check'],
  'bug-unit-limit-wrong-variable': ['existing', 'total', 'already in', 'cumulative', 'combined', 'item.quantity'],
  'bug-live-key-in-code': ['key', 'secret', 'credential'],
  'bug-destructive-migration': ['drop', 'data', 'loss', 'destructive'],
  'bug-email-to-third-party': ['email', 'third', 'external', 'track'],
  'bug-unrequested-fee-change': ['shipping', 'fee', '599', 'request', 'asked'],
  'bug-new-status-unhandled': ['statuslabel', 'switch', 'exhaustive', 'label', 'unhandled', 'not handled', 'undefined'],
  'bug-price-drops-cents': ['cent', 'decimal', 'floor', 'truncat'],
  'bug-unbounded-payment-retry': ['infinite', 'forever', 'unbounded', 'never stop', 'endless', 'max_attempts', 'limit'],
  'bug-token-prefix-check': ['prefix', 'startswith', 'empty', 'partial', 'length'],
  'hard-bug-price-divided-twice': ['twice', 'double', '100', 'divid'],
  'hard-bug-arguments-swapped': ['order', 'swap', 'reversed', 'argument', 'parameter'],
  'hard-bug-config-key-renamed': ['sessionminutes', 'session.ts', 'still read', 'old key', 'undefined', 'nan'],
  'hard-bug-boundary-in-refactor': ['>=', 'exactly', 'boundary', 'off-by-one', 'off by one', '50 units'],
  'hard-bug-idempotency-key-dropped': ['idempotency'],
  'hard-bug-seconds-for-milliseconds': ['second', 'millisecond', 'unit'],
  'hard-bug-sort-reversed': ['descending', 'expensive', 'reverse', 'opposite', 'highest'],
  'hard-bug-cart-mutated': ['mutat', 'in place', 'in-place', 'modif', 'splice'],
  'hard-bug-page-drops-last-item': ['last', 'off-by-one', 'off by one', 'exclusive', 'one fewer', 'drops'],
  'hard-bug-buyer-can-refund': ['buyer', 'customer', 'admin', 'owner'],
  'hard-bug-installments-fractional': ['round', 'fraction', 'whole', 'zero', 'remainder', 'integer'],
}
