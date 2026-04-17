#version 300 es
precision mediump float;

uniform sampler2D u_texture;
uniform vec4 u_region;
uniform float u_radius;
uniform vec2 u_resolution;
uniform int u_pass;

in vec2 v_uv;
out vec4 fragColor;

float ellipseMask(vec2 uv, vec4 region) {
  vec2 center = region.xy + region.zw * 0.5;
  vec2 r      = region.zw * 0.5;
  vec2 d      = (uv - center) / r;
  return 1.0 - smoothstep(0.5, 1.0, dot(d, d));
}

vec4 gaussianBlur(sampler2D tex, vec2 uv, vec2 dir) {
  // sigma = radius * 0.4; precompute sigma^2 outside the loop
  float sigma2 = pow(u_radius * 0.4, 2.0);
  vec4  color  = vec4(0.0);
  float total  = 0.0;
  int   r      = int(u_radius);

  for (int i = -r; i <= r; i++) {
    float fi     = float(i);
    float weight = exp(-0.5 * fi * fi / sigma2);
    color += texture(tex, uv + dir * fi) * weight;
    total += weight;
  }
  return color / total;
}

void main() {
  float mask = ellipseMask(v_uv, u_region);
  if (mask <= 0.0) {
    fragColor = texture(u_texture, v_uv);
    return;
  }

  vec2 texel = 1.0 / u_resolution;
  vec4 blurred = u_pass == 0
    ? gaussianBlur(u_texture, v_uv, vec2(texel.x, 0.0))
    : gaussianBlur(u_texture, v_uv, vec2(0.0, texel.y));

  fragColor = mix(texture(u_texture, v_uv), blurred, mask);
}
