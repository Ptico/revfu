import { expect } from 'chai';
import Vinyl from 'vinyl';
import { Sorter, sortFiles } from '../../src/sorter.js';

/**
 * Helper to create a mock file with dependencies
 */
function createFile(name, deps = []) {
  const file = new Vinyl({
    base: '/test',
    path: `/test/${name}`,
    contents: Buffer.from(''),
  });
  file.deps = deps;
  return file;
}

describe('Sorter', () => {
  describe('basic sorting', () => {
    it('should sort files with no dependencies', () => {
      const file1 = createFile('a.js');
      const file2 = createFile('b.js');
      const file3 = createFile('c.js');

      const sorter = new Sorter([file1, file2, file3]);
      const sorted = sorter.sort();

      expect(sorted).to.have.lengthOf(3);
      expect(sorted).to.include(file1);
      expect(sorted).to.include(file2);
      expect(sorted).to.include(file3);
    });

    it('should sort single file', () => {
      const file = createFile('app.js');
      const sorter = new Sorter([file]);
      const sorted = sorter.sort();

      expect(sorted).to.deep.equal([file]);
    });

    it('should handle empty array', () => {
      const sorter = new Sorter([]);
      const sorted = sorter.sort();

      expect(sorted).to.deep.equal([]);
    });
  });

  describe('dependency ordering', () => {
    it('should place dependencies before dependents', () => {
      const utils = createFile('utils.js');
      const app = createFile('app.js', [utils]);

      const sorter = new Sorter([app, utils]);
      const sorted = sorter.sort();

      expect(sorted[0]).to.equal(utils);
      expect(sorted[1]).to.equal(app);
    });

    it('should handle chain of dependencies', () => {
      const base = createFile('base.js');
      const utils = createFile('utils.js', [base]);
      const helpers = createFile('helpers.js', [utils]);
      const app = createFile('app.js', [helpers]);

      const sorter = new Sorter([app, helpers, utils, base]);
      const sorted = sorter.sort();

      // Base should come first, app last
      expect(sorted[0]).to.equal(base);
      expect(sorted[1]).to.equal(utils);
      expect(sorted[2]).to.equal(helpers);
      expect(sorted[3]).to.equal(app);
    });

    it('should handle multiple dependencies', () => {
      const utils = createFile('utils.js');
      const helpers = createFile('helpers.js');
      const app = createFile('app.js', [utils, helpers]);

      const sorter = new Sorter([app, utils, helpers]);
      const sorted = sorter.sort();

      // Both utils and helpers should come before app
      const utilsIndex = sorted.indexOf(utils);
      const helpersIndex = sorted.indexOf(helpers);
      const appIndex = sorted.indexOf(app);

      expect(utilsIndex).to.be.lessThan(appIndex);
      expect(helpersIndex).to.be.lessThan(appIndex);
    });

    it('should handle diamond dependency pattern', () => {
      // Diamond: base <- utils, helpers <- app
      const base = createFile('base.js');
      const utils = createFile('utils.js', [base]);
      const helpers = createFile('helpers.js', [base]);
      const app = createFile('app.js', [utils, helpers]);

      const sorter = new Sorter([app, helpers, utils, base]);
      const sorted = sorter.sort();

      // Base should be first, app should be last
      expect(sorted[0]).to.equal(base);
      expect(sorted[sorted.length - 1]).to.equal(app);

      // Utils and helpers should both come after base and before app
      const baseIndex = sorted.indexOf(base);
      const utilsIndex = sorted.indexOf(utils);
      const helpersIndex = sorted.indexOf(helpers);
      const appIndex = sorted.indexOf(app);

      expect(baseIndex).to.be.lessThan(utilsIndex);
      expect(baseIndex).to.be.lessThan(helpersIndex);
      expect(utilsIndex).to.be.lessThan(appIndex);
      expect(helpersIndex).to.be.lessThan(appIndex);
    });

    it('should handle complex dependency graph', () => {
      const a = createFile('a.js');
      const b = createFile('b.js', [a]);
      const c = createFile('c.js', [a]);
      const d = createFile('d.js', [b, c]);
      const e = createFile('e.js', [d]);

      const sorter = new Sorter([e, d, c, b, a]);
      const sorted = sorter.sort();

      // Verify ordering
      const indices = {
        a: sorted.indexOf(a),
        b: sorted.indexOf(b),
        c: sorted.indexOf(c),
        d: sorted.indexOf(d),
        e: sorted.indexOf(e),
      };

      expect(indices.a).to.be.lessThan(indices.b);
      expect(indices.a).to.be.lessThan(indices.c);
      expect(indices.b).to.be.lessThan(indices.d);
      expect(indices.c).to.be.lessThan(indices.d);
      expect(indices.d).to.be.lessThan(indices.e);
    });
  });

  describe('circular dependency detection', () => {
    it('should detect simple circular dependency', () => {
      const a = createFile('a.js');
      const b = createFile('b.js');
      a.deps = [b];
      b.deps = [a];

      const sorter = new Sorter([a, b]);

      expect(() => sorter.sort()).to.throw(/Circular dependency detected/);
    });

    it('should detect circular dependency in chain', () => {
      const a = createFile('a.js');
      const b = createFile('b.js', [a]);
      const c = createFile('c.js', [b]);
      a.deps = [c]; // Create cycle

      const sorter = new Sorter([a, b, c]);

      expect(() => sorter.sort()).to.throw(/Circular dependency detected/);
    });

    it('should detect self-dependency', () => {
      const a = createFile('a.js');
      a.deps = [a];

      const sorter = new Sorter([a]);

      expect(() => sorter.sort()).to.throw(/Circular dependency detected/);
    });

    it('should use detectCycles() to find cycle nodes', () => {
      const a = createFile('a.js');
      const b = createFile('b.js');
      a.deps = [b];
      b.deps = [a];

      const sorter = new Sorter([a, b]);
      const cycles = sorter.detectCycles();

      expect(cycles).to.have.lengthOf(2);
      expect(cycles).to.include('a.js');
      expect(cycles).to.include('b.js');
    });

    it('should return empty array when no cycles', () => {
      const a = createFile('a.js');
      const b = createFile('b.js', [a]);

      const sorter = new Sorter([a, b]);
      const cycles = sorter.detectCycles();

      expect(cycles).to.be.an('array').that.is.empty;
    });
  });

  describe('graph statistics', () => {
    it('should calculate stats for simple graph', () => {
      const utils = createFile('utils.js');
      const app = createFile('app.js', [utils]);

      const sorter = new Sorter([app, utils]);
      const stats = sorter.getStats();

      expect(stats.totalFiles).to.equal(2);
      expect(stats.totalDependencies).to.equal(1);
      expect(stats.filesWithDependencies).to.equal(1);
      expect(stats.maxDependenciesPerFile).to.equal(1);
      expect(stats.averageDependencies).to.equal(0.5);
    });

    it('should calculate max depth correctly', () => {
      const base = createFile('base.js');
      const utils = createFile('utils.js', [base]);
      const helpers = createFile('helpers.js', [utils]);
      const app = createFile('app.js', [helpers]);

      const sorter = new Sorter([app, helpers, utils, base]);
      const stats = sorter.getStats();

      expect(stats.maxDepth).to.equal(3);
    });

    it('should handle graph with no dependencies', () => {
      const file1 = createFile('a.js');
      const file2 = createFile('b.js');

      const sorter = new Sorter([file1, file2]);
      const stats = sorter.getStats();

      expect(stats.totalFiles).to.equal(2);
      expect(stats.totalDependencies).to.equal(0);
      expect(stats.filesWithDependencies).to.equal(0);
      expect(stats.maxDepth).to.equal(0);
    });
  });

  describe('depth map', () => {
    it('should calculate depth for each file', () => {
      const base = createFile('base.js');
      const utils = createFile('utils.js', [base]);
      const app = createFile('app.js', [utils]);

      const sorter = new Sorter([app, utils, base]);
      const depths = sorter.getDepthMap();

      expect(depths.get('base.js')).to.equal(0);
      expect(depths.get('utils.js')).to.equal(1);
      expect(depths.get('app.js')).to.equal(2);
    });

    it('should handle diamond pattern depths correctly', () => {
      const base = createFile('base.js');
      const utils = createFile('utils.js', [base]);
      const helpers = createFile('helpers.js', [base]);
      const app = createFile('app.js', [utils, helpers]);

      const sorter = new Sorter([app, helpers, utils, base]);
      const depths = sorter.getDepthMap();

      expect(depths.get('base.js')).to.equal(0);
      expect(depths.get('utils.js')).to.equal(1);
      expect(depths.get('helpers.js')).to.equal(1);
      expect(depths.get('app.js')).to.equal(2);
    });
  });

  describe('factory function', () => {
    it('should provide sortFiles factory function', () => {
      const utils = createFile('utils.js');
      const app = createFile('app.js', [utils]);

      const sorted = sortFiles([app, utils]);

      expect(sorted[0]).to.equal(utils);
      expect(sorted[1]).to.equal(app);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle CSS with images', () => {
      const image = createFile('bg.png');
      const css = createFile('style.css', [image]);
      const html = createFile('index.html', [css]);

      const sorted = sortFiles([html, css, image]);

      expect(sorted[0]).to.equal(image);
      expect(sorted[1]).to.equal(css);
      expect(sorted[2]).to.equal(html);
    });

    it('should handle mixed asset types', () => {
      const font = createFile('font.woff2');
      const icon = createFile('icon.png');
      const css = createFile('style.css', [font, icon]);
      const js = createFile('app.js');
      const html = createFile('index.html', [css, js]);

      const sorted = sortFiles([html, js, css, icon, font]);

      // Verify dependencies come first
      const htmlIndex = sorted.indexOf(html);
      const cssIndex = sorted.indexOf(css);
      const jsIndex = sorted.indexOf(js);
      const fontIndex = sorted.indexOf(font);
      const iconIndex = sorted.indexOf(icon);

      expect(fontIndex).to.be.lessThan(cssIndex);
      expect(iconIndex).to.be.lessThan(cssIndex);
      expect(cssIndex).to.be.lessThan(htmlIndex);
      expect(jsIndex).to.be.lessThan(htmlIndex);
    });

    it('should handle shared dependencies', () => {
      const utils = createFile('utils.js');
      const componentA = createFile('componentA.js', [utils]);
      const componentB = createFile('componentB.js', [utils]);
      const app = createFile('app.js', [componentA, componentB]);

      const sorted = sortFiles([app, componentB, componentA, utils]);

      const utilsIndex = sorted.indexOf(utils);
      const aIndex = sorted.indexOf(componentA);
      const bIndex = sorted.indexOf(componentB);
      const appIndex = sorted.indexOf(app);

      expect(utilsIndex).to.be.lessThan(aIndex);
      expect(utilsIndex).to.be.lessThan(bIndex);
      expect(aIndex).to.be.lessThan(appIndex);
      expect(bIndex).to.be.lessThan(appIndex);
    });
  });
});
