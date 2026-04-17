#version 300 es
precision mediump float;

uniform sampler2D u_texture;  // video frame
uniform sampler2D u_emoji;    // emoji texture
uniform vec4 u_region;        // face ellipse region (x,y,w,h normalised)

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

  // Map v_uv into the region's local [0,1] space to sample the emoji
  vec2 local = (v_uv - u_region.xy) / u_region.zw;
  vec4 em = texture(u_emoji, local);

  fragColor = mix(base, em, em.a * mask);
}
