// Every text the person sees, in each supported language.

export type Language = 'en' | 'es'

// What a change request puts in the prompt, already formatted (see change-request.ts).
export type ChangeRequestParts = {
  category: string
  title: string
  location: string
  problem: string
  // The diff excerpt inside a code fence, or undefined when there is none.
  fencedExcerpt: string | undefined
}

export type Messages = {
  // Name of the language, as the models are asked to write in it.
  languageNameForModel: string

  paneTitle: string
  notAGitRepository: string
  waitingForFirstTurn: string
  autoAnalysisOff: string
  analysisFailed: (errorMessage: string) => string
  baseBranchLabel: (baseBranch: string) => string

  // The loader shown while an analysis runs.
  loaderTitle: (baseBranch: string) => string
  progressReadingChanges: string
  progressTriage: (fileCount: number) => string
  progressDeepReview: (fileCount: number, model: string) => string
  loaderHint: string
  previousResultsNote: string

  needsReviewHeading: (count: number) => string
  nothingCritical: string
  reviewInPrHeading: (count: number) => string
  markReviewedButton: string
  requestChangesButton: string
  // The prompt "Request changes" writes, so the session fixes the finding.
  changeRequest: (parts: ChangeRequestParts) => string
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
  analysisFailed: errorMessage => `Analysis failed: ${errorMessage}`,
  baseBranchLabel: baseBranch => `Base: ${baseBranch}`,

  loaderTitle: baseBranch => `⏳ Analyzing changes against ${baseBranch}…`,
  progressReadingChanges: 'Reading the changes',
  progressTriage: fileCount => `Sorting ${fileCount} changed file(s) by risk`,
  progressDeepReview: (fileCount, model) => `Deep review of ${fileCount} file(s) with ${model}`,
  loaderHint: 'This usually takes 20–40 seconds. You can keep working meanwhile.',
  previousResultsNote: 'Below: the previous analysis. It updates when this one finishes.',

  needsReviewHeading: count => `Needs your review (${count})`,
  nothingCritical: 'Nothing critical found.',
  reviewInPrHeading: count => `Review in the PR (${count})`,
  markReviewedButton: '✓ Reviewed',
  requestChangesButton: 'Request changes',
  changeRequest: ({ category, title, location, problem, fencedExcerpt }) =>
    [
      'review-radar flagged this change for review. Please fix it.',
      '',
      `Finding: [${category}] ${title}`,
      `Where: ${location}`,
      `Problem: ${problem}`,
      ...(fencedExcerpt ? ['', 'Code under review:', fencedExcerpt] : []),
      '',
      'Correct the problem described above, or revert the change if it should not be there. Keep everything else as it is, and tell me what you changed.',
      '',
    ].join('\n'),
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
  analysisFailed: errorMessage => `Error al analizar: ${errorMessage}`,
  baseBranchLabel: baseBranch => `Base: ${baseBranch}`,

  loaderTitle: baseBranch => `⏳ Analizando cambios contra ${baseBranch}…`,
  progressReadingChanges: 'Leyendo los cambios',
  progressTriage: fileCount => `Clasificando ${fileCount} archivo(s) cambiado(s) por riesgo`,
  progressDeepReview: (fileCount, model) => `Revisión a fondo de ${fileCount} archivo(s) con ${model}`,
  loaderHint: 'Suele tardar entre 20 y 40 segundos. Puedes seguir trabajando mientras tanto.',
  previousResultsNote: 'Debajo: el análisis anterior. Se actualiza cuando termine este.',

  needsReviewHeading: count => `Requiere tu revisión (${count})`,
  nothingCritical: 'Nada crítico detectado.',
  reviewInPrHeading: count => `Revisar en la PR (${count})`,
  markReviewedButton: '✓ Revisado',
  requestChangesButton: 'Pedir cambios',
  changeRequest: ({ category, title, location, problem, fencedExcerpt }) =>
    [
      'review-radar ha marcado este cambio para revisión. Corrígelo, por favor.',
      '',
      `Hallazgo: [${category}] ${title}`,
      `Dónde: ${location}`,
      `Problema: ${problem}`,
      ...(fencedExcerpt ? ['', 'Código en revisión:', fencedExcerpt] : []),
      '',
      'Corrige el problema descrito arriba, o revierte el cambio si no debería estar. Deja todo lo demás como está y dime qué has cambiado.',
      '',
    ].join('\n'),
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
