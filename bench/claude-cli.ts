// Asks a model through the Claude Code CLI installed on this machine, with the
// person's own login: no API key and no service besides their Claude account.
// Each call is a one-shot `claude -p` with every tool off, no settings files
// (so no plugins, hooks or MCP servers of theirs), no saved session, and the
// given system prompt instead of Claude Code's own.

import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type ModelCall = {
  model: string
  effort: 'low' | 'medium' | 'high' | 'xhigh'
  system: string
  prompt: string
  timeoutMs: number
}

export type ModelReply = { text: string; costUsd: number; durationMs: number }

export type CompleteWithModel = (call: ModelCall) => Promise<ModelReply>

// `workDirectory`: an empty folder the CLI runs in, so it finds no project of its own.
export function claudeCli(workDirectory: string): CompleteWithModel {
  mkdirSync(workDirectory, { recursive: true })
  const executable = findClaudeExecutable()

  // The system prompt goes as an argument (a few thousand characters, far below
  // the command line limit); the prompt, which holds the diff, goes on stdin.
  return async ({ model, effort, system, prompt, timeoutMs }) => {
    const child = Bun.spawn(
      [
        executable,
        '-p',
        '--model',
        model,
        '--effort',
        effort,
        '--system-prompt',
        system,
        '--tools',
        '',
        '--setting-sources',
        '',
        '--strict-mcp-config',
        '--no-session-persistence',
        '--output-format',
        'json',
      ],
      { cwd: workDirectory, stdin: new Blob([prompt]), stdout: 'pipe', stderr: 'pipe' },
    )
    const timer = setTimeout(() => child.kill(), timeoutMs)
    try {
      const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
      await child.exited
      return parseReply(stdout, stderr)
    } finally {
      clearTimeout(timer)
    }
  }
}

// An npm install on Windows puts a `claude.cmd` wrapper on PATH, and a .cmd
// cannot take the quotes and brackets of a system prompt as an argument: the
// binary it wraps is called directly instead.
function findClaudeExecutable(): string {
  const onPath = Bun.which('claude')
  if (onPath === null) throw new Error('the claude CLI is not on PATH')
  const wrapped = join(dirname(onPath), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
  return /\.cmd$/i.test(onPath) && existsSync(wrapped) ? wrapped : onPath
}

function parseReply(stdout: string, stderr: string): ModelReply {
  let reply: { result?: unknown; is_error?: unknown; total_cost_usd?: unknown; duration_ms?: unknown }
  try {
    reply = JSON.parse(stdout)
  } catch {
    throw new Error(`claude CLI gave no JSON: ${(stderr || stdout).slice(0, 300)}`)
  }
  if (reply.is_error === true || typeof reply.result !== 'string') {
    throw new Error(`claude CLI: ${String(reply.result ?? stderr).slice(0, 300)}`)
  }
  return {
    text: reply.result,
    costUsd: typeof reply.total_cost_usd === 'number' ? reply.total_cost_usd : 0,
    durationMs: typeof reply.duration_ms === 'number' ? reply.duration_ms : 0,
  }
}
