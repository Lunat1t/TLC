export const WHITE = Object.freeze({ color: '#F4F4F5', eyeColor: '#09090B' });
export const BLACK = Object.freeze({ color: '#18181B', eyeColor: '#F4F4F5' });
export const CUSTOM_DEFAULT = Object.freeze({ color: '#7C5CFF', eyeColor: '#FAFAFA' });
export const WEBGL_COLORS = Object.freeze(['#7C6AF7', '#7DD3C7', '#E8B4D4']);

export const AVATAR_PRESETS = Object.freeze([
  {
    id: 'aurora',
    name: 'Aurora WebGL',
    badge: '21st.dev Original',
    variant: 'webgl',
    colors: ['#7C6AF7', '#7DD3C7', '#E8B4D4'],
    color: '#7C6AF7',
    eyeColor: '#09090B',
  },
  {
    id: 'tlc-cyber',
    name: 'TLC Импульс',
    badge: 'SPIKE Cyan',
    variant: 'webgl',
    colors: ['#02C7EA', '#38BDF8', '#7DD3C7'],
    color: '#02C7EA',
    eyeColor: '#06232D',
  },
  {
    id: 'white',
    name: 'Светлый Орб',
    badge: 'White',
    variant: 'white',
    colors: ['#F4F4F5', '#E4E4E7', '#D4D4D8'],
    color: WHITE.color,
    eyeColor: WHITE.eyeColor,
  },
  {
    id: 'black',
    name: 'Обсидиан',
    badge: 'Black',
    variant: 'black',
    colors: ['#18181B', '#27272A', '#3F3F46'],
    color: BLACK.color,
    eyeColor: BLACK.eyeColor,
  },
  {
    id: 'violet',
    name: 'Неоновый Вектор',
    badge: 'Custom',
    variant: 'custom',
    colors: ['#7C5CFF', '#A78BFA', '#C4B5FD'],
    color: CUSTOM_DEFAULT.color,
    eyeColor: CUSTOM_DEFAULT.eyeColor,
  },
  {
    id: 'solar-ev3',
    name: 'Солнечный EV3',
    badge: 'EV3 Core',
    variant: 'webgl',
    colors: ['#FF6B35', '#F7931E', '#FFE66D'],
    color: '#FF6B35',
    eyeColor: '#1F130B',
  },
]);

export function hexToRgb(hex) {
  const raw = String(hex || '').replace('#', '').trim();
  const full = raw.length === 3
    ? raw.split('').map(c => c + c).join('')
    : raw.padEnd(6, '0').slice(0, 6);
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return [0.96, 0.96, 0.96];
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

export function resolveOrbConfig(options = {}) {
  const variant = options.variant || 'webgl';
  if (variant === 'white') {
    return {
      variant: 'white',
      mode: 0,
      color: WHITE.color,
      eyeColor: options.eyeColor || WHITE.eyeColor,
      colors: [...WEBGL_COLORS],
    };
  }
  if (variant === 'black') {
    return {
      variant: 'black',
      mode: 0,
      color: BLACK.color,
      eyeColor: options.eyeColor || BLACK.eyeColor,
      colors: [...WEBGL_COLORS],
    };
  }
  if (variant === 'custom') {
    return {
      variant: 'custom',
      mode: 0,
      color: options.color || CUSTOM_DEFAULT.color,
      eyeColor: options.eyeColor || CUSTOM_DEFAULT.eyeColor,
      colors: Array.isArray(options.colors) && options.colors.length >= 3
        ? options.colors.slice(0, 3)
        : [...WEBGL_COLORS],
    };
  }
  const stops = Array.isArray(options.colors) && options.colors.length >= 3
    ? options.colors.slice(0, 3)
    : [...WEBGL_COLORS];
  return {
    variant: 'webgl',
    mode: 1,
    color: options.color || stops[0],
    eyeColor: options.eyeColor || '#09090B',
    colors: stops,
  };
}

const VERT = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_speed;
uniform vec2 u_look;
uniform float u_blink;
uniform float u_mode;
uniform vec3 u_body;
uniform vec3 u_eye;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

vec3 orient(vec3 p, vec2 look) {
  float yaw = look.x * 0.92;
  float pitch = -look.y * 0.78;
  float cy = cos(yaw);
  float sy = sin(yaw);
  float cp = cos(pitch);
  float sp = sin(pitch);
  vec3 q = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);
  return vec3(q.x * cy + q.z * sy, q.y, -q.x * sy + q.z * cy);
}

