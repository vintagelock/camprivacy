#version 300 es
precision mediump float;

uniform sampler2D u_texture;
uniform vec4 u_region;
uniform float u_pixelSize;
uniform vec2 u_resolution;

in vec2 v_uv;
out vec4 fragColor;

float ellipseMask(vec2 uv, vec4 region) {
  vec2 center = region.xy + region.zw * 0.5;
  vec2 r = region.zw * 0.5;
  vec2 d = (uv - center) / r;
  float dist = dot(d, d);
  return 1.0 - smoothstep(0.5, 1.0, dist);
}

void main() {
  float mask = ellipseMask(v_uv, u_region);
  vec4 base = texture(u_texture, v_uv);
  if (mask <= 0.0) { fragColor = base; return; }

  vec2 pixelUV = floor(v_uv * u_resolution / u_pixelSize) * u_pixelSize / u_resolution;
  fragColor = mix(base, texture(u_texture, pixelUV), mask);
}
