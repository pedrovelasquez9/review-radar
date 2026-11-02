import { expect, test } from 'claude-code/testing'

import { messagesFor } from '../core/messages'
import { parseReviewAnswer } from '../core/review'
import { findLiteralSecrets, mergeSecretFindings } from '../core/secrets'
import { PAY_DIFF } from './fixtures'

const ENGLISH = messagesFor('en')

test('a literal secret is flagged critical at its line', async () => {
  const findings = findLiteralSecrets(PAY_DIFF, ENGLISH)

  expect(findings.length).toBe(1)
  expect(findings[0]?.file).toBe('src/pay.ts')
  expect(findings[0]?.line).toBe(11)
})

test('the secret floor overrides the model', async () => {
  const modelAnswer = parseReviewAnswer(
    'here: {"summary":"s","findings":[' +
      '{"severity":"pr","category":"secrets","file":"src/pay.ts","title":"t","why":"w"},' +
      '{"severity":"bogus","file":"a.ts","title":"x"}]}',
  )
  expect(modelAnswer.findings[1]?.severity).toBe('pr')

  const merged = mergeSecretFindings(modelAnswer.findings, findLiteralSecrets(PAY_DIFF, ENGLISH))
  const payFindings = merged.filter(finding => finding.file === 'src/pay.ts')

  expect(payFindings.map(finding => finding.severity)).toEqual(['critical'])
})