float eyeMask(vec3 n, vec3 e, vec3 right, vec3 up, float halfH, float rad) {
  float facing = dot(n, e);
  float x = dot(n, right) - dot(e, right);
  float y = dot(n, up) - dot(e, up);
  y -= clamp(y, -halfH, halfH);
  float d = length(vec2(x, y)) - rad;
  float fill = 1.0 - smoothstep(-0.01, 0.01, d);
  return fill * smoothstep(0.12, 0.32, facing);
}

vec3 wash(vec3 n, float t) {
  vec2 q = n.xy * 2.2 + n.z * 0.85;
  vec2 w1 = vec2(
    fbm(q * 1.4 + vec2(t * 0.22, t * 0.18)),
    fbm(q * 1.4 + vec2(-t * 0.16, t * 0.24) + 4.1)
  );
  q += (w1 - 0.5) * 0.72;
  float f = fbm(q * 2.1 + vec2(0.0, t * 0.12));
  float g = fbm(q * 4.6 - vec2(t * 0.2, 0.0));
  vec3 col = mix(u_c1, u_c2, smoothstep(0.28, 0.72, f));
  return mix(col, u_c3, pow(smoothstep(0.42, 0.9, g), 1.4));
}

void main() {
  vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  uv.x *= aspect;

  float radius = 0.94;
  vec2 p = uv / radius;
  float r2 = dot(p, p);
  float edge = 1.0 - smoothstep(0.985, 1.012, sqrt(max(r2, 0.0)));
  if (edge <= 0.001) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float z = sqrt(max(1.0 - r2, 0.0));
  vec3 n = normalize(vec3(p, z));

  vec2 look = u_look;
  float lm = length(look);
  if (lm > 1.0) look /= lm;

  vec3 right = orient(vec3(1.0, 0.0, 0.0), look);
  vec3 up = orient(vec3(0.0, 1.0, 0.0), look);
  vec3 eL = orient(normalize(vec3(-0.32, 0.08, 1.0)), look);
  vec3 eR = orient(normalize(vec3(0.32, 0.08, 1.0)), look);

  float halfH = mix(0.128, 0.012, u_blink);
  float rad = mix(0.054, 0.062, u_blink);
  float eyes = max(
    eyeMask(n, eL, right, up, halfH, rad),
    eyeMask(n, eR, right, up, halfH, rad)
  );

  vec3 body = u_mode > 0.5 ? wash(n, u_time * u_speed) : u_body;
  vec3 col = mix(body, u_eye, clamp(eyes, 0.0, 1.0));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), edge);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function createLiveOrb(canvas, initialOptions = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new Error('LiveOrb requires a valid HTMLCanvasElement');
  }

  let opts = {
    variant: 'webgl',
    interactive: true,
    blink: true,
    speed: 1.0,
    ...initialOptions,
  };

  let targetLook = { x: 0, y: 0 };
  let currentLook = { x: 0, y: 0 };
  let forcedLook = null;
  let lastPointerMove = 0;
  let nextIdleTime = 0;
  let idleTarget = { x: 0, y: 0 };

  let blinkAmount = 0;
  let blinkState = 0; // 0 = open, 1 = closing, 2 = opening
  let nextBlinkTime = performance.now() + 1800 + Math.random() * 2600;

  let rafId = 0;
  let destroyed = false;
  const startTime = performance.now();

  let gl = null;
  let program = null;
  let uniforms = null;
  let buffer = null;
  let ctx2d = null;

  try {
    gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false }) ||
         canvas.getContext('experimental-webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
  } catch {
    gl = null;
  }

  if (gl) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
    if (vs && fs) {
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.useProgram(program);
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
          gl.STATIC_DRAW
        );
        const posLoc = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        uniforms = {
          resolution: gl.getUniformLocation(program, 'u_resolution'),
          time: gl.getUniformLocation(program, 'u_time'),
          speed: gl.getUniformLocation(program, 'u_speed'),
          look: gl.getUniformLocation(program, 'u_look'),
          blink: gl.getUniformLocation(program, 'u_blink'),
          mode: gl.getUniformLocation(program, 'u_mode'),
          body: gl.getUniformLocation(program, 'u_body'),
          eye: gl.getUniformLocation(program, 'u_eye'),
          c1: gl.getUniformLocation(program, 'u_c1'),
          c2: gl.getUniformLocation(program, 'u_c2'),
          c3: gl.getUniformLocation(program, 'u_c3'),
        };
      } else {
        gl = null;
      }
    } else {
      gl = null;
    }
  }

  if (!gl) {
    try {
      ctx2d = canvas.getContext('2d');
    } catch {
      ctx2d = null;
    }
  }

  function resize() {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round((rect.width || canvas.width || 240) * dpr));
    const height = Math.max(1, Math.round((rect.height || canvas.height || 240) * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    if (gl) {
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
  }

  function onPointerMove(event) {
    if (!opts.interactive || forcedLook) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const radius = Math.max(rect.width, rect.height, 220) * 1.35;
    const dx = (event.clientX - cx) / radius;
    const dy = (event.clientY - cy) / radius;
    const mag = Math.hypot(dx, dy);
    const scale = mag > 1 ? 1 / mag : 1;
    targetLook.x = dx * scale * 0.85;
    targetLook.y = dy * scale * 0.85;
    lastPointerMove = performance.now();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('resize', resize, { passive: true });
  }

  function triggerBlink() {
    blinkState = 1;
  }

  function render2DFallback(cfg) {
    if (!ctx2d) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx2d.clearRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const r = Math.min(w, h) * 0.47;

    ctx2d.save();
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
    if (cfg.mode > 0.5) {
      const grad = ctx2d.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      grad.addColorStop(0, cfg.colors[0]);
      grad.addColorStop(0.5, cfg.colors[1]);
      grad.addColorStop(1, cfg.colors[2]);
      ctx2d.fillStyle = grad;
    } else {
      ctx2d.fillStyle = cfg.color;
    }
    ctx2d.fill();

    // Draw capsule eyes
    const offsetX = currentLook.x * r * 0.34;
    const offsetY = currentLook.y * r * 0.3;
    const eyeSpacing = r * 0.29;
    const eyeW = r * 0.115;
    const eyeH = Math.max(r * 0.04, r * 0.34 * (1 - blinkAmount * 0.88));

    ctx2d.fillStyle = cfg.eyeColor;
    for (const dir of [-1, 1]) {
      const ex = cx + dir * eyeSpacing + offsetX;
      const ey = cy - r * 0.04 + offsetY;
      ctx2d.beginPath();
      ctx2d.roundRect(ex - eyeW, ey - eyeH, eyeW * 2, eyeH * 2, eyeW);
      ctx2d.fill();
    }
    ctx2d.restore();
  }

  function frame(now) {
    if (destroyed) return;
    resize();

    // Idle gaze when mouse hasn't moved recently
    if (forcedLook) {
      targetLook.x = forcedLook.x;
      targetLook.y = forcedLook.y;
    } else if (!opts.interactive || now - lastPointerMove > 2600) {
      if (now > nextIdleTime) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 0.42;
        idleTarget = {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist * 0.65,
        };
        nextIdleTime = now + 1400 + Math.random() * 2200;
      }
      targetLook.x = idleTarget.x;
      targetLook.y = idleTarget.y;
    }

    currentLook.x += (targetLook.x - currentLook.x) * 0.14;
    currentLook.y += (targetLook.y - currentLook.y) * 0.14;

    // Blink animation
    if (opts.blink && blinkState === 0 && now >= nextBlinkTime) {
      blinkState = 1;
    }
    if (blinkState === 1) {
      blinkAmount = Math.min(1, blinkAmount + 0.24);
      if (blinkAmount >= 1) blinkState = 2;
    } else if (blinkState === 2) {
      blinkAmount = Math.max(0, blinkAmount - 0.18);
      if (blinkAmount <= 0) {
        blinkState = 0;
        nextBlinkTime = now + 2200 + Math.random() * 3400;
      }
    }

    const cfg = resolveOrbConfig(opts);

    if (gl && uniforms) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.time, (now - startTime) * 0.001);
      gl.uniform1f(uniforms.speed, opts.speed ?? 1.0);
      gl.uniform2f(uniforms.look, currentLook.x, -currentLook.y);
      gl.uniform1f(uniforms.blink, forcedLook?.squint ?? blinkAmount);
      gl.uniform1f(uniforms.mode, cfg.mode);
      gl.uniform3fv(uniforms.body, hexToRgb(cfg.color));
      gl.uniform3fv(uniforms.eye, hexToRgb(cfg.eyeColor));
      gl.uniform3fv(uniforms.c1, hexToRgb(cfg.colors[0]));
      gl.uniform3fv(uniforms.c2, hexToRgb(cfg.colors[1]));
      gl.uniform3fv(uniforms.c3, hexToRgb(cfg.colors[2]));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else {
      render2DFallback(cfg);
    }

    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(frame);
    }
  }

  if (typeof requestAnimationFrame === 'function') {
    rafId = requestAnimationFrame(frame);
  }

  return {
    setOptions(nextOptions = {}) {
      opts = { ...opts, ...nextOptions };
    },
    setLook(look) {
      forcedLook = look;
    },
    blink: triggerBlink,
    destroy() {
      destroyed = true;
      if (rafId && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('resize', resize);
      }
    },
  };
}
