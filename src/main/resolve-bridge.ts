import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'
import log from 'electron-log'
import type { BridgeCommand, BridgeResponse } from '@shared/types'

// ---------------------------------------------------------------
// Python paths — DaVinci Resolve ships Python 3 at known locations
// ---------------------------------------------------------------
const RESOLVE_PYTHON_PATHS_MAC = [
  '/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules',
  '/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/Python39/lib/python3.9',
]

function findPython(): string {
  // On macOS/Windows, try well-known Resolve Python paths first
  // Fall back to system python3
  for (const candidate of ['/usr/bin/python3', '/usr/local/bin/python3', 'python3', 'python']) {
    try {
      return candidate
    } catch {
      // continue
    }
  }
  return 'python3'
}

const BRIDGE_SCRIPT = app.isPackaged
  ? join(process.resourcesPath, 'bridge', 'resolve_bridge.py')
  : join(__dirname, '../../bridge/resolve_bridge.py')

// ---------------------------------------------------------------
// Bridge instance (singleton)
// ---------------------------------------------------------------

type PendingCallback = {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
  progressCb?: (p: { current: number; total: number }) => void
}

let bridgeProcess: ChildProcess | null = null
const pending = new Map<string, PendingCallback>()
let buffer = ''

function getBridgeProcess(): ChildProcess {
  if (bridgeProcess && !bridgeProcess.killed) return bridgeProcess

  const python = findPython()
  log.info(`Spawning bridge: ${python} ${BRIDGE_SCRIPT}`)

  const child = spawn(python, [BRIDGE_SCRIPT], {
    env: {
      ...process.env,
      // Add Resolve's scripting module to PYTHONPATH
      PYTHONPATH: [
        process.env['PYTHONPATH'] || '',
        ...RESOLVE_PYTHON_PATHS_MAC,
      ].filter(Boolean).join(':'),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  buffer = ''

  child.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    // Lines are newline-delimited JSON
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg: BridgeResponse = JSON.parse(line)
        handleBridgeMessage(msg)
      } catch (e) {
        log.warn('Could not parse bridge output:', line, e)
      }
    }
  })

  child.stderr?.on('data', (chunk: Buffer) => {
    log.warn('[bridge stderr]', chunk.toString())
  })

  child.on('exit', (code) => {
    log.info(`Bridge exited with code ${code}`)
    bridgeProcess = null
    // Reject all pending calls
    for (const [id, cb] of pending.entries()) {
      cb.reject(new Error(`Bridge exited (code ${code})`))
      pending.delete(id)
    }
  })

  bridgeProcess = child
  return child
}

function handleBridgeMessage(msg: BridgeResponse): void {
  const cb = pending.get(msg.id)
  if (!cb) return

  if (msg.progress && cb.progressCb) {
    cb.progressCb(msg.progress)
    return  // Don't resolve yet
  }

  pending.delete(msg.id)
  if (msg.ok) {
    cb.resolve(msg.data)
  } else {
    cb.reject(new Error(msg.error || 'Bridge returned error'))
  }
}

export function sendBridgeCommand(
  cmd: string,
  params?: Record<string, unknown>,
  progressCb?: (p: { current: number; total: number }) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const command: BridgeCommand = { id, cmd, params }
    pending.set(id, { resolve, reject, progressCb })

    try {
      const proc = getBridgeProcess()
      proc.stdin?.write(JSON.stringify(command) + '\n')
    } catch (e) {
      pending.delete(id)
      reject(e)
    }
  })
}

export function killBridge(): void {
  if (bridgeProcess) {
    bridgeProcess.kill()
    bridgeProcess = null
  }
}
