// Every text the person sees, in each supported language.

export type Language = 'en' | 'es'

export type Messages = {
  // Name of the language, as the models are asked to write in it.
  languageNameForModel: string

  paneTitle: string
  notAGitRepository: string
  waitingForFirstTurn: string
  autoAnalysisOff: string
  analyzingAgainst: (baseBranch: string) => string
  analysisFailed: (errorMessage: string) => string
  baseBranchLabel: (baseBranch: string) => string

  needsReviewHeading: (count: number) => string
  nothingCritical: string
  reviewInPrHeading: (count: number) => string
  markReviewedButton: string
  requestChangesButton: string
  requestChangesPrompt: (location: string, title: string) => string
  reanalyzeButton: string

  noChangesSummary: string
  onlyRoutineSummary: string
  truncatedDiffNote: string
  fallbackModelNote: (preferredModel: string, usedModel: string) => string
  routineChangeTitle: string
  secretFindingTitle: string
  secretFindingReason: string

  statusLineAnalyzing: string
  statusLineDeepReview: (fileCount: number) => string
  needsReviewToast: (count: number) => string

  textReportHeadline: (baseBranch: string, summary: string) => string
  textReportPrCount: (count: number) => string
  commandFailed: string
}

const ENGLISH: Messages = {
  languageNameForModel: 'English',

  paneTitle: 'Review',
  notAGitRepository: 'Not a git repository.',
  waitingForFirstTurn: 'Waiting for the first turn…',
  autoAnalysisOff: 'Automatic analysis is off: press Re-analyze or run /review-radar.',
  analyzingAgainst: baseBranch => `Analyzing changes against ${baseBranch}…`,
  analysisFailed: errorMessage => `Analysis failed: ${errorMessage}`,
  baseBranchLabel: baseBranch => `Base: ${baseBranch}`,

  needsReviewHeading: count => `Needs your review (${count})`,
  nothingCritical: 'Nothing critical found.',
  reviewInPrHeading: count => `Review in the PR (${count})`,
  markReviewedButton: '✓ Reviewed',
  requestChangesButton: 'Request changes',
  requestChangesPrompt: (location, title) => `In ${location} (${title}): `,
  reanalyzeButton: '↻ Re-analyze',

  noChangesSummary: 'No changes against the base.',
  onlyRoutineSummary: 'Only routine changes: review them in the PR.',
  truncatedDiffNote: ' (diff truncated: also review the full PR)',
  fallbackModelNote: (preferredModel, usedModel) => ` (reviewed with ${usedModel}: ${preferredModel} was unavailable)`,
  routineChangeTitle: 'Routine change',
  secretFindingTitle: 'Possible secret in the code',
  secretFindingReason:
    'An added line looks like a literal credential: move it to a secret or environment variable, and rotate it if it was ever pushed.',

  statusLineAnalyzing: 'review-radar: analyzing changes…',
  statusLineDeepReview: fileCount => `review-radar: deep review of ${fileCount} file(s)…`,
  needsReviewToast: count => `review-radar: ${count} change(s) need your review`,

  textReportHeadline: (baseBranch, summary) => `Review against ${baseBranch}: ${summary}`,
  textReportPrCount: count => `Review in the PR: ${count} change(s).`,
  commandFailed: 'review-radar could not finish the analysis. Try again, or check the pane for the error.',
}

const SPANISH: Messages = {
  languageNameForModel: 'Spanish',

  paneTitle: 'Revisión',
  notAGitRepository: 'No es un repositorio git.',
  waitingForFirstTurn: 'Esperando al primer turno…',
  autoAnalysisOff: 'El análisis automático está desactivado: pulsa Re-analizar o ejecuta /review-radar.',
  analyzingAgainst: baseBranch => `Analizando cambios contra ${baseBranch}…`,
  analysisFailed: errorMessage => `Error al analizar: ${errorMessage}`,
  baseBranchLabel: baseBranch => `Base: ${baseBranch}`,

  needsReviewHeading: count => `Requiere tu revisión (${count})`,
  nothingCritical: 'Nada crítico detectado.',
  reviewInPrHeading: count => `Revisar en la PR (${count})`,
  markReviewedButton: '✓ Revisado',
  requestChangesButton: 'Pedir cambios',
  requestChangesPrompt: (location, title) => `En ${location} (${title}): `,
  reanalyzeButton: '↻ Re-analizar',

  noChangesSummary: 'Sin cambios respecto a la base.',
  onlyRoutineSummary: 'Solo cambios rutinarios: revísalos en la PR.',
  truncatedDiffNote: ' (diff truncado: revisa también la PR completa)',
  fallbackModelNote: (preferredModel, usedModel) => ` (revisado con ${usedModel}: ${preferredModel} no estaba disponible)`,
  routineChangeTitle: 'Cambio rutinario',
  secretFindingTitle: 'Posible secreto en el código',
  secretFindingReason:
    'Una línea añadida parece contener una credencial literal: muévela a un secreto o variable de entorno, y rótala si llegó a subirse.',

  statusLineAnalyzing: 'review-radar: analizando cambios…',
  statusLineDeepReview: fileCount => `review-radar: revisando ${fileCount} archivo(s) a fondo…`,
  needsReviewToast: count => `review-radar: ${count} cambio(s) requieren tu revisión`,

  textReportHeadline: (baseBranch, summary) => `Revisión contra ${baseBranch}: ${summary}`,
  textReportPrCount: count => `Revisar en la PR: ${count} cambio(s).`,
  commandFailed: 'review-radar no pudo terminar el análisis. Inténtalo de nuevo o mira el error en el panel.',
}

export function messagesFor(language: Language): Messages {
  return language === 'es' ? SPANISH : ENGLISH
}
