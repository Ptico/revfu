// Level 1: Base utility functions
export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-');
}
