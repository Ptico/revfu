const minimatch = require('minimatch');

/**
 * Find references to other files and order them topologically

 */
class Sorter {
  constructor(files, options={}) {
    this.files = files;

    this.dontRewrite = options.dontRewrite || [];

    this.visited = {};
    this.sorted = [];
  }

  run() {
    this.searchForRefs();
    this.tsort(this.files);

    return this.sorted;
  }

  /**
   * Go trough each file and search for references to other files
   * Result will later be used for topographical sort and replacement
   */
  searchForRefs() {
    this.files.forEach(f => {
      let relPath = f.relative;

      if (this.searchable(f)) {
        f.textContent = f.contents.toString();

        this.files.forEach(s => {
          if (s === f) return; // Do not search if it's the same file

          if (s.searchRegExpMain.test(f.textContent)) { // Search with extension
            f.addDep(s);
          } else if (s.isExtensionless) { // Search references without extensions
            if (s.searchRegExpBound.test(f.textContent)) f.addDep(s);
          }
        });
      }
    });
  }

  /**
   * Quick and dirty topographical sorting
   * TODO: circular reference handling
   */
  tsort(files) {
    files.forEach(f => this.tsortEach(f));
  }

  tsortEach(file) {
    if (this.visited[file.relative]) return; // Already handled, go next

    this.visited[file.relative] = true; // Mark handled
    this.tsort(file.deps) // Recursively find dependencies
    this.sorted.push(file); // Add exact file
  }

  searchable(file) {
    if (this.dontRewrite.some(pattern => minimatch(file.relative, pattern))) return false;
    return !file.isBinary;
  }
}

module.exports = Sorter;
