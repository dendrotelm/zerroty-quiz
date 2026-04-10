export const RetroTVShader = {
  uniforms: {
    "tDiffuse": { value: null },
    "amount": { value: 0.005 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec4 cr = texture2D(tDiffuse, vUv + vec2(amount, 0.0));
      vec4 cg = texture2D(tDiffuse, vUv);
      vec4 cb = texture2D(tDiffuse, vUv - vec2(amount, 0.0));
      vec4 color = vec4(cr.r, cg.g, cb.b, 1.0);
      float scanlines = sin(vUv.y * 400.0) * 0.04;
      color -= scanlines;
      gl_FragColor = color;
    }`
};

