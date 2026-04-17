#version 300 es
precision mediump float;

uniform sampler2D u_texture;
uniform vec4 u_region;
uniform vec2 u_resolution;
uniform float u_time;

in vec2 v_uv;
out vec4 fragColor;

float ellipseMask(vec2 uv, vec4 region) {
  vec2 center = region.xy + region.zw * 0.5;
  vec2 r = region.zw * 0.5;
  vec2 d = (uv - center) / r;
  return 1.0 - smoothstep(0.5, 1.0, dot(d, d));
}

void main() {
  float mask = ellipseMask(v_uv, u_region);
  vec4 base = texture(u_texture, v_uv);
  if (mask <= 0.0) { fragColor = base; return; }

  float t = u_time * 2.0;
  vec3 tint = vec3(0.5 + 0.5 * sin(t), 0.5 + 0.5 * sin(t + 2.094), 0.5 + 0.5 * sin(t + 4.189));
  fragColor = mix(base, vec4(base.rgb * tint, base.a), mask);
}
