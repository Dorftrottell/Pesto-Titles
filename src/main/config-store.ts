import { app } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import type { AppConfig } from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/types'
import log from 'electron-log'

function getConfigPath(): string {
  const dir = join(app.getPath('userData'), 'config')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'config.json')
}

export function getConfig(): AppConfig {
  const path = getConfigPath()
  if (!existsSync(path)) return DEFAULT_CONFIG
  try {
    const raw = readFileSync(path, 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch (e) {
    log.warn('Could not parse config, using defaults:', e)
    return DEFAULT_CONFIG
  }
}

export function setConfig(config: AppConfig): void {
  const path = getConfigPath()
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8')
  log.info('Config saved')
}
