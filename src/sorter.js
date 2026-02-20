/**
 * Sorter - Topologically sorts files based on dependency graph
 * Uses Kahn's algorithm for topological sorting with cycle detection
 *
 * The key insight: Files must be processed in dependency order so that
 * when we hash a file, all its dependencies are already hashed. This
 * creates cascading, deterministic hashes.
 */
export class Sorter {
  /**
   * @param {Array} files - Array of Vinyl files with deps populated
   */
  constructor(files) {
    this.files = files;
    this.sorted = [];
    this.graph = new Map(); // file.relative -> Set of dependents
    this.inDegree = new Map(); // file.relative -> number of dependencies
  }

  /**
   * Sort files topologically
   * @returns {Array} Sorted array of files
   * @throws {Error} If circular dependency detected
   */
  sort() {
    this._buildGraph();
    this._topologicalSort();
    return this.sorted;
  }

  /**
   * Build adjacency list representation of dependency graph
   * @private
   */
  _buildGraph() {
    // Initialize graph for all files
    for (const file of this.files) {
      if (!this.graph.has(file.relative)) {
        this.graph.set(file.relative, new Set());
      }
      if (!this.inDegree.has(file.relative)) {
        this.inDegree.set(file.relative, 0);
      }
    }

    // Build edges: if A depends on B, then B -> A (B must come before A)
    for (const file of this.files) {
      for (const dep of file.deps) {
        // Add edge from dependency to dependent
        if (!this.graph.has(dep.relative)) {
          this.graph.set(dep.relative, new Set());
        }

        // Only add if not already present
        if (!this.graph.get(dep.relative).has(file.relative)) {
          this.graph.get(dep.relative).add(file.relative);
          // Increment in-degree of the dependent
          this.inDegree.set(file.relative, this.inDegree.get(file.relative) + 1);
        }
      }
    }
  }

  /**
   * Perform topological sort using Kahn's algorithm
   * @private
   */
  _topologicalSort() {
    // Create a map for quick file lookup
    const fileMap = new Map();
    for (const file of this.files) {
      fileMap.set(file.relative, file);
    }

    // Queue of files with no dependencies (in-degree = 0)
    const queue = [];
    for (const [filePath, degree] of this.inDegree.entries()) {
      if (degree === 0) {
        queue.push(filePath);
      }
    }

    // Process queue
    const visited = new Set();

    while (queue.length > 0) {
      // Get next file with no dependencies
      const current = queue.shift();
      visited.add(current);

      const file = fileMap.get(current);
      if (file) {
        this.sorted.push(file);
      }

      // Process dependents of current file
      const dependents = this.graph.get(current) || new Set();
      for (const dependent of dependents) {
        // Decrease in-degree
        const newDegree = this.inDegree.get(dependent) - 1;
        this.inDegree.set(dependent, newDegree);

        // If in-degree becomes 0, add to queue
        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    // Check for cycles
    if (visited.size !== this.files.length) {
      const unvisited = this.files
        .filter(f => !visited.has(f.relative))
        .map(f => f.relative);

      throw new Error(
        `Circular dependency detected. Files involved: ${unvisited.join(', ')}`
      );
    }
  }

  /**
   * Build reverse graph (file -> its dependency paths)
   * @private
   * @returns {Map<string, string[]>}
   */
  _buildReverseGraph() {
    const reverseGraph = new Map();
    for (const file of this.files) {
      if (!reverseGraph.has(file.relative)) {
        reverseGraph.set(file.relative, []);
      }
      for (const dep of file.deps) {
        if (!reverseGraph.has(dep.relative)) {
          reverseGraph.set(dep.relative, []);
        }
        reverseGraph.get(file.relative).push(dep.relative);
      }
    }
    return reverseGraph;
  }

  /**
   * Detect circular dependencies (alternative approach using DFS)
   * Returns array of files involved in cycles, or empty array if none
   * @returns {Array<string>}
   */
  detectCycles() {
    const visited = new Set();
    const recursionStack = new Set();
    const cycleNodes = new Set();

    const reverseGraph = this._buildReverseGraph();

    const dfs = (node) => {
      visited.add(node);
      recursionStack.add(node);

      const neighbors = reverseGraph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            cycleNodes.add(node);
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          // Cycle detected
          cycleNodes.add(node);
          cycleNodes.add(neighbor);
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    // Check each file
    for (const file of this.files) {
      if (!visited.has(file.relative)) {
        dfs(file.relative);
      }
    }

    return Array.from(cycleNodes);
  }

  /**
   * Get dependency depth for each file (for debugging/visualization)
   * @returns {Map<string, number>} Map of file path to depth
   */
  getDepthMap() {
    const depths = new Map();
    const reverseGraph = this._buildReverseGraph();

    // Calculate depth using DFS
    const calculateDepth = (node, visited = new Set()) => {
      if (depths.has(node)) {
        return depths.get(node);
      }

      if (visited.has(node)) {
        return 0; // Cycle protection
      }

      visited.add(node);

      const deps = reverseGraph.get(node) || [];
      if (deps.length === 0) {
        depths.set(node, 0);
        return 0;
      }

      let maxDepth = 0;
      for (const dep of deps) {
        const depDepth = calculateDepth(dep, new Set(visited));
        maxDepth = Math.max(maxDepth, depDepth + 1);
      }

      depths.set(node, maxDepth);
      return maxDepth;
    };

    for (const file of this.files) {
      calculateDepth(file.relative);
    }

    return depths;
  }

  /**
   * Get statistics about the dependency graph
   * @returns {Object} Graph statistics
   */
  getStats() {
    const depCounts = this.files.map(f => f.deps.length);
    const totalDeps = depCounts.reduce((sum, count) => sum + count, 0);
    const maxDeps = Math.max(...depCounts, 0);
    const filesWithDeps = depCounts.filter(c => c > 0).length;

    const depths = this.getDepthMap();
    const maxDepth = Math.max(...depths.values(), 0);

    return {
      totalFiles: this.files.length,
      totalDependencies: totalDeps,
      filesWithDependencies: filesWithDeps,
      maxDependenciesPerFile: maxDeps,
      maxDepth: maxDepth,
      averageDependencies: totalDeps / this.files.length || 0,
    };
  }
}

/**
 * Factory function to create and run sorter
 *
 * @param {Array} files - Array of files to sort
 * @returns {Array} Sorted files
 */
export function sortFiles(files) {
  const sorter = new Sorter(files);
  return sorter.sort();
}

export default Sorter;
