const path = require('path');
const expect = require('chai').expect;

const Walker = require('../../src/walker');

const basePath = path.resolve(__dirname, '../fixtures/fs');

describe('Walker', function() {
  describe('without options', function() {
    let files = new Walker(basePath).run().map(f => f.relative);

    it('should list files in working directory', function() {
      expect(files).to.include.members(['index.js', 'test.html']);
    });

    it('should list files in subdirectories', function() {
      expect(files).to.include.members([
        'admin/sub/foo.js', 'admin/sub/index.js',
        'css/main.css', 'css/secondary.css',
        'img/like.svg', 'img/unicorn.png'
      ]);
    });

    it('should not list directories', function() {
      expect(files).to.not.include.members(['admin', 'admin/sub', 'css', 'img']);
    });

    it('should skip .files', function() {
      expect(files).to.not.include.members(['.dotfile', 'css/.temp.css']);
    });

    it('should skip .directories', function() {
      expect(files).to.not.include.members(['.hidden/secret.txt']);
    });

    it('should detect binary files', function() {

    });
  });

  describe('options.excludes', function() {
    let files = new Walker(basePath, { excludes: ['css', 'index.js'] }).run().map(f => f.relative);

    it('should skip given files and dirs', function() {
      expect(files).to.not.include.members(['css/main.css', 'css/secondary.css', 'index.js']);
    });

    it('should include other files', function() {
      expect(files).to.include.members(['admin/sub/index.js', 'test.html']);
    });
  });

  describe('options.dot', function() {
    let files = new Walker(basePath, { dot: true }).run().map(f => f.relative);

    it('should include .files and dirs', function() {
      expect(files).to.include.members(['.dotfile', 'css/.temp.css']);
    });
  });
});
