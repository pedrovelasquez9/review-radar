// Deterministic floor under the model: a literal secret in an added line is
// always a critical finding, whatever the model says.

import type { Finding } from '../types'
import type { Messages } from './messages'

const SECRET_PATTERNS: readonly RegExp[] = [
  // Stripe-style and similar prefixed keys: sk_live_…, pk_test_…
  /\b(sk|pk|rk)[-_](live|test|proj)?[-_]?[A-Za-z0-9]{16,}/,
  // GitHub tokens
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  // AWS access key ids
  /\bAKIA[0-9A-Z]{16}\b/,
  // Slack tokens
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  // PEM private keys
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  // JWTs
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  // A secret-named key assigned a long quoted literal
  /(api[_-]?key|secret|token|passw(or)?d|private[_-]?key)["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i,
]

export function findLiteralSecrets(diff: string, messages: Messages): Finding[] {
  const findings: Finding[] = []
  let currentFile = ''
  let currentNewLine = 0

  for (const diffLine of diff.split('\n')) {
    if (diffLine.startsWith('+++ ')) {
      currentFile = diffLine.slice('+++ '.length).replace(/^b\//, '')
      continue
    }

    const hunkHeader = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(diffLine)
    if (hunkHeader) {
      currentNewLine = Number(hunkHeader[1])
      continue
    }

    // Removed lines do not exist in the new file and do not advance its numbering.
    if (diffLine.startsWith('-')) continue

    const isAddedLine = diffLine.startsWith('+')
    if (isAddedLine && SECRET_PATTERNS.some(pattern => pattern.test(diffLine))) {
      findings.push({
        severity: 'critical',
        category: 'secrets',
        file: currentFile,
        line: currentNewLine,
        title: messages.secretFindingTitle,
        why: messages.secretFindingReason,
      })
    }
    currentNewLine++
  }

  return findings
}

// The model's findings plus the secret findings it missed. When the model also
// flagged a secret in the file, its wording is kept and forced to critical.
export function mergeSecretFindings(modelFindings: Finding[], secretFindings: Finding[]): Finding[] {
  const filesWithSecrets = new Set(secretFindings.map(finding => finding.file))

  const checkedModelFindings = modelFindings.map(finding =>
    finding.category === 'secrets' && filesWithSecrets.has(finding.file)
      ? { ...finding, severity: 'critical' as const }
      : finding,
  )

  const filesTheModelFlagged = new Set(
    checkedModelFindings.filter(finding => finding.category === 'secrets').map(finding => finding.file),
  )
  const missedSecrets = secretFindings.filter(finding => !filesTheModelFlagged.has(finding.file))

  return [...missedSecrets, ...checkedModelFindings]
}
