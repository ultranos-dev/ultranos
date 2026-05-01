/**
 * Server-side virus scanning abstraction.
 *
 * Production: connects to ClamAV daemon via TCP (clamd).
 * Development/fallback: when CLAMAV_HOST is not set, queues files
 * for deferred scanning (never silently accepts unscanned files).
 *
 * Story 12.3 — AC 10
 */

import { createHash } from 'crypto'

export type ScanResult =
  | { status: 'clean'; hash: string }
  | { status: 'infected'; threat: string; hash: string }
  | { status: 'deferred'; reason: string; hash: string }
  | { status: 'error'; message: string; hash: string }

/**
 * Compute SHA-256 hash of file content for audit trail.
 */
function computeFileHash(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Scan a file buffer for malware.
 *
 * If ClamAV is configured (CLAMAV_HOST env var), performs a real scan.
 * If ClamAV is unavailable, returns 'deferred' status — the file
 * must be queued for later scanning and NOT persisted as 'clean'.
 */
export async function scanFile(fileBuffer: Buffer): Promise<ScanResult> {
  const hash = computeFileHash(fileBuffer)
  const clamavHost = process.env.CLAMAV_HOST

  if (!clamavHost) {
    return {
      status: 'deferred',
      reason: 'Virus scan service not configured — file queued for deferred scanning',
      hash,
    }
  }

  try {
    const clamavPort = parseInt(process.env.CLAMAV_PORT ?? '3310', 10)
    const { Socket } = await import('net')

    return await new Promise<ScanResult>((resolve) => {
      const socket = new Socket()
      const chunks: Buffer[] = []
      let resolved = false

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          socket.destroy()
          resolve({
            status: 'deferred',
            reason: 'Virus scan timed out — file queued for deferred scanning',
            hash,
          })
        }
      }, 30_000) // 30s timeout

      socket.connect(clamavPort, clamavHost, () => {
        // ClamAV INSTREAM protocol: zINSTREAM\0, then length-prefixed chunks, then zero-length chunk
        socket.write('zINSTREAM\0')

        // Send file content in chunks
        const chunkSize = 2048
        for (let i = 0; i < fileBuffer.length; i += chunkSize) {
          const chunk = fileBuffer.subarray(i, i + chunkSize)
          const sizeHeader = Buffer.alloc(4)
          sizeHeader.writeUInt32BE(chunk.length, 0)
          socket.write(sizeHeader)
          socket.write(chunk)
        }

        // End with zero-length chunk
        const endHeader = Buffer.alloc(4)
        endHeader.writeUInt32BE(0, 0)
        socket.write(endHeader)
      })

      socket.on('data', (data) => {
        chunks.push(data)
      })

      socket.on('end', () => {
        clearTimeout(timeout)
        if (resolved) return
        resolved = true

        const response = Buffer.concat(chunks).toString('utf-8').trim()
        if (response.includes('FOUND')) {
          const threat = response.replace(/^.*:\s*/, '').replace(/\s*FOUND$/, '')
          resolve({ status: 'infected', threat, hash })
        } else if (response.endsWith('OK')) {
          resolve({ status: 'clean', hash })
        } else {
          resolve({
            status: 'error',
            message: `Unexpected ClamAV response: ${response}`,
            hash,
          })
        }
      })

      socket.on('error', () => {
        clearTimeout(timeout)
        if (resolved) return
        resolved = true
        resolve({
          status: 'deferred',
          reason: 'Virus scan service unavailable — file queued for deferred scanning',
          hash,
        })
      })
    })
  } catch {
    return {
      status: 'deferred',
      reason: 'Virus scan service connection failed — file queued for deferred scanning',
      hash,
    }
  }
}
