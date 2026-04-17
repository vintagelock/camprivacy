/// <reference types="vite/client" />

// Allow importing GLSL files as raw strings
declare module '*.vert.glsl?raw' {
  const src: string;
  export default src;
}
declare module '*.frag.glsl?raw' {
  const src: string;
  export default src;
}
declare module '*.glsl?raw' {
  const src: string;
  export default src;
}
