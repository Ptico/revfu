import { expect } from 'chai';
import Vinyl from 'vinyl';
import path from 'path';
import { Revisioner } from '../../src/revisioner.js';
import { Config } from '../../src/config.js';

const cwd = '/var/www/afterpack';

/**
 * Create a test file with specified properties
 */
function createFile(name, content, deps = [], isBinary = false) {
  const file = new Vinyl({
    cwd: cwd,
    base: cwd,
    path: path.join(cwd, name),
    contents: Buffer.from(content),
  });

  file.textContent = isBinary ? null : content;
  file.deps = deps;

  // Set file options matching the config
  file.fileOptions = {
    rename: true,
    rewrite: true,
    hash: {
      format: '{name}-{hash}.{ext}',
      algorithm: 'sha256',
      length: 8,
    },
    url: {
      prefix: '',
      base: null,
      transform: null,
    },
  };

  return file;
}

/**
 * Create the test fixture files with complex dependency tree
 *
 * Dependency tree (3+ levels deep):
 *
 * Level 0 (leaf nodes):
 *   - images/icon.svg
 *   - images/arrow.png
 *   - images/button.jpg
 *   - images/logo.png
 *
 * Level 1:
 *   - js/lib/utils.js (no deps)
 *   - js/lib/helpers.js (no deps)
 *   - css/variables.css (depends on logo.png)
 *
 * Level 2:
 *   - js/model.js (depends on utils.js - extensionless)
 *   - css/components.css (depends on icon.svg, arrow.png)
 *   - css/main.css (depends on variables.css, components.css, icon.svg, arrow.png)
 *
 * Level 3:
 *   - app.js (depends on model.js, helpers - extensionless, various path styles)
 *   - css/other.css (depends on button.jpg - absolute path)
 *
 * Level 4:
 *   - index.js (depends on app.js, main.css - mixed path styles)
 */
function createFiles() {
  // Level 0: Images (leaf nodes)
  const imgIcon = createFile('images/icon.svg', '<svg id="icon"></svg>');
  const imgArrow = createFile('images/arrow.png', 'PNG_DATA', [], true);
  const imgButton = createFile('images/button.jpg', 'JPG_DATA', [], true);
  const imgLogo = createFile('images/logo.png', 'LOGO_PNG', [], true);

  // Level 1: Base utilities and variables
  const libUtils = createFile(
    'js/lib/utils.js',
    'export function format(str) { return str.toUpperCase(); }'
  );

  const libHelpers = createFile(
    'js/lib/helpers.js',
    'export const VERSION = "1.0.0";\nexport function log(msg) { console.log(msg); }'
  );

  const cssVariables = createFile(
    'css/variables.css',
    ':root { --primary: #333; }\n.logo { background: url(/images/logo.png); }',
    [imgLogo]
  );

  // Level 2: Models and component styles
  const jsModel = createFile(
    'js/model.js',
    // Extensionless import - references lib/utils without .js extension
    'import { format } from "./lib/utils";\nexport const Model = { format };',
    [libUtils]
  );

  const cssComponents = createFile(
    'css/components.css',
    // Relative paths from css/ directory to images/
    '.icon { background: url(../images/icon.svg); }\n.arrow::after { content: url(../images/arrow.png); }',
    [imgIcon, imgArrow]
  );

  const cssMain = createFile(
    'css/main.css',
    // Mix of relative import, base-relative url, and path with fragment
    '@import "./variables.css";\n@import url(components.css);\nbody { background: url("images/icon.svg#circle"); }\n.arrow {background: url(images/arrow.png);}',
    [cssVariables, cssComponents, imgIcon, imgArrow]
  );

  // Level 3: Application logic and additional styles
  const appJs = createFile(
    'app.js',
    // Mix of: extensionless (helpers), with extension (model.js), ./relative path
    'import model from "./js/model.js";\nimport { log } from "js/lib/helpers";\nlog("App loaded");',
    [jsModel, libHelpers]
  );

  const cssOther = createFile(
    'css/other.css',
    // Absolute path with spaces in url()
    'button { background: url( /images/button.jpg ); }',
    [imgButton]
  );

  // Level 4: Entry point
  const indexJs = createFile(
    'index.js',
    // Mix: extensionless require, absolute path to css, base-relative
    'require("app");\nconst style = "/css/main.css";\nimport "./css/other.css";',
    [appJs, cssMain, cssOther]
  );

  return [
    // Return in dependency order (leaf nodes first)
    imgIcon, imgArrow, imgButton, imgLogo,
    libUtils, libHelpers, cssVariables,
    jsModel, cssComponents, cssMain,
    appJs, cssOther,
    indexJs
  ];
}

