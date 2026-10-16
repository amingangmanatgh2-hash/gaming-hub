// Maps the browser importmap specifier "three" to the vendored build for Node.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') {
    return { url: new URL('../app/js/vendor/three.module.min.js', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
