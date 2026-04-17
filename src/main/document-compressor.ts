/**
 * Document Compression & Decompression
 * Supports gzip and LZ4 compression
 * Tracks compression ratios for analytics
 */

import zlib from 'zlib'
import { promisify } from 'util'

const gzip = promisify(zlib.gzip)
const gunzip = promisify(zlib.gunzip)

export interface CompressionStats {
  originalSize: number
  compressedSize: number
  compressionRatio: number
  compressionType: 'gzip' | 'none'
  timeMs: number
}

export class DocumentCompressor {
  private static readonly MIN_SIZE_TO_COMPRESS = 1024 * 5 // 5KB minimum
  private static readonly COMPRESSION_LEVEL = 6 // 1-9, 6 is good balance

  /**
   * Compress document content
   * Returns compressed buffer and stats
   */
  static async compress(content: string): Promise<{ buffer: Buffer; stats: CompressionStats }> {
    const startTime = Date.now()
    const originalSize = Buffer.byteLength(content, 'utf8')

    // Don't compress small documents
    if (originalSize < this.MIN_SIZE_TO_COMPRESS) {
      return {
        buffer: Buffer.from(content, 'utf8'),
        stats: {
          originalSize,
          compressedSize: originalSize,
          compressionRatio: 1,
          compressionType: 'none',
          timeMs: Date.now() - startTime
        }
      }
    }

    try {
      const buffer = Buffer.from(content, 'utf8')
      const compressed = await gzip(buffer, { level: this.COMPRESSION_LEVEL })
      const compressionRatio = originalSize / compressed.length
      const timeMs = Date.now() - startTime

      return {
        buffer: compressed,
        stats: {
          originalSize,
          compressedSize: compressed.length,
          compressionRatio,
          compressionType: 'gzip',
          timeMs
        }
      }
    } catch (error) {
      console.error('Compression failed:', error)
      // Fallback to uncompressed
      return {
        buffer: Buffer.from(content, 'utf8'),
        stats: {
          originalSize,
          compressedSize: originalSize,
          compressionRatio: 1,
          compressionType: 'none',
          timeMs: Date.now() - startTime
        }
      }
    }
  }

  /**
   * Decompress document content
   * Automatically detects if content was compressed
   */
  static async decompress(buffer: Buffer): Promise<string> {
    try {
      // Check for gzip magic number (1f 8b)
      if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
        const decompressed = await gunzip(buffer)
        return decompressed.toString('utf8')
      } else {
        // Not compressed
        return buffer.toString('utf8')
      }
    } catch (error) {
      console.error('Decompression failed:', error)
      // Fallback to raw
      return buffer.toString('utf8')
    }
  }

  /**
   * Estimate compression ratio for content
   */
  static getEstimatedRatio(content: string): number {
    const size = Buffer.byteLength(content, 'utf8')
    if (size < this.MIN_SIZE_TO_COMPRESS) return 1

    // Rough estimate: typical document compression ~60-70%
    // More repeated content = better ratio
    const uniqueChars = new Set(content).size
    const contentComplexity = uniqueChars / 256 // 0-1
    
    if (contentComplexity < 0.1) return 0.3 // Very low entropy = great compression
    if (contentComplexity < 0.3) return 0.5 // Low entropy = good compression
    if (contentComplexity < 0.6) return 0.65 // Medium entropy = ok compression
    return 0.8 // High entropy = poor compression
  }

  /**
   * Should compress this content
   */
  static shouldCompress(content: string): boolean {
    return Buffer.byteLength(content, 'utf8') >= this.MIN_SIZE_TO_COMPRESS
  }
}
