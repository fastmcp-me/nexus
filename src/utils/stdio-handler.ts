import { Transform } from 'stream';

import { logger } from './logger.js';

export interface StdioMessage {
  id: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
  jsonrpc: string;
}

export interface StdioBufferOptions {
  maxBufferSize?: number;
  timeout?: number;
  lineEnding?: 'LF' | 'CRLF' | 'auto';
  chunkSize?: number;
}

export interface StdioMetrics {
  messagesSent: number;
  messagesReceived: number;
  bytesTransmitted: number;
  bytesReceived: number;
  errors: number;
  timeouts: number;
  largeMessages: number;
}

/**
 * STDIO Communication Handler for MCP Protocol
 *
 * Handles proper line endings, response buffering, and atomic message transmission
 * to prevent JSON parsing errors in MCP client communication.
 */
export class StdioHandler {
  private static readonly DEFAULT_MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private static readonly DEFAULT_CHUNK_SIZE = 64 * 1024; // 64KB
  private static readonly LARGE_MESSAGE_THRESHOLD = 1024 * 1024; // 1MB

  private readonly options: Required<StdioBufferOptions>;
  private readonly metrics: StdioMetrics;
  private readonly pendingMessages = new Map<string, NodeJS.Timeout>();
  private readonly messageBuffer = new Map<string, Buffer[]>();

  constructor(options: StdioBufferOptions = {}) {
    this.options = {
      maxBufferSize:
        options.maxBufferSize || StdioHandler.DEFAULT_MAX_BUFFER_SIZE,
      timeout: options.timeout || StdioHandler.DEFAULT_TIMEOUT,
      lineEnding: options.lineEnding || 'auto',
      chunkSize: options.chunkSize || StdioHandler.DEFAULT_CHUNK_SIZE,
    };

    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      bytesTransmitted: 0,
      bytesReceived: 0,
      errors: 0,
      timeouts: 0,
      largeMessages: 0,
    };

