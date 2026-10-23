// Browsers may share a file: IndexedDB origin while keeping localStorage per
// file. Keep independent offline copies in separate namespaces as well.
export const storageScope = typeof location !== "undefined" && location.protocol === "file:"
  ? `:${location.pathname}`
  : "";
