// node_modules/@tanstack/router-core/dist/esm/not-found.js
function notFound(options = {}) {
  options.isNotFound = true;
  if (options.throw) throw options;
  return options;
}
function isNotFound(obj) {
  return obj?.isNotFound === true;
}

export { notFound, isNotFound };
//# sourceMappingURL=chunk-XOQNJMC5.js.map
