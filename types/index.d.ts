export type Severity = 'critical' | 'pr'

export type Finding = {
  // 'critical' needs a person before merging; 'pr' can wait for the pull request.
  severity: Severity
  // One of the review categories (business-logic, data, suspicious…), or 'routine'.
  category: string
  file: string
  // Line in the new version of the file; only kept when it falls inside the diff.
  line?: number
  title: string
  // One sentence: what to check and the risk.
  why: string
  // The diff hunk drawn under a critical finding.
  diffExcerpt?: string
  // Hash of the file and its excerpt: a "reviewed" mark holds while that code is unchanged.
  reviewKey?: string
}

export type ReportStatus = 'idle' | 'analyzing' | 'ready' | 'error' | 'no-repo'

export type Report = {
  status: ReportStatus
  summary: string
  findings: Finding[]
  // The branch the diff is taken against (origin/main, master…).
  baseBranch: string
  // Hash of the whole diff: an analysis of the same diff is skipped.
  diffHash: string
  // Hash of each file's diff: files unchanged since the last analysis keep their findings.
  fileDiffHashes: Record<string, string>
  // The language the summary and findings were written in.
  language: 'en' | 'es'
  analyzedAt: number
  errorMessage?: string
}

declare module 'claude-code' {
  interface PluginState {
    'review-radar': {
      report: Shaped<Report>
      isPrListOpen: boolean
      reviewedKeys: string[]
    }
  }
}