describe('Revisioner', () => {
  describe('without options', () => {
    it('should rename paths with cascading hashes', async () => {
      const files = createFiles();
      const config = new Config(cwd, {});

      const revisioner = new Revisioner(files, config);
      const stream = revisioner.stream();

      const result = [];
      for await (const file of stream) {
        result.push(file.relative);
      }

      // Expected hashes include content from rewritten dependencies
      expect(result).to.have.members([
        'images/icon-697bbb6d.svg',
        'images/arrow-449dbdd0.png',
        'images/button-d5c6cf41.jpg',
        'images/logo-7d5b6cf3.png',
        'js/lib/utils-b3884b5a.js',
        'js/lib/helpers-f6f9f956.js',
        'css/variables-8a640f0e.css',
        'js/model-7c1bc318.js',
        'css/components-80004deb.css',
        'css/main-ad86e738.css',
        'app-33ebca30.js',
        'css/other-67d83f2f.css',
        'index-d7af25f1.js',
      ]);
    });

    it('should change the hash of a file if dependency changed', async () => {
      const files = createFiles();
      const content = 'export const CHANGED = true;';

      // Change a level-1 file (js/lib/utils.js at index 4)
      const utilsFile = files.find(f => f.relative === 'js/lib/utils.js');
      utilsFile.textContent = content;
      utilsFile.contents = Buffer.from(content);

      const config = new Config(cwd, {});
      const revisioner = new Revisioner(files, config);
      const stream = revisioner.stream();

      const result = [];
      const processed = [];
      for await (const file of stream) {
        result.push(file.relative);
        processed.push(file);
      }

      // js/lib/utils.js changed - should have different hash
      const utils = processed.find(f => f.originalPath === 'js/lib/utils.js');
      expect(utils.relative).to.not.equal('js/lib/utils-b3884b5a.js');
      expect(utils.hash).to.not.match(/^b3884b5a/);

      // js/model.js depends on utils - should have different hash
      const model = processed.find(f => f.originalPath === 'js/model.js');
      expect(model.relative).to.not.equal('js/model-7c1bc318.js');
      expect(model.hash).to.not.match(/^7c1bc318/);

      // app.js depends on model - should have different hash (3 levels deep!)
      const app = processed.find(f => f.originalPath === 'app.js');
      expect(app.relative).to.not.equal('app-33ebca30.js');
      expect(app.hash).to.not.match(/^33ebca30/);

      // index.js depends on app - should have different hash (4 levels deep!)
      const index = processed.find(f => f.originalPath === 'index.js');
      expect(index.relative).to.not.equal('index-d7af25f1.js');
      expect(index.hash).to.not.match(/^d7af25f1/);

      // Files without dependency chain should remain unchanged
      const icon = processed.find(f => f.originalPath === 'images/icon.svg');
      expect(icon.relative).to.equal('images/icon-697bbb6d.svg');

      const helpers = processed.find(f => f.originalPath === 'js/lib/helpers.js');
      expect(helpers.relative).to.equal('js/lib/helpers-f6f9f956.js');
    });

    it('should rewrite references with various path styles', async () => {
      const files = createFiles();
      const config = new Config(cwd, {});

      const revisioner = new Revisioner(files, config);
      const stream = revisioner.stream();

      const processed = [];
      for await (const file of stream) {
        processed.push(file);
      }

      // Test extensionless imports
      const model = processed.find(f => f.originalPath === 'js/model.js');
      expect(model.contents.toString()).to.include('from "./lib/utils-b3884b5a"');
      expect(model.contents.toString()).to.include('export const Model = { format }');

      // Test file-relative paths (../)
      const components = processed.find(f => f.originalPath === 'css/components.css');
      expect(components.contents.toString()).to.include('../images/icon-697bbb6d.svg');
      expect(components.contents.toString()).to.include('../images/arrow-449dbdd0.png');

      // Test base-relative paths (no prefix)
      const main = processed.find(f => f.originalPath === 'css/main.css');
      expect(main.contents.toString()).to.include('url("images/icon-697bbb6d.svg#circle")');
      expect(main.contents.toString()).to.include('url(images/arrow-449dbdd0.png)');

      // Test absolute paths (/)
      const other = processed.find(f => f.originalPath === 'css/other.css');
      expect(other.contents.toString()).to.include('url( /images/button-d5c6cf41.jpg )');

      // Test mixed: with extension, extensionless, ./relative
      const app = processed.find(f => f.originalPath === 'app.js');
      expect(app.contents.toString()).to.include('from "./js/model-7c1bc318.js"');
      expect(app.contents.toString()).to.include('from "js/lib/helpers-f6f9f956"');

      // Test mixed: extensionless require, absolute path
      const index = processed.find(f => f.originalPath === 'index.js');
      expect(index.contents.toString()).to.include('require("app-33ebca30")');
      expect(index.contents.toString()).to.include('"/css/main-ad86e738.css"');
      expect(index.contents.toString()).to.include('import "./css/other-67d83f2f.css"');
    });
  });

  describe('file properties', () => {
    it('should set hash property on all files', async () => {
      const files = createFiles();
      const config = new Config(cwd, {});

      const revisioner = new Revisioner(files, config);
      const stream = revisioner.stream();

      for await (const file of stream) {
        expect(file).to.have.property('hash');
        expect(file.hash).to.be.a('string');
        expect(file.hash).to.have.length.greaterThan(8);
      }
    });

    it('should set originalPath and originalName', async () => {
      const files = createFiles();
      const config = new Config(cwd, {});

      const revisioner = new Revisioner(files, config);
      const stream = revisioner.stream();

      for await (const file of stream) {
        expect(file).to.have.property('originalPath');
        expect(file).to.have.property('originalName');
      }
    });

    it('should set url property', async () => {
      const files = createFiles();
      const config = new Config(cwd, {});

      const revisioner = new Revisioner(files, config);
      const stream = revisioner.stream();

      for await (const file of stream) {
        expect(file).to.have.property('url');
        expect(file.url).to.be.a('string');
      }
    });
  });

  describe('hash calculation', () => {
    it('should calculate cascading hashes through dependency chain', async () => {
      const files = createFiles();
      const config = new Config(cwd, {});

      const revisioner = new Revisioner(files, config);
      const stream = revisioner.stream();

      const processedFiles = [];
      for await (const file of stream) {
        processedFiles.push(file);
      }

      // Level 0: Leaf nodes with no dependencies have predictable hashes
      const iconFile = processedFiles.find(f => f.originalPath === 'images/icon.svg');
      expect(iconFile.hash).to.match(/^697bbb6d/);

      // Level 1: Files with no code dependencies
      const utilsFile = processedFiles.find(f => f.originalPath === 'js/lib/utils.js');
      expect(utilsFile.hash).to.match(/^b3884b5a/);

      // Level 2: File depending on utils (with extensionless import)
      const modelFile = processedFiles.find(f => f.originalPath === 'js/model.js');
      expect(modelFile.hash).to.match(/^7c1bc318/);
      expect(modelFile.hash).to.not.equal(utilsFile.hash);

      // Level 3: File depending on model
      const appFile = processedFiles.find(f => f.originalPath === 'app.js');
      expect(appFile.hash).to.match(/^33ebca30/);
      expect(appFile.hash).to.not.equal(modelFile.hash);

      // Level 4: File depending on app (4 levels deep from utils!)
      const indexFile = processedFiles.find(f => f.originalPath === 'index.js');
      expect(indexFile.hash).to.match(/^d7af25f1/);
      expect(indexFile.hash).to.not.equal(appFile.hash);

      // Verify all hashes in the chain are different
      const hashes = [utilsFile.hash, modelFile.hash, appFile.hash, indexFile.hash];
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).to.equal(4);
    });

    it('should use correct hash algorithm', async () => {
      const files = [createFile('test.js', 'content')];
      files[0].fileOptions.hash.algorithm = 'sha1';

      const config = new Config(cwd, {});

      const revisioner = new Revisioner(files, config);
      const stream = revisioner.stream();

      for await (const file of stream) {
        // SHA-1 produces 40 hex characters
        expect(file.hash).to.have.lengthOf(40);
      }
    });

    it('should respect hash length in filename', async () => {
      const files = [createFile('test.js', 'content')];
      files[0].fileOptions.hash.length = 16;

      const config = new Config(cwd, {});
      const revisioner = new Revisioner(files, config);
      const stream = revisioner.stream();

      for await (const file of stream) {
        // Extract hash from filename
        const match = file.basename.match(/-([a-f0-9]+)\./);
        expect(match).to.exist;
        expect(match[1]).to.have.lengthOf(16);
      }
    });
  });

  describe('reference rewriting', () => {
    it('should handle relative paths', async () => {
      const dep = createFile('lib/util.js', 'export const util = 1;');
      const main = createFile('src/main.js', "import {util} from '../lib/util.js';", [dep]);

      const config = new Config(cwd, {});
      const revisioner = new Revisioner([dep, main], config);
      const stream = revisioner.stream();

      const result = [];
      for await (const file of stream) {
        result.push(file);
      }

      const mainFile = result.find(f => f.originalPath === 'src/main.js');
      expect(mainFile.contents.toString()).to.include('../lib/util-');
    });

    it('should handle absolute paths with prefix', async () => {
      const dep = createFile('style.css', 'body {}');
      const html = createFile('index.html', '<link href="/style.css">', [dep]);

      dep.fileOptions.url.prefix = '/assets';
      html.fileOptions.url.prefix = '/assets';

      const config = new Config(cwd, {});
      const revisioner = new Revisioner([dep, html], config);
      const stream = revisioner.stream();

      const result = [];
      for await (const file of stream) {
        result.push(file);
      }

      const htmlFile = result.find(f => f.originalPath === 'index.html');
      expect(htmlFile.contents.toString()).to.include('/assets/style-');
    });

    it('should handle URL fragments', async () => {
      const svg = createFile('icon.svg', '<svg></svg>');
      const css = createFile('style.css', 'url("icon.svg#arrow")', [svg]);

      const config = new Config(cwd, {});
      const revisioner = new Revisioner([svg, css], config);
      const stream = revisioner.stream();

      const result = [];
      for await (const file of stream) {
        result.push(file);
      }

      const cssFile = result.find(f => f.originalPath === 'style.css');
      expect(cssFile.contents.toString()).to.match(/icon-[a-f0-9]{8}\.svg#arrow/);
    });

    it('should preserve quote styles', async () => {
      const dep = createFile('dep.js', 'x');
      const file1 = createFile('file1.js', 'require("dep.js")', [dep]);
      const file2 = createFile('file2.js', "require('dep.js')", [dep]);

      const config = new Config(cwd, {});
      const revisioner = new Revisioner([dep, file1, file2], config);
      const stream = revisioner.stream();

      const result = [];
      for await (const file of stream) {
        result.push(file);
      }

      const f1 = result.find(f => f.originalPath === 'file1.js');
      const f2 = result.find(f => f.originalPath === 'file2.js');

      expect(f1.contents.toString()).to.match(/require\("dep-/);
      expect(f2.contents.toString()).to.match(/require\('dep-/);
    });
  });

  describe('rename option', () => {
    it('should not rename when rename is false', async () => {
      const files = [createFile('test.js', 'content')];
      files[0].fileOptions.rename = false;

      const config = new Config(cwd, {});
      const revisioner = new Revisioner(files, config);
      const stream = revisioner.stream();

      for await (const file of stream) {
        expect(file.basename).to.equal('test.js');
        expect(file.relative).to.equal('test.js');
      }
    });

    it('should still calculate hash when rename is false', async () => {
      const files = [createFile('test.js', 'content')];
      files[0].fileOptions.rename = false;

      const config = new Config(cwd, {});
      const revisioner = new Revisioner(files, config);
      const stream = revisioner.stream();

      for await (const file of stream) {
        expect(file.hash).to.exist;
        expect(file.hash).to.be.a('string');
      }
    });
  });

  describe('custom format', () => {
    it('should use custom hash format', async () => {
      const files = [createFile('test.js', 'content')];
      files[0].fileOptions.hash.format = '{hash}.{name}.{ext}';

      const config = new Config(cwd, {});
      const revisioner = new Revisioner(files, config);
      const stream = revisioner.stream();

      for await (const file of stream) {
        // Should be: <hash>.test.js
        expect(file.basename).to.match(/^[a-f0-9]{8}\.test\.js$/);
      }
    });
  });
});
