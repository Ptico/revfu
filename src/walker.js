import { glob } from 'glob';
import { promises as fs } from 'fs';
import path from 'path';
import Vinyl from 'vinyl';
import { isBinaryFile } from 'isbinaryfile';
import { Readable } from 'stream';

/**
 * Modern async Walker using glob v13
 * Discovers files and yields Vinyl file objects in a stream
 */
export class Walker {
  /**
   * @param {Config} config - Configuration object
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * Create a readable stream of Vinyl files
   * Uses glob with streaming and parallel file reads
   *
   * @returns {Readable} Stream of Vinyl file objects
   */
  stream() {
    const config = this.config;
    const patterns = config.walker.include;
    const globOptions = config.getGlobOptions();

    // Create a readable stream in object mode
    return Readable.from(this._walk(patterns, globOptions), { objectMode: true });
  }

  /**
   * Async generator that yields Vinyl files
   * @private
   */
  async *_walk(patterns, globOptions) {
    // Use glob's async iterator for efficient streaming
    const files = await glob(patterns, globOptions);

    // Process files with concurrency control
    const concurrency = this.config.walker.concurrency;
    const ignoreErrors = this.config.walker.ignoreErrors;

    // Process files in batches for better performance
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      const promises = batch.map(file =>
        this._processFile(file, globOptions.cwd, ignoreErrors)
      );

      // Wait for batch to complete
      const results = await Promise.allSettled(promises);

      // Yield successful results
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          yield result.value;
        } else if (result.status === 'rejected' && !ignoreErrors) {
          throw result.reason;
        }
      }
    }
  }

  /**
   * Process a single file - read contents and create Vinyl object
   * @private
   */
  async _processFile(relativePath, cwd, ignoreErrors) {
    try {
      const absolutePath = path.resolve(cwd, relativePath);

      // Read file stats and contents in parallel
      const [stat, contents] = await Promise.all([
        fs.stat(absolutePath),
        fs.readFile(absolutePath)
      ]);

      // Create Vinyl file object
      const file = new Vinyl({
        base: cwd,
        path: absolutePath,
        contents: contents,
        stat: stat,
      });

      // Detect if file is binary
      file.isBinary = await this._detectBinary(file);

      return file;
    } catch (error) {
      if (ignoreErrors) {
        return null;
      }
      throw new Error(`Failed to process file ${relativePath}: ${error.message}`);
    }
  }

  /**
   * Detect if file is binary
   * Uses smart detection to avoid unnecessary checks
   * @private
   */
  async _detectBinary(file) {
    // Common binary extensions - skip expensive detection
    const binaryExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico',
      '.woff', '.woff2', '.ttf', '.eot', '.otf',
      '.mp3', '.mp4', '.webm', '.ogg', '.wav', '.flac',
      '.zip', '.tar', '.gz', '.7z', '.rar',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx',
      '.exe', '.dll', '.so', '.dylib',
    ];

    if (binaryExtensions.includes(file.extname.toLowerCase())) {
      return true;
    }

    // For other files, use isBinaryFile detection
    try {
      return await isBinaryFile(file.contents);
    } catch (error) {
      // If detection fails, assume it's text
      return false;
    }
  }
}

/**
 * Factory function to create a walker stream
 *
 * @param {Config} config - Configuration object
 * @returns {Readable} Stream of Vinyl files
 */
export function createWalker(config) {
  const walker = new Walker(config);
  return walker.stream();
}

export default Walker;
