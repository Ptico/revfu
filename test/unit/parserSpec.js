import { expect } from 'chai';
import Vinyl from 'vinyl';
import { Config } from '../../src/config.js';
import { Parser } from '../../src/parser.js';
import { Readable, pipeline } from 'stream';
import { promisify } from 'util';

const pipelineAsync = promisify(pipeline);

/**
 * Helper to create a Vinyl file for testing
 */
function createFile(relativePath, contents, isBinary = false) {
  return new Vinyl({
    base: '/test',
    path: `/test/${relativePath}`,
    contents: Buffer.from(contents),
    isBinary: isBinary,
  });
}

/**
 * Helper to run files through parser
 */
async function parseFiles(config, files) {
  const parser = new Parser(config);
  const results = [];

  // Create readable stream from files array
  const input = Readable.from(files, { objectMode: true });

  // Collect output
  parser.on('data', file => results.push(file));

  // Wait for completion
  await pipelineAsync(input, parser);

  return results;
}

describe('Parser', () => {
  describe('basic functionality', () => {
    it('should be a Transform stream', () => {
      const config = new Config('/test');
      const parser = new Parser(config);

      expect(parser).to.have.property('_transform');
      expect(parser).to.have.property('_flush');
    });

    it('should pass through files', async () => {
      const config = new Config('/test');
      const file1 = createFile('app.js', 'console.log("hello")');
      const file2 = createFile('style.css', 'body {}');

      const results = await parseFiles(config, [file1, file2]);

      expect(results).to.have.lengthOf(2);
      expect(results[0].relative).to.equal('app.js');
      expect(results[1].relative).to.equal('style.css');
    });

    it('should add deps array to files', async () => {
      const config = new Config('/test');
      const file = createFile('app.js', 'console.log("hello")');

      const results = await parseFiles(config, [file]);

      expect(results[0].deps).to.be.an('array');
    });

    it('should add fileOptions to files', async () => {
      const config = new Config('/test');
      const file = createFile('app.js', 'console.log("hello")');

      const results = await parseFiles(config, [file]);

      expect(results[0].fileOptions).to.be.an('object');
      expect(results[0].fileOptions).to.have.property('hash');
      expect(results[0].fileOptions).to.have.property('url');
    });
  });

  describe('reference detection', () => {
    it('should detect ES6 import statements', async () => {
      const config = new Config('/test');
      const file1 = createFile('app.js', 'import utils from "./utils.js"');
      const file2 = createFile('utils.js', 'export default {}');

      const results = await parseFiles(config, [file1, file2]);

      const app = results.find(f => f.relative === 'app.js');
      expect(app.deps).to.have.lengthOf(1);
      expect(app.deps[0].relative).to.equal('utils.js');
    });

    it('should detect require statements', async () => {
      const config = new Config('/test');
      const file1 = createFile('app.js', 'const utils = require("./utils.js")');
      const file2 = createFile('utils.js', 'module.exports = {}');

      const results = await parseFiles(config, [file1, file2]);

      const app = results.find(f => f.relative === 'app.js');
      expect(app.deps).to.have.lengthOf(1);
      expect(app.deps[0].relative).to.equal('utils.js');
    });

    it('should detect dynamic imports', async () => {
      const config = new Config('/test');
      const file1 = createFile('app.js', 'const utils = import("./utils.js")');
      const file2 = createFile('utils.js', 'export default {}');

      const results = await parseFiles(config, [file1, file2]);

      const app = results.find(f => f.relative === 'app.js');
      expect(app.deps).to.have.lengthOf(1);
      expect(app.deps[0].relative).to.equal('utils.js');
    });

    it('should detect CSS url() references', async () => {
      const config = new Config('/test');
      const file1 = createFile('style.css', 'body { background: url("./bg.png"); }');
      const file2 = createFile('bg.png', '', true);
      file2.isBinary = true;

      const results = await parseFiles(config, [file1, file2]);

      const css = results.find(f => f.relative === 'style.css');
      expect(css.deps).to.have.lengthOf(1);
      expect(css.deps[0].relative).to.equal('bg.png');
    });

    it('should detect HTML src attributes', async () => {
      const config = new Config('/test');
      const file1 = createFile('index.html', '<img src="./image.jpg">');
      const file2 = createFile('image.jpg', '', true);
      file2.isBinary = true;

      const results = await parseFiles(config, [file1, file2]);

      const html = results.find(f => f.relative === 'index.html');
      expect(html.deps).to.have.lengthOf(1);
      expect(html.deps[0].relative).to.equal('image.jpg');
    });

    it('should detect HTML href attributes', async () => {
      const config = new Config('/test');
      const file1 = createFile('index.html', '<link rel="stylesheet" href="./style.css">');
      const file2 = createFile('style.css', 'body {}');

      const results = await parseFiles(config, [file1, file2]);

      const html = results.find(f => f.relative === 'index.html');
      expect(html.deps).to.have.lengthOf(1);
      expect(html.deps[0].relative).to.equal('style.css');
    });

    it('should detect multiple references in one file', async () => {
      const config = new Config('/test');
      const file1 = createFile('app.js', `
        import utils from "./utils.js";
        import helpers from "./helpers.js";
        const data = require("./data.js");
      `);
      const file2 = createFile('utils.js', '');
      const file3 = createFile('helpers.js', '');
      const file4 = createFile('data.js', '');

      const results = await parseFiles(config, [file1, file2, file3, file4]);

      const app = results.find(f => f.relative === 'app.js');
      expect(app.deps).to.have.lengthOf(3);
    });
  });

  describe('extensionless references', () => {
    it('should detect extensionless require statements', async () => {
      const config = new Config('/test');
      const file1 = createFile('app.js', 'const utils = require("./utils")');
      const file2 = createFile('utils.js', 'module.exports = {}');

      const results = await parseFiles(config, [file1, file2]);

      const app = results.find(f => f.relative === 'app.js');
      expect(app.deps).to.have.lengthOf(1);
      expect(app.deps[0].relative).to.equal('utils.js');
    });

    it('should handle both with and without extension', async () => {
      const config = new Config('/test');
      const file1 = createFile('app.js', `
        const utils1 = require("./utils");
        const utils2 = require("./utils.js");
      `);
      const file2 = createFile('utils.js', 'module.exports = {}');

      const results = await parseFiles(config, [file1, file2]);

      const app = results.find(f => f.relative === 'app.js');
      // Should only have one dependency (not duplicated)
      expect(app.deps).to.have.lengthOf(1);
    });
  });

  describe('path resolution', () => {
    it('should resolve relative paths from nested directories', async () => {
      const config = new Config('/test');
      const file1 = createFile('pages/admin/dashboard.js', 'import utils from "../../utils.js"');
      const file2 = createFile('utils.js', '');

      const results = await parseFiles(config, [file1, file2]);

      const dashboard = results.find(f => f.relative === 'pages/admin/dashboard.js');
      expect(dashboard.deps).to.have.lengthOf(1);
      expect(dashboard.deps[0].relative).to.equal('utils.js');
    });

    it('should resolve index files', async () => {
      const config = new Config('/test');
      const file1 = createFile('app.js', 'import utils from "./utils"');
      const file2 = createFile('utils/index.js', '');

      const results = await parseFiles(config, [file1, file2]);

      const app = results.find(f => f.relative === 'app.js');
      expect(app.deps).to.have.lengthOf(1);
      expect(app.deps[0].relative).to.equal('utils/index.js');
    });

    it('should handle prefix in references', async () => {
      const config = new Config('/test', {
        url: { prefix: '/assets' }
      });
      const file1 = createFile('app.js', 'import utils from "/assets/utils.js"');
      const file2 = createFile('utils.js', '');

      const results = await parseFiles(config, [file1, file2]);

      const app = results.find(f => f.relative === 'app.js');
      expect(app.deps).to.have.lengthOf(1);
      expect(app.deps[0].relative).to.equal('utils.js');
    });
  });

  describe('filtering', () => {
    it('should skip binary files', async () => {
      const config = new Config('/test');
      const file1 = createFile('image.png', 'binary content', true);
      file1.isBinary = true;

      const results = await parseFiles(config, [file1]);

      const image = results.find(f => f.relative === 'image.png');
      expect(image.foundReferences).to.be.undefined;
    });

    it('should skip files with no patterns defined', async () => {
      const config = new Config('/test');
      const file1 = createFile('data.bin', 'some content');

      const results = await parseFiles(config, [file1]);

      const data = results.find(f => f.relative === 'data.bin');
      expect(data.foundReferences).to.be.undefined;
    });

    it('should skip files marked as rewrite: false', async () => {
      const config = new Config('/test', {
        rules: [
          { match: 'vendor/**', rewrite: false }
        ]
      });
      const file1 = createFile('vendor/lib.js', 'import "./utils.js"');

      const results = await parseFiles(config, [file1]);

      const vendor = results.find(f => f.relative === 'vendor/lib.js');
      expect(vendor.foundReferences).to.be.undefined;
    });

    it('should ignore external URLs', async () => {
      const config = new Config('/test');
      const file1 = createFile('app.js', `
        import external from "https://cdn.com/lib.js";
        import local from "./local.js";
      `);
      const file2 = createFile('local.js', '');

      const results = await parseFiles(config, [file1, file2]);

      const app = results.find(f => f.relative === 'app.js');
      // Should only find local reference
      expect(app.deps).to.have.lengthOf(1);
      expect(app.deps[0].relative).to.equal('local.js');
    });

    it('should ignore data URIs', async () => {
      const config = new Config('/test');
      const file1 = createFile('style.css', `
        .icon1 { background: url("data:image/png;base64,ABC"); }
        .icon2 { background: url("./icon.png"); }
      `);
      const file2 = createFile('icon.png', '', true);
      file2.isBinary = true;

      const results = await parseFiles(config, [file1, file2]);

      const css = results.find(f => f.relative === 'style.css');
      // Should only find local reference
      expect(css.deps).to.have.lengthOf(1);
      expect(css.deps[0].relative).to.equal('icon.png');
    });

    it('should ignore node_modules packages', async () => {
      const config = new Config('/test');
      const file1 = createFile('app.js', `
        import lodash from "lodash";
        import local from "./local.js";
      `);
      const file2 = createFile('local.js', '');

      const results = await parseFiles(config, [file1, file2]);

      const app = results.find(f => f.relative === 'app.js');
      // Should only find local reference
      expect(app.deps).to.have.lengthOf(1);
      expect(app.deps[0].relative).to.equal('local.js');
    });
  });

  describe('textContent preservation', () => {
    it('should store textContent for non-binary files', async () => {
      const config = new Config('/test');
      const content = 'const x = 42;';
      const file = createFile('app.js', content);

      const results = await parseFiles(config, [file]);

      expect(results[0].textContent).to.equal(content);
    });

    it('should not create textContent for binary files', async () => {
      const config = new Config('/test');
      const file = createFile('image.png', 'binary', true);
      file.isBinary = true;

      const results = await parseFiles(config, [file]);

      expect(results[0].textContent).to.be.undefined;
    });
  });
});
