import { expect } from 'chai';
import { Config } from '../../src/config.js';

describe('Config', () => {
  describe('constructor', () => {
    it('should initialize with default values', () => {
      const config = new Config('/test/dir');

      expect(config.cwd).to.equal('/test/dir');
      expect(config.walker.include).to.deep.equal(['**/*']);
      expect(config.walker.exclude).to.deep.equal([]);
      expect(config.walker.dot).to.equal(false);
      expect(config.walker.concurrency).to.equal(10);
      expect(config.hash.algorithm).to.equal('sha256');
      expect(config.hash.length).to.equal(8);
      expect(config.hash.format).to.equal('{name}-{hash}.{ext}');
    });

    it('should merge user options with defaults', () => {
      const config = new Config('/test/dir', {
        walker: {
          exclude: ['node_modules/**'],
          dot: true,
        },
        hash: {
          algorithm: 'sha384',
          length: 16,
        }
      });

      expect(config.walker.exclude).to.deep.equal(['node_modules/**']);
      expect(config.walker.dot).to.equal(true);
      expect(config.hash.algorithm).to.equal('sha384');
      expect(config.hash.length).to.equal(16);
      // Should keep defaults for unspecified options
      expect(config.walker.include).to.deep.equal(['**/*']);
      expect(config.hash.format).to.equal('{name}-{hash}.{ext}');
    });
  });

  describe('getGlobOptions', () => {
    it('should return options for glob library', () => {
      const config = new Config('/test/dir', {
        walker: {
          dot: true,
          followSymlinks: true,
          exclude: ['*.tmp']
        }
      });

      const options = config.getGlobOptions();
      expect(options).to.deep.include({
        cwd: '/test/dir',
        dot: true,
        followSymbolicLinks: true,
        nodir: true,
        withFileTypes: false,
      });
      expect(options.ignore).to.deep.equal(['*.tmp']);
    });
  });

  describe('rules', () => {
    it('should normalize and compile rules', () => {
      const config = new Config('/test/dir', {
        rules: [
          {
            match: '**/*.json',
            hash: { algorithm: 'sha1' },
            rename: false
          },
          {
            match: ['vendor/**/*.js', 'vendor/**/*.css'],
            rewrite: false
          }
        ]
      });

      expect(config.rules).to.have.lengthOf(2);
      expect(config.rules[0].match).to.deep.equal(['**/*.json']);
      expect(config.rules[0].hash.algorithm).to.equal('sha1');
      expect(config.rules[0].rename).to.equal(false);

      expect(config.rules[1].match).to.deep.equal(['vendor/**/*.js', 'vendor/**/*.css']);
      expect(config.rules[1].rewrite).to.equal(false);
    });

    it('should throw error if rule missing match pattern', () => {
      expect(() => {
        new Config('/test/dir', {
          rules: [{ rename: false }]
        });
      }).to.throw('Each rule must have a "match" pattern');
    });
  });

  describe('getOptionsForFile', () => {
    it('should return base options when no rules match', () => {
      const config = new Config('/test/dir', {
        hash: { algorithm: 'sha256', length: 8 },
        url: { prefix: '/assets' }
      });

      const file = { relative: 'app.js', extname: '.js' };
      const options = config.getOptionsForFile(file);

      expect(options.hash.algorithm).to.equal('sha256');
      expect(options.hash.length).to.equal(8);
      expect(options.url.prefix).to.equal('/assets');
      expect(options.rename).to.equal(true);
      expect(options.rewrite).to.equal(true);
    });

    it('should apply matching rules to override base options', () => {
      const config = new Config('/test/dir', {
        hash: { algorithm: 'sha256' },
        rules: [
          {
            match: '**/*.json',
            hash: { algorithm: 'sha1', length: 16 },
            url: { prefix: '/data' }
          },
          {
            match: 'vendor/**',
            rename: false,
            rewrite: false
          }
        ]
      });

      // Test JSON file
      const jsonFile = { relative: 'config.json', extname: '.json' };
      const jsonOptions = config.getOptionsForFile(jsonFile);
      expect(jsonOptions.hash.algorithm).to.equal('sha1');
      expect(jsonOptions.hash.length).to.equal(16);
      expect(jsonOptions.url.prefix).to.equal('/data');

      // Test vendor file
      const vendorFile = { relative: 'vendor/lib.js', extname: '.js' };
      const vendorOptions = config.getOptionsForFile(vendorFile);
      expect(vendorOptions.rename).to.equal(false);
      expect(vendorOptions.rewrite).to.equal(false);
    });

    it('should apply multiple matching rules in order', () => {
      const config = new Config('/test/dir', {
        rules: [
          {
            match: '**/*.js',
            url: { prefix: '/js' }
          },
          {
            match: 'vendor/**',
            url: { prefix: '/vendor' },
            rename: false
          }
        ]
      });

      // File matches both rules - second should override
      const file = { relative: 'vendor/app.js', extname: '.js' };
      const options = config.getOptionsForFile(file);
      expect(options.url.prefix).to.equal('/vendor');
      expect(options.rename).to.equal(false);
    });
  });

  describe('reference detection', () => {
    it('should have smart defaults for common file types', () => {
      const config = new Config('/test/dir');

      const jsPatterns = config.getPatternsForFile({ extname: '.js' });
      expect(jsPatterns.length).to.be.greaterThan(0);
      expect(jsPatterns.some(p => p.type === 'import')).to.equal(true);
      expect(jsPatterns.some(p => p.type === 'require')).to.equal(true);

      const cssPatterns = config.getPatternsForFile({ extname: '.css' });
      expect(cssPatterns.some(p => p.type === 'url')).to.equal(true);

      const htmlPatterns = config.getPatternsForFile({ extname: '.html' });
      expect(htmlPatterns.some(p => p.type === 'src')).to.equal(true);
      expect(htmlPatterns.some(p => p.type === 'href')).to.equal(true);
    });

    it('should support custom reference patterns', () => {
      const config = new Config('/test/dir', {
        references: {
          custom: [
            {
              pattern: /data-image=["']([^"']+)["']/g,
              extensions: ['.html', '.jsx']
            }
          ]
        }
      });

      const htmlPatterns = config.getPatternsForFile({ extname: '.html' });
      expect(htmlPatterns.some(p => p.type === 'custom')).to.equal(true);
    });

    it('should override default detection patterns', () => {
      const config = new Config('/test/dir', {
        references: {
          detect: {
            '.js': ['import'], // Only import, no require
          }
        }
      });

      const jsPatterns = config.getPatternsForFile({ extname: '.js' });
      expect(jsPatterns.some(p => p.type === 'import')).to.equal(true);
      expect(jsPatterns.some(p => p.type === 'require')).to.equal(false);
    });
  });

  describe('manifest options', () => {
    it('should normalize manifest options with defaults', () => {
      const config = new Config('/test/dir');

      expect(config.manifest.path).to.equal('assets.json');
      expect(config.manifest.format).to.equal('simple');
      expect(config.manifest.stream).to.equal(true);
      expect(config.manifest.absolutePaths).to.equal(false);
    });

    it('should support rails4 format', () => {
      const config = new Config('/test/dir', {
        manifest: {
          format: 'rails4',
          path: 'public/assets/.sprockets-manifest.json'
        }
      });

      expect(config.manifest.format).to.equal('rails4');
      expect(config.manifest.path).to.equal('public/assets/.sprockets-manifest.json');
    });
  });
});
