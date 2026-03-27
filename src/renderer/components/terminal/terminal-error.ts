export interface TerminalLaunchIssue {
  title: string
  message: string
  suggestions: string[]
  technicalDetails: string
}

function parseTerminalError(rawError: string | null | undefined): {
  code: string | null
  summary: string
  details: string
} {
  const normalized = (rawError || '').trim()
  if (!normalized) {
    return {
      code: null,
      summary: '',
      details: ''
    }
  }

  const [firstLine, ...rest] = normalized.split('\n')
  const match = firstLine.match(/^\[([A-Z_]+)\]\s*(.*)$/)

  if (!match) {
    return {
      code: null,
      summary: firstLine,
      details: normalized
    }
  }

  return {
    code: match[1],
    summary: match[2] || firstLine,
    details: rest.join('\n').trim() || match[2] || normalized
  }
}

export function describeTerminalLaunchError(
  rawError: string | null | undefined,
  t: (key: string) => string
): TerminalLaunchIssue {
  const parsed = parseTerminalError(rawError)
  const rawLower = (rawError || '').toLowerCase()

  if (parsed.code === 'PTY_HELPER_START_FAILED' || rawLower.includes('posix_spawnp failed')) {
    return {
      title: t('Claude Code terminal failed to start'),
      message: t('The macOS terminal helper could not be launched. This usually means its executable permission is missing.'),
      suggestions: [
        t('Restart the terminal after updating or reinstalling the app.'),
        t('If the problem persists, reinstall SkillsFan so the bundled terminal helper is restored.')
      ],
      technicalDetails: parsed.details || rawError || t('Unknown error')
    }
  }

  if (parsed.code === 'PTY_CLI_MISSING') {
    return {
      title: t('Claude Code terminal failed to start'),
      message: t('The Claude Code CLI is missing from this app build. Reinstall the app or rebuild dependencies.'),
      suggestions: [
        t('Reinstall or rebuild the app so the bundled Claude Code CLI is available.')
      ],
      technicalDetails: parsed.details || rawError || t('Unknown error')
    }
  }

  if (parsed.code === 'PTY_WORKDIR_UNAVAILABLE') {
    return {
      title: t('Claude Code terminal failed to start'),
      message: t('The terminal working directory is unavailable. Check whether the project folder still exists and is accessible.'),
      suggestions: [
        t('Make sure the selected space folder still exists and that SkillsFan can access it.')
      ],
      technicalDetails: parsed.details || rawError || t('Unknown error')
    }
  }

  if (parsed.code === 'PTY_AUTH_REQUIRED') {
    return {
      title: t('Claude Code terminal failed to start'),
      message: t('Your current AI source is not ready. Check login status or API settings, then restart the terminal.'),
      suggestions: [
        t('Open Settings to verify login, model, and provider configuration.')
      ],
      technicalDetails: parsed.details || rawError || t('Unknown error')
    }
  }

  if (parsed.code === 'PTY_RUNTIME_UNAVAILABLE') {
    return {
      title: t('Claude Code terminal failed to start'),
      message: t('The local PTY runtime could not be loaded. Reinstall dependencies or rebuild the app.'),
      suggestions: [
        t('Reinstall dependencies or rebuild the app to restore the terminal runtime.')
      ],
      technicalDetails: parsed.details || rawError || t('Unknown error')
    }
  }

  return {
    title: t('Claude Code terminal failed to start'),
    message: parsed.summary || t('SkillsFan could not start the embedded Claude Code terminal.'),
    suggestions: [
      t('Restart the terminal after updating or reinstalling the app.'),
      t('Open Settings to verify login, model, and provider configuration.')
    ],
    technicalDetails: parsed.details || rawError || t('Unknown error')
  }
}
