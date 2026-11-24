// Bouchon minimal de `document` pour construire le capybara (textures de fourrure sur canvas) dans Vitest, sous Node.
const g = globalThis as unknown as { document?: unknown };
if (!g.document) {
  const ctx = new Proxy(
    {
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    } as Record<string, unknown>,
    { get: (t, k: string) => (k in t ? t[k] : () => undefined), set: () => true },
  );
  g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
}
export {};
