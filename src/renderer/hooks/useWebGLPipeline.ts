import { useCallback, useEffect, useRef } from 'react';

import type { EffectConfig, FaceRegion } from '../../shared/types';
import blurFrag from '../shaders/blur.frag.glsl?raw';
import emojiFrag from '../shaders/emoji.frag.glsl?raw';
import passthroughFrag from '../shaders/passthrough.frag.glsl?raw';
import passthroughVert from '../shaders/passthrough.vert.glsl?raw';
import pixelateFrag from '../shaders/pixelate.frag.glsl?raw';

// ---------------------------------------------------------------------------
// GL utilities
// ---------------------------------------------------------------------------

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile failed');
  return shader;
}

// Wraps a WebGL program with a uniform location cache so we never call
// getUniformLocation more than once per name per program.
interface GLProg {
  handle: WebGLProgram;
  set1f(name: string, v: number): void;
  set1i(name: string, v: number): void;
  set2f(name: string, x: number, y: number): void;
  set4f(name: string, x: number, y: number, z: number, w: number): void;
}

function buildProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): GLProg {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(prog) ?? 'Program link failed');

  const locs = new Map<string, WebGLUniformLocation | null>();
  const loc = (name: string) => {
    if (!locs.has(name)) locs.set(name, gl.getUniformLocation(prog, name));
    return locs.get(name)!;
  };

  return {
    handle: prog,
    set1f: (name, v) => gl.uniform1f(loc(name), v),
    set1i: (name, v) => gl.uniform1i(loc(name), v),
    set2f: (name, x, y) => gl.uniform2f(loc(name), x, y),
    set4f: (name, x, y, z, w) => gl.uniform4f(loc(name), x, y, z, w),
  };
}

function makeQuadVAO(gl: WebGL2RenderingContext, prog: GLProg): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog.handle, 'a_position');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

interface FBO {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
}

function makeFBO(gl: WebGL2RenderingContext, w: number, h: number): FBO {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex };
}

function destroyFBO(gl: WebGL2RenderingContext, { fbo, tex }: FBO) {
  gl.deleteFramebuffer(fbo);
  gl.deleteTexture(tex);
}

function padRegion(face: FaceRegion, padding: number): FaceRegion {
  const pw = face.width * padding;
  const ph = face.height * padding;
  return {
    x: Math.max(0, face.x - pw),
    y: Math.max(0, face.y - ph),
    width: Math.min(1 - face.x + pw, face.width + pw * 2),
    height: Math.min(1 - face.y + ph, face.height + ph * 2),
  };
}

