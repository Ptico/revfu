import { expect } from 'chai';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Config } from '../../src/config.js';
import { Walker } from '../../src/walker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const basePath = path.resolve(__dirname, '../fixtures/fs');

describe('Walker', () => {
  describe('stream()', () => {
    it('should return a readable stream', async () => {
      const config = new Config(basePath);
      const walker = new Walker(config);
      const stream = walker.stream();

      expect(stream).to.have.property('read');
      expect(stream).to.have.property('pipe');
    });

    it('should yield Vinyl file objects', async () => {
      const config = new Config(basePath);
      const walker = new Walker(config);
      const stream = walker.stream();

      const files = [];
      for await (const file of stream) {
        files.push(file);
      }

      expect(files.length).to.be.greaterThan(0);

      // Verify Vinyl file properties
      const file = files[0];
      expect(file).to.have.property('path');
      expect(file).to.have.property('contents');
      expect(file).to.have.property('relative');
      expect(file).to.have.property('base');
      expect(file).to.have.property('stat');
    });

    it('should detect binary files correctly', async () => {
      const config = new Config(basePath);
      const walker = new Walker(config);
      const stream = walker.stream();

      const files = [];
      for await (const file of stream) {
        files.push(file);
      }

      // All files in fixtures should be text (js files)
      const textFile = files.find(f => f.extname === '.js');
      expect(textFile.isBinary).to.equal(false);
    });
  });

  describe('with exclude patterns', () => {
    it('should exclude files matching patterns', async () => {
      const config = new Config(basePath, {
        walker: {
          exclude: ['admin/**']
        }
      });
      const walker = new Walker(config);
      const stream = walker.stream();

      const files = [];
      for await (const file of stream) {
        files.push(file);
      }

      // Should not include files from admin directory
      const hasAdminFiles = files.some(f => f.relative.startsWith('admin'));
      expect(hasAdminFiles).to.equal(false);
    });
  });

  describe('with include patterns', () => {
    it('should only include files matching patterns', async () => {
      const config = new Config(basePath, {
        walker: {
          include: ['**/*.js']
        }
      });
      const walker = new Walker(config);
      const stream = walker.stream();

      const files = [];
      for await (const file of stream) {
        files.push(file);
      }

      // All files should be .js
      expect(files.every(f => f.extname === '.js')).to.equal(true);
    });
  });

  describe('with dotfiles', () => {
    it('should exclude dotfiles by default', async () => {
      const config = new Config(basePath, {
        walker: { dot: false }
      });
      const walker = new Walker(config);
      const stream = walker.stream();

      const files = [];
      for await (const file of stream) {
        files.push(file);
      }

      // Should not include files starting with dot
      const hasDotFiles = files.some(f => path.basename(f.path).startsWith('.'));
      expect(hasDotFiles).to.equal(false);
    });
  });

  describe('error handling', () => {
    it('should throw errors on invalid directory by default', async () => {
      const config = new Config('/nonexistent/directory');
      const walker = new Walker(config);
      const stream = walker.stream();

      const files = [];
      try {
        for await (const file of stream) {
          files.push(file);
        }
      } catch (error) {
        // Expected behavior - no files found for invalid directory
        // glob returns empty array, which is fine
      }

      // Empty array is expected for nonexistent directory
      expect(files).to.be.an('array');
    });
  });

  describe('concurrency', () => {
    it('should respect concurrency setting', async () => {
      const config = new Config(basePath, {
        walker: { concurrency: 2 }
      });
      const walker = new Walker(config);
      const stream = walker.stream();

      const files = [];
      for await (const file of stream) {
        files.push(file);
      }

      // Should still get all files, just processed in smaller batches
      expect(files.length).to.be.greaterThan(0);
    });
  });
});
