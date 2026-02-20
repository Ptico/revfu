import { expect } from 'chai';
import Vinyl from 'vinyl';
import { Manifest, MAPPERS, createManifest } from '../../src/manifest.js';

/**
 * Helper to create a mock revisioned file
 */
function createRevFile(originalPath, hashedPath, hash = 'abc123', url = null) {
  const file = new Vinyl({
    base: '/test',
    path: `/test/${hashedPath}`,
    contents: Buffer.from('test content'),
  });

  file.originalPath = originalPath;
  file.originalName = originalPath.split('/').pop();
  file.hash = hash;
  file.url = url || hashedPath;

  return file;
}

describe('Manifest', () => {
  describe('constructor', () => {
    it('should initialize with defaults', () => {
      const manifest = new Manifest();

      expect(manifest.path).to.equal('assets.json');
      expect(manifest.absolutePaths).to.equal(false);
      expect(manifest.entries).to.be.an('array').that.is.empty;
      expect(manifest.length).to.equal(0);
    });

    it('should accept custom path', () => {
      const manifest = new Manifest({ path: 'custom-manifest.json' });

      expect(manifest.path).to.equal('custom-manifest.json');
    });

    it('should accept absolutePaths option', () => {
      const manifest = new Manifest({ absolutePaths: true });

      expect(manifest.absolutePaths).to.equal(true);
    });

    it('should throw error for invalid format', () => {
      expect(() => {
        new Manifest({ format: 'invalid-format' });
      }).to.throw('Unknown manifest format: invalid-format');
    });

    it('should accept custom mapper function', () => {
      const customMapper = (entries) => ({ custom: true, count: entries.length });
      const manifest = new Manifest({ format: customMapper });

      expect(manifest.mapper).to.equal(customMapper);
    });

    it('should throw error for dumper without stringify', () => {
      expect(() => {
        new Manifest({ dumper: {} });
      }).to.throw('Manifest dumper must have a stringify method');
    });
  });

  describe('add()', () => {
    it('should add file to manifest', () => {
      const manifest = new Manifest();
      const file = createRevFile('app.js', 'app-abc123.js', 'abc123');

      manifest.add(file);

      expect(manifest.length).to.equal(1);
      expect(manifest.entries[0]).to.have.property('original');
      expect(manifest.entries[0]).to.have.property('reved');
      expect(manifest.entries[0]).to.have.property('digest');
    });

    it('should store original and reved paths', () => {
      const manifest = new Manifest();
      const file = createRevFile('css/style.css', 'css/style-def456.css', 'def456');

      manifest.add(file);

      const entry = manifest.entries[0];
      expect(entry.original.path).to.equal('css/style.css');
      expect(entry.reved.path).to.equal('css/style-def456.css');
    });

    it('should store file metadata', () => {
      const manifest = new Manifest();
      const file = createRevFile('app.js', 'app-abc123.js', 'abc123def456');

      manifest.add(file);

      const entry = manifest.entries[0];
      expect(entry.digest).to.equal('abc123def456');
      expect(entry.size).to.be.a('number');
      expect(entry.mtime).to.be.a('string');
    });

    it('should store URL', () => {
      const manifest = new Manifest();
      const file = createRevFile('app.js', 'app-abc123.js', 'abc123', 'https://cdn.com/app-abc123.js');

      manifest.add(file);

      const entry = manifest.entries[0];
      expect(entry.reved.url).to.equal('https://cdn.com/app-abc123.js');
    });

    it('should add multiple files', () => {
      const manifest = new Manifest();

      manifest.add(createRevFile('app.js', 'app-abc.js'));
      manifest.add(createRevFile('style.css', 'style-def.css'));
      manifest.add(createRevFile('logo.png', 'logo-ghi.png'));

      expect(manifest.length).to.equal(3);
    });
  });

  describe('simple format', () => {
    it('should generate simple key-value manifest', () => {
      const manifest = new Manifest({ format: 'simple' });

      manifest.add(createRevFile('app.js', 'app-abc123.js'));
      manifest.add(createRevFile('style.css', 'style-def456.css'));

      const object = manifest.toObject();

      expect(object).to.deep.equal({
        'app.js': 'app-abc123.js',
        'style.css': 'style-def456.css'
      });
    });

    it('should be the default format', () => {
      const manifest = new Manifest();

      manifest.add(createRevFile('app.js', 'app-abc.js'));

      const object = manifest.toObject();

      expect(object).to.have.property('app.js');
    });
  });

  describe('full format', () => {
    it('should generate full manifest with metadata', () => {
      const manifest = new Manifest({ format: 'full' });

      manifest.add(createRevFile('app.js', 'app-abc123.js', 'abc123def456'));

      const object = manifest.toObject();

      expect(object).to.be.an('array');
      expect(object[0]).to.have.property('original');
      expect(object[0]).to.have.property('reved');
      expect(object[0]).to.have.property('digest');
      expect(object[0]).to.have.property('size');
      expect(object[0]).to.have.property('mtime');
    });

    it('should include all file details', () => {
      const manifest = new Manifest({ format: 'full' });

      manifest.add(createRevFile('app.js', 'app-abc123.js', 'abc123'));

      const object = manifest.toObject();
      const entry = object[0];

      expect(entry.original.path).to.equal('app.js');
      expect(entry.original.name).to.equal('app.js');
      expect(entry.reved.path).to.equal('app-abc123.js');
      expect(entry.reved.name).to.equal('app-abc123.js');
      expect(entry.digest).to.equal('abc123');
    });
  });

  describe('rails4 format', () => {
    it('should generate Rails 4 Sprockets format', () => {
      const manifest = new Manifest({ format: 'rails4' });

      manifest.add(createRevFile('app.js', 'app-abc123.js', 'abc123'));
      manifest.add(createRevFile('style.css', 'style-def456.css', 'def456'));

      const object = manifest.toObject();

      expect(object).to.have.property('files');
      expect(object).to.have.property('assets');
    });

    it('should have correct files section structure', () => {
      const manifest = new Manifest({ format: 'rails4' });

      manifest.add(createRevFile('app.js', 'app-abc123.js', 'abc123'));

      const object = manifest.toObject();

      expect(object.files['app-abc123.js']).to.deep.include({
        logical_path: 'app.js',
        digest: 'abc123'
      });
      expect(object.files['app-abc123.js']).to.have.property('size');
      expect(object.files['app-abc123.js']).to.have.property('mtime');
    });

    it('should have correct assets section structure', () => {
      const manifest = new Manifest({ format: 'rails4' });

      manifest.add(createRevFile('app.js', 'app-abc123.js'));
      manifest.add(createRevFile('style.css', 'style-def456.css'));

      const object = manifest.toObject();

      expect(object.assets).to.deep.equal({
        'app.js': 'app-abc123.js',
        'style.css': 'style-def456.css'
      });
    });
  });

  describe('custom format', () => {
    it('should accept custom mapper function', () => {
      const customMapper = (entries) => {
        return {
          version: '1.0',
          files: entries.map(e => e.original.path)
        };
      };

      const manifest = new Manifest({ format: customMapper });

      manifest.add(createRevFile('app.js', 'app-abc.js'));
      manifest.add(createRevFile('style.css', 'style-def.css'));

      const object = manifest.toObject();

      expect(object).to.deep.equal({
        version: '1.0',
        files: ['app.js', 'style.css']
      });
    });

    it('should support custom dumper', () => {
      const customDumper = {
        stringify: (obj) => `CUSTOM:${JSON.stringify(obj)}`
      };

      const manifest = new Manifest({ dumper: customDumper });

      manifest.add(createRevFile('app.js', 'app-abc.js'));

      const json = manifest.toJSON();

      expect(json).to.match(/^CUSTOM:/);
    });
  });

  describe('compile()', () => {
    it('should return Vinyl file', () => {
      const manifest = new Manifest();

      manifest.add(createRevFile('app.js', 'app-abc.js'));

      const vinyl = manifest.compile();

      expect(vinyl).to.be.instanceOf(Vinyl);
      expect(vinyl.path).to.equal('assets.json');
      expect(vinyl.contents).to.be.instanceOf(Buffer);
    });

    it('should contain valid JSON', () => {
      const manifest = new Manifest();

      manifest.add(createRevFile('app.js', 'app-abc.js'));

      const vinyl = manifest.compile();
      const json = JSON.parse(vinyl.contents.toString());

      expect(json).to.be.an('object');
      expect(json).to.have.property('app.js');
    });

    it('should use custom path', () => {
      const manifest = new Manifest({ path: 'my-manifest.json' });

      manifest.add(createRevFile('app.js', 'app-abc.js'));

      const vinyl = manifest.compile();

      expect(vinyl.path).to.equal('my-manifest.json');
    });

    it('should pretty print JSON', () => {
      const manifest = new Manifest();

      manifest.add(createRevFile('app.js', 'app-abc.js'));

      const vinyl = manifest.compile();
      const content = vinyl.contents.toString();

      // Should have indentation (pretty printed)
      expect(content).to.include('\n');
      expect(content).to.match(/\s{2}/); // 2 space indentation
    });
  });

  describe('toObject()', () => {
    it('should return plain object', () => {
      const manifest = new Manifest();

      manifest.add(createRevFile('app.js', 'app-abc.js'));

      const object = manifest.toObject();

      expect(object).to.be.an('object');
      expect(object).to.not.be.instanceOf(Vinyl);
    });
  });

  describe('toJSON()', () => {
    it('should return JSON string', () => {
      const manifest = new Manifest();

      manifest.add(createRevFile('app.js', 'app-abc.js'));

      const json = manifest.toJSON();

      expect(json).to.be.a('string');
      expect(() => JSON.parse(json)).to.not.throw();
    });
  });

  describe('MAPPERS export', () => {
    it('should export mapper functions', () => {
      expect(MAPPERS).to.have.property('simple');
      expect(MAPPERS).to.have.property('full');
      expect(MAPPERS).to.have.property('rails4');

      expect(MAPPERS.simple).to.be.a('function');
      expect(MAPPERS.full).to.be.a('function');
      expect(MAPPERS.rails4).to.be.a('function');
    });
  });

  describe('factory function', () => {
    it('should provide createManifest factory', () => {
      const manifest = createManifest({ format: 'simple' });

      expect(manifest).to.be.instanceOf(Manifest);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle nested paths', () => {
      const manifest = new Manifest();

      manifest.add(createRevFile('css/components/button.css', 'css/components/button-abc.css'));
      manifest.add(createRevFile('js/pages/home.js', 'js/pages/home-def.js'));

      const object = manifest.toObject();

      expect(object['css/components/button.css']).to.equal('css/components/button-abc.css');
      expect(object['js/pages/home.js']).to.equal('js/pages/home-def.js');
    });

    it('should handle CDN URLs', () => {
      const manifest = new Manifest({ format: 'full' });

      const file = createRevFile(
        'app.js',
        'app-abc123.js',
        'abc123',
        'https://cdn.example.com/app-abc123.js'
      );

      manifest.add(file);

      const object = manifest.toObject();

      expect(object[0].reved.url).to.equal('https://cdn.example.com/app-abc123.js');
    });

    it('should handle mixed asset types', () => {
      const manifest = new Manifest();

      manifest.add(createRevFile('app.js', 'app-abc.js'));
      manifest.add(createRevFile('style.css', 'style-def.css'));
      manifest.add(createRevFile('logo.png', 'logo-ghi.png'));
      manifest.add(createRevFile('font.woff2', 'font-jkl.woff2'));

      const object = manifest.toObject();

      expect(Object.keys(object)).to.have.lengthOf(4);
    });
  });
});
