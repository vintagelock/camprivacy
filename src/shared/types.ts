export type EffectType = 'none' | 'blur' | 'pixelate' | 'emoji' | 'shader';

export interface FaceRegion {
  x: number; // 0-1 normalized
  y: number;
  width: number;
  height: number;
}

export interface EffectConfig {
  type: EffectType;
  blurRadius: number; // 1-50
  pixelSize: number; // 4-64
  emoji: string; // single emoji char
  customShader: string; // GLSL fragment source
  padding: number; // 0-1, extra padding around face box
}

export const DEFAULT_EFFECT: EffectConfig = {
  type: 'blur',
  blurRadius: 20,
  pixelSize: 16,
  emoji: '😀',
  customShader: '',
  padding: 0.15,
};

export const PRESET_EMOJIS = ['😀', '🙈', '💀', '👻', '🤖', '🎭', '🙂', '😎'];

export interface DetectionResult {
  faces: FaceRegion[];
  frameMs: number;
}