// MediaPipe gives bounding boxes with Y=0 at the image top.
// Our GL textures are flipped via UNPACK_FLIP_Y_WEBGL so Y=0 is at the bottom.
function toGLRegion(r: FaceRegion): [number, number, number, number] {
  return [r.x, 1 - r.y - r.height, r.width, r.height];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface Programs {
  passthrough: GLProg;
  blur: GLProg;
  pixelate: GLProg;
  emoji: GLProg;
  custom: GLProg | null;
}

export function useWebGLPipeline(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  videoRef: React.RefObject<HTMLVideoElement | null>,
) {
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programsRef = useRef<Programs | null>(null);
  const facesRef = useRef<FaceRegion[]>([]);
  const smoothedFacesRef = useRef<FaceRegion[]>([]);
  const effectRef = useRef<EffectConfig | null>(null);
  const emojiTexCache = useRef<Map<string, WebGLTexture>>(new Map());

  const updateFaces = useCallback((faces: FaceRegion[]) => {
    facesRef.current = faces;
  }, []);

  const updateEffect = useCallback((effect: EffectConfig) => {
    effectRef.current = effect;
    const gl = glRef.current;
    if (!gl || !programsRef.current) return;
    if (effect.type === 'shader' && effect.customShader) {
      try {
        programsRef.current.custom = buildProgram(gl, passthroughVert, effect.customShader);
      } catch (err) {
        console.warn('Custom shader error:', err);
      }
    }
  }, []);

  useEffect(() => {
    const canvasOrNull = canvasRef.current;
    if (!canvasOrNull) return;
    const canvasEl = canvasOrNull;

    const glOrNull = canvasEl.getContext('webgl2', { antialias: false, alpha: false });
    if (!glOrNull) {
      console.error('WebGL2 not available');
      return;
    }
    // Re-bind to a new const so TypeScript treats gl as non-null in all closures below.
    const gl = glOrNull;
    glRef.current = gl;
    emojiTexCache.current.clear(); // textures belong to the GL context; clear on (re)init

    const passthrough = buildProgram(gl, passthroughVert, passthroughFrag);
    const blur = buildProgram(gl, passthroughVert, blurFrag);
    const pixelate = buildProgram(gl, passthroughVert, pixelateFrag);
    const emoji = buildProgram(gl, passthroughVert, emojiFrag);
    programsRef.current = { passthrough, blur, pixelate, emoji, custom: null };

    const vao = makeQuadVAO(gl, passthrough);
    const startTime = performance.now();

    const videoTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, videoTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    let fbo1 = makeFBO(gl, 1, 1);
    let fbo2 = makeFBO(gl, 1, 1);
    let lastW = 0;
    let lastH = 0;

    // Render an emoji to a GL texture and cache it. The OffscreenCanvas has
    // Y=0 at the top, same as video, so we flip on upload.
    function getEmojiTex(char: string): WebGLTexture {
      const cached = emojiTexCache.current.get(char);
      if (cached) return cached;

      const size = 128;
      const offscreen = new OffscreenCanvas(size, size);
      const ctx = offscreen.getContext('2d')!;
      ctx.font = `${Math.floor(size * 0.8)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(char, size / 2, size / 2);

      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offscreen);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      emojiTexCache.current.set(char, tex);
      return tex;
    }

    // Draw a full-screen quad sampling from tex into the currently bound FBO.
    function blit(prog: GLProg, tex: WebGLTexture) {
      gl.useProgram(prog.handle);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      prog.set1i('u_texture', 0);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
    }

    // Two-pass Gaussian blur for one face region. Reads fbo1, writes result back to fbo1.
    function applyBlur(region: FaceRegion, radius: number, w: number, h: number) {
      gl.useProgram(blur.handle);
      blur.set4f('u_region', ...toGLRegion(region));
      blur.set1f('u_radius', radius);
      blur.set2f('u_resolution', w, h);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo2.fbo);
      blur.set1i('u_pass', 0);
      blit(blur, fbo1.tex);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo1.fbo);
      blur.set1i('u_pass', 1);
      blit(blur, fbo2.tex);
    }

    function applyPixelate(region: FaceRegion, pixelSize: number, w: number, h: number) {
      gl.useProgram(pixelate.handle);
      pixelate.set4f('u_region', ...toGLRegion(region));
      pixelate.set1f('u_pixelSize', pixelSize);
      pixelate.set2f('u_resolution', w, h);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo2.fbo);
      blit(pixelate, fbo1.tex);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo1.fbo);
      blit(passthrough, fbo2.tex);
    }

    function applyEmoji(region: FaceRegion, emojiChar: string) {
      const emojiTex = getEmojiTex(emojiChar);
      gl.useProgram(emoji.handle);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fbo1.tex);
      emoji.set1i('u_texture', 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, emojiTex);
      emoji.set1i('u_emoji', 1);
      emoji.set4f('u_region', ...toGLRegion(region));

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo2.fbo);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo1.fbo);
      blit(passthrough, fbo2.tex);
    }

    function applyCustomShader(prog: GLProg, region: FaceRegion, w: number, h: number) {
      gl.useProgram(prog.handle);
      prog.set4f('u_region', ...toGLRegion(region));
      prog.set2f('u_resolution', w, h);
      prog.set1f('u_time', (performance.now() - startTime) / 1000);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo2.fbo);
      blit(prog, fbo1.tex);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo1.fbo);
      blit(passthrough, fbo2.tex);
    }

    let animId = 0;

    function renderFrame() {
      animId = requestAnimationFrame(renderFrame);

      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;

      if (w !== lastW || h !== lastH) {
        canvasEl.width = w;
        canvasEl.height = h;
        gl.viewport(0, 0, w, h);
        destroyFBO(gl, fbo1);
        destroyFBO(gl, fbo2);
        fbo1 = makeFBO(gl, w, h);
        fbo2 = makeFBO(gl, w, h);
        lastW = w;
        lastH = h;
      }

      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.bindTexture(gl.TEXTURE_2D, videoTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

      const effect = effectRef.current;

      // Lerp smoothed face positions toward the latest detected positions each
      // render frame. This eliminates jitter from the 15fps detection cadence.
      const LERP = 0.35;
      const detected = facesRef.current;
      const smoothed = smoothedFacesRef.current;

      if (detected.length !== smoothed.length) {
        // Count changed — snap immediately to avoid orphaned boxes
        smoothedFacesRef.current = detected.map((f) => ({ ...f }));
      } else {
        for (let i = 0; i < detected.length; i++) {
          const d = detected[i];
          const s = smoothed[i];
          smoothed[i] = {
            x: s.x + (d.x - s.x) * LERP,
            y: s.y + (d.y - s.y) * LERP,
            width: s.width + (d.width - s.width) * LERP,
            height: s.height + (d.height - s.height) * LERP,
          };
        }
      }

      const faces = smoothedFacesRef.current;

      if (!effect || effect.type === 'none' || faces.length === 0) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        blit(passthrough, videoTex);
        return;
      }

      // Seed fbo1 with the raw video frame. Each per-face effect reads from
      // fbo1 and writes back to fbo1 via fbo2 as scratch, so effects accumulate.
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo1.fbo);
      blit(passthrough, videoTex);

      for (const face of faces) {
        const region = padRegion(face, effect.padding);

        switch (effect.type) {
          case 'blur':
            applyBlur(region, effect.blurRadius, w, h);
            break;
          case 'pixelate':
            applyPixelate(region, effect.pixelSize, w, h);
            break;
          case 'emoji':
            applyEmoji(region, effect.emoji);
            break;
          case 'shader':
            if (programsRef.current?.custom) applyCustomShader(programsRef.current.custom, region, w, h);
            break;
        }
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      blit(passthrough, fbo1.tex);
    }

    animId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animId);
      destroyFBO(gl, fbo1);
      destroyFBO(gl, fbo2);
      gl.deleteTexture(videoTex);
      gl.deleteVertexArray(vao);
      glRef.current = null;
      programsRef.current = null;
    };
  }, [canvasRef, videoRef]);

  return { updateFaces, updateEffect };
}
