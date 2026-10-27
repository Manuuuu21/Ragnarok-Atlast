/* Animate the foliage in the existing wallpaper; the camera stays fixed. */
(() => {
  'use strict';
  const scenery = document.querySelector('.prontera-scenery');
  if (!scenery) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const narrowScreen = matchMedia('(max-width: 1100px)');
  const canvas = document.createElement('canvas');
  canvas.className = 'prontera-breeze';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
  if (!gl) return; // The original CSS wallpaper remains available without WebGL.

  const vertexSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;
  const fragmentSource = `
    precision highp float;
    uniform sampler2D u_image;
    uniform vec2 u_imageSize;
    uniform vec2 u_viewSize;
    uniform float u_time;
    varying vec2 v_uv;

    float canopy(vec2 uv, vec2 center, vec2 radius) {
      return 1.0 - smoothstep(0.55, 1.0, length((uv - center) / radius));
    }
    float foliage(vec3 color) {
      return smoothstep(0.015, 0.10, color.g - color.b)
        * smoothstep(-0.025, 0.065, color.g - color.r);
    }
    void main() {
      // Match CSS background-size: cover, including its centered crop.
      float scale = max(u_viewSize.x / u_imageSize.x, u_viewSize.y / u_imageSize.y);
      vec2 uv = (v_uv - 0.5) * u_viewSize / (u_imageSize * scale) + 0.5;
      vec2 pixel = 1.0 / u_imageSize;
      vec3 original = texture2D(u_image, uv).rgb;

      // Canopy locations are normalized to prontera-background.png, not the screen.
      float trees = canopy(uv, vec2(0.025, 0.285), vec2(0.075, 0.145));
      trees = max(trees, canopy(uv, vec2(0.115, 0.480), vec2(0.075, 0.120)));
      trees = max(trees, canopy(uv, vec2(0.025, 0.970), vec2(0.130, 0.150)));
      trees = max(trees, canopy(uv, vec2(0.290, 0.775), vec2(0.075, 0.155)));
      trees = max(trees, canopy(uv, vec2(0.345, 0.600), vec2(0.065, 0.095)));
      trees = max(trees, canopy(uv, vec2(0.450, 0.910), vec2(0.060, 0.120)));
      trees = max(trees, canopy(uv, vec2(0.625, 0.930), vec2(0.075, 0.130)));
      trees = max(trees, canopy(uv, vec2(0.700, 0.980), vec2(0.075, 0.100)));
      trees = max(trees, canopy(uv, vec2(0.810, 0.715), vec2(0.095, 0.150)));
      trees = max(trees, canopy(uv, vec2(0.935, 0.445), vec2(0.095, 0.095)));

      // Include a small leaf-edge fringe so silhouettes can sway into the sky.
      // Color selection prevents the nearby roofs and stonework from swaying.
      float leaves = foliage(original);
      leaves = max(leaves, foliage(texture2D(u_image, uv + vec2(3.0, 0.0) * pixel).rgb));
      leaves = max(leaves, foliage(texture2D(u_image, uv - vec2(3.0, 0.0) * pixel).rgb));
      leaves = max(leaves, foliage(texture2D(u_image, uv + vec2(0.0, 2.0) * pixel).rgb));
      leaves = max(leaves, foliage(texture2D(u_image, uv - vec2(0.0, 2.0) * pixel).rgb));
      float strength = trees * leaves;
      float gust = 0.75 * sin(u_time * 0.85 + uv.x * 4.0)
        + 0.25 * sin(u_time * 1.37 + uv.y * 5.0);
      float flutter = sin(u_time * 2.4 + uv.y * 85.0 + uv.x * 37.0);
      vec2 breeze = vec2(gust * 3.6 + flutter * 0.55,
        sin(u_time * 1.1 + uv.x * 16.0) * 0.7);
      gl_FragColor = vec4(texture2D(u_image, uv + breeze * pixel * strength).rgb, 1.0);
    }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return;
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const timeUniform = gl.getUniformLocation(program, 'u_time');
  const sizeUniform = gl.getUniformLocation(program, 'u_viewSize');
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);

  let ready = false;
  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;
  function draw() {
    gl.uniform1f(timeUniform, elapsed);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function animate(now) {
    if (!lastTime) lastTime = now;
    if (now - lastTime >= 1000 / 30) {
      elapsed += Math.min(now - lastTime, 100) / 1000;
      lastTime = now;
      draw();
    }
    frame = requestAnimationFrame(animate);
  }
  function updateMotion() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    if (!ready) return;
    const show = !reducedMotion.matches && !narrowScreen.matches;
    canvas.hidden = !show;
    if (show && !document.hidden && !document.body.classList.contains('background-paused')) {
      frame = requestAnimationFrame(animate);
    }
  }
  function resize() {
    if (!ready) return;
    const width = scenery.clientWidth;
    const height = scenery.clientHeight;
    // Limit rendering cost on large/high-density displays.
    const density = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(2000000 / (width * height)));
    canvas.width = Math.max(1, Math.round(width * density));
    canvas.height = Math.max(1, Math.round(height * density));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(sizeUniform, width, height);
    draw();
    updateMotion();
  }
  const image = new Image();
  image.onload = () => {
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    } catch {
      return; // Local-file restrictions also fall back to the static wallpaper.
    }
    gl.uniform2f(gl.getUniformLocation(program, 'u_imageSize'), image.naturalWidth, image.naturalHeight);
    ready = true;
    scenery.append(canvas);
    resize();
  };
  image.src = 'img/prontera-background.png';
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', updateMotion);
  reducedMotion.addEventListener('change', updateMotion);
  narrowScreen.addEventListener('change', updateMotion);
  new MutationObserver(updateMotion).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    ready = false;
    cancelAnimationFrame(frame);
    canvas.hidden = true;
  });
})();