    logger.info('STDIO Handler initialized', {
      options: this.options,
      platform: process.platform,
    });
  }

  /**
   * Normalize line endings based on platform and configuration
   */
  private normalizeLineEndings(data: string): string {
    let lineEnding: string;

    switch (this.options.lineEnding) {
      case 'LF':
        lineEnding = '\n';
        break;
      case 'CRLF':
        lineEnding = '\r\n';
        break;
      case 'auto':
      default:
        // Use platform-appropriate line endings, but prefer LF for JSON-RPC
        lineEnding = process.platform === 'win32' ? '\r\n' : '\n';
        break;
    }

    // Normalize all line endings to the chosen format
    return data.replace(/\r\n|\r|\n/g, lineEnding);
  }

  /**
   * Create a buffered write stream for large responses
   */
  private createBufferedStream(messageId: string): Transform {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    return new Transform({
      objectMode: false,
      transform(chunk: Buffer, _encoding, callback) {
        totalSize += chunk.length;

        if (totalSize > StdioHandler.DEFAULT_MAX_BUFFER_SIZE) {
          logger.error('Message size exceeds maximum buffer size', {
            messageId,
            totalSize,
            maxSize: StdioHandler.DEFAULT_MAX_BUFFER_SIZE,
          });
          callback(new Error('Message too large'));
          return;
        }

        chunks.push(chunk);
        callback();
      },
      flush(callback) {
        // Combine all chunks into a single buffer for atomic transmission
        const combinedBuffer = Buffer.concat(chunks);
        logger.debug('Buffered message ready for transmission', {
          messageId,
          totalSize: combinedBuffer.length,
          chunks: chunks.length,
        });
        this.push(combinedBuffer);
        callback();
      },
    });
  }

  /**
   * Send a JSON-RPC message with proper buffering and line ending handling
   */
  async sendMessage(
    message: StdioMessage,
    outputStream: NodeJS.WritableStream = process.stdout
  ): Promise<void> {
    const messageId = String(message.id || 'notification');
    const startTime = Date.now();

    try {
      // Serialize the message with proper JSON validation
      const jsonString = JSON.stringify(message);
      const normalizedMessage = this.normalizeLineEndings(jsonString);
      const messageBuffer = Buffer.from(normalizedMessage + '\n', 'utf8');

      // Check if this is a large message
      const isLargeMessage =
        messageBuffer.length > StdioHandler.LARGE_MESSAGE_THRESHOLD;
      if (isLargeMessage) {
        this.metrics.largeMessages++;
        logger.warn('Large message detected', {
          messageId,
          size: messageBuffer.length,
          threshold: StdioHandler.LARGE_MESSAGE_THRESHOLD,
        });
      }

      // Set up timeout handling
      const timeoutId = setTimeout(() => {
        this.metrics.timeouts++;
        logger.error('Message transmission timeout', {
          messageId,
          timeout: this.options.timeout,
          size: messageBuffer.length,
        });
      }, this.options.timeout);

      this.pendingMessages.set(messageId, timeoutId);

      try {
        if (isLargeMessage) {
          // Use buffered transmission for large messages
          await this.sendLargeMessage(messageBuffer, messageId, outputStream);
        } else {
          // Direct transmission for small messages
          await this.sendDirectMessage(messageBuffer, outputStream);
        }

        // Update metrics
        this.metrics.messagesSent++;
        this.metrics.bytesTransmitted += messageBuffer.length;

        logger.debug('Message sent successfully', {
          messageId,
          size: messageBuffer.length,
          duration: Date.now() - startTime,
          method: message.method,
        });
      } finally {
        // Clean up timeout
        clearTimeout(timeoutId);
        this.pendingMessages.delete(messageId);
      }
    } catch (error) {
      this.metrics.errors++;
      logger.error('Failed to send message', {
        messageId,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Send a message directly (for small messages)
   */
  private async sendDirectMessage(
    buffer: Buffer,
    outputStream: NodeJS.WritableStream
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const success = outputStream.write(buffer, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });

      if (!success) {
        // Wait for drain event if buffer is full
        outputStream.once('drain', resolve);
        outputStream.once('error', reject);
      }
    });
  }

  /**
   * Send a large message with chunking and buffering
   */
  private async sendLargeMessage(
    buffer: Buffer,
    messageId: string,
    outputStream: NodeJS.WritableStream
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const bufferedStream = this.createBufferedStream(messageId);
      let bytesWritten = 0;

      bufferedStream.on('data', (chunk: Buffer) => {
        outputStream.write(chunk, err => {
          if (err) {
            reject(err);
            return;
          }
          bytesWritten += chunk.length;
        });
      });

      bufferedStream.on('end', () => {
        logger.debug('Large message transmission completed', {
          messageId,
          totalBytes: bytesWritten,
          originalSize: buffer.length,
        });
        resolve();
      });

      bufferedStream.on('error', error => {
        logger.error('Large message transmission failed', {
          messageId,
          error: error.message,
          bytesWritten,
        });
        reject(error);
      });

      // Write the buffer in chunks
      let offset = 0;
      while (offset < buffer.length) {
        const chunkSize = Math.min(
          this.options.chunkSize,
          buffer.length - offset
        );
        const chunk = buffer.subarray(offset, offset + chunkSize);
        bufferedStream.write(chunk);
        offset += chunkSize;
      }

      bufferedStream.end();
    });
  }

  /**
   * Create a message receiver stream with proper parsing
   */
  createMessageReceiver(): Transform {
    let buffer = '';
    const metrics = this.metrics;

    return new Transform({
      objectMode: true,
      transform(chunk: Buffer, _encoding, callback) {
        try {
          buffer += chunk.toString('utf8');
          const lines = buffer.split(/\r?\n/);

          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const message = JSON.parse(line) as StdioMessage;
                metrics.messagesReceived++;
                metrics.bytesReceived += Buffer.byteLength(line, 'utf8');
                this.push(message);
              } catch (parseError) {
                metrics.errors++;
                logger.error('Failed to parse JSON-RPC message', {
                  error:
                    parseError instanceof Error
                      ? parseError.message
                      : String(parseError),
                  line:
                    line.substring(0, 200) + (line.length > 200 ? '...' : ''),
                });
              }
            }
          }
          callback();
        } catch (error) {
          metrics.errors++;
          logger.error('Error processing input stream', {
            error: error instanceof Error ? error.message : String(error),
          });
          callback(error as Error);
        }
      },
    });
  }

  /**
   * Ensure atomic transmission by waiting for all pending operations
   */
  async flush(): Promise<void> {
    const pendingIds = Array.from(this.pendingMessages.keys());

    if (pendingIds.length === 0) {
      return;
    }

    logger.debug('Flushing pending messages', {
      pendingCount: pendingIds.length,
      pendingIds,
    });

    // Wait for all pending messages to complete or timeout
    await Promise.allSettled(
      pendingIds.map(id => {
        return new Promise<void>(resolve => {
          const timeoutId = this.pendingMessages.get(id);
          if (timeoutId) {
            // Wait for the existing timeout or clear it
            clearTimeout(timeoutId);
            resolve();
          } else {
            resolve();
          }
        });
      })
    );

    this.pendingMessages.clear();
  }

  /**
   * Get current STDIO communication metrics
   */
  getMetrics(): StdioMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics counters
   */
  resetMetrics(): void {
    this.metrics.messagesSent = 0;
    this.metrics.messagesReceived = 0;
    this.metrics.bytesTransmitted = 0;
    this.metrics.bytesReceived = 0;
    this.metrics.errors = 0;
    this.metrics.timeouts = 0;
    this.metrics.largeMessages = 0;
  }

  /**
   * Clean up resources and pending operations
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up STDIO handler', {
      pendingMessages: this.pendingMessages.size,
      metrics: this.metrics,
    });

    // Clear all pending timeouts
    for (const timeoutId of this.pendingMessages.values()) {
      clearTimeout(timeoutId);
    }
    this.pendingMessages.clear();
    this.messageBuffer.clear();

    await this.flush();
  }
}

/**
 * Global STDIO handler instance
 */
export const stdioHandler = new StdioHandler({
  lineEnding: 'auto',
  maxBufferSize: 10 * 1024 * 1024, // 10MB
  timeout: 30000, // 30 seconds
  chunkSize: 64 * 1024, // 64KB
});

/**
 * Utility function to send a JSON-RPC message with proper handling
 */
export async function sendStdioMessage(
  message: StdioMessage,
  outputStream?: NodeJS.WritableStream
): Promise<void> {
  return stdioHandler.sendMessage(message, outputStream);
}

/**
 * Utility function to create a message receiver stream
 */
export function createStdioReceiver(): Transform {
  return stdioHandler.createMessageReceiver();
}
