import {
  ActionIcon,
  Divider,
  Group,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';

import type { EffectConfig, EffectType } from '../../shared/types';
import { PRESET_EMOJIS } from '../../shared/types';
import defaultCustomShader from '../shaders/custom.frag.glsl?raw';

interface Props {
  effect: EffectConfig;
  enabled: boolean;
  mirrored: boolean;
  showDebug: boolean;
  deviceId: string | null;
  devices: MediaDeviceInfo[];
  onChange: (patch: Partial<EffectConfig>) => void;
  onEnabledChange: (v: boolean) => void;
  onMirroredChange: (v: boolean) => void;
  onShowDebugChange: (v: boolean) => void;
  onDeviceChange: (id: string) => void;
}

const EFFECT_OPTIONS: { label: string; value: EffectType }[] = [
  { label: 'None', value: 'none' },
  { label: 'Blur', value: 'blur' },
  { label: 'Pixelate', value: 'pixelate' },
  { label: 'Emoji', value: 'emoji' },
  { label: 'Shader', value: 'shader' },
];

export function Controls({
  effect,
  enabled,
  mirrored,
  showDebug,
  deviceId,
  devices,
  onChange,
  onEnabledChange,
  onMirroredChange,
  onShowDebugChange,
  onDeviceChange,
}: Props) {
  return (
    <Stack gap="md" p="md" style={{ height: '100%', overflowY: 'auto' }}>
      <Title order={5} c="dimmed">
        CamPrivacy
      </Title>

      <Divider />

      <Select
        label="Camera"
        size="xs"
        data={devices.map((d) => ({ value: d.deviceId, label: d.label || d.deviceId }))}
        value={deviceId}
        onChange={(v) => v && onDeviceChange(v)}
      />

      <Switch label="Mirror video" checked={mirrored} onChange={(e) => onMirroredChange(e.currentTarget.checked)} />
      <Switch
        label="Debug bounding boxes"
        checked={showDebug}
        onChange={(e) => onShowDebugChange(e.currentTarget.checked)}
      />

      <Switch
        label="Enable face obscuring"
        checked={enabled}
        onChange={(e) => onEnabledChange(e.currentTarget.checked)}
      />

      <Divider label="Effect" labelPosition="left" />

      <SegmentedControl
        size="xs"
        fullWidth
        value={effect.type}
        onChange={(v) => onChange({ type: v as EffectType })}
        data={EFFECT_OPTIONS}
      />

      <Slider
        label="Face padding"
        min={0}
        max={0.5}
        step={0.01}
        value={effect.padding}
        onChange={(v) => onChange({ padding: v })}
        size="xs"
      />

      {effect.type === 'blur' && (
        <>
          <Text size="xs" c="dimmed">
            Blur radius
          </Text>
          <Slider min={1} max={50} value={effect.blurRadius} onChange={(v) => onChange({ blurRadius: v })} size="xs" />
        </>
      )}

      {effect.type === 'pixelate' && (
        <>
          <Text size="xs" c="dimmed">
            Pixel size
          </Text>
          <Slider min={4} max={64} value={effect.pixelSize} onChange={(v) => onChange({ pixelSize: v })} size="xs" />
        </>
      )}

      {effect.type === 'emoji' && (
        <>
          <Text size="xs" c="dimmed">
            Emoji
          </Text>
          <Group gap={6}>
            {PRESET_EMOJIS.map((e) => (
              <Tooltip key={e} label={e}>
                <ActionIcon
                  size="lg"
                  variant={effect.emoji === e ? 'filled' : 'default'}
                  onClick={() => onChange({ emoji: e })}
                  style={{ fontSize: 20 }}
                >
                  {e}
                </ActionIcon>
              </Tooltip>
            ))}
          </Group>
        </>
      )}

      {effect.type === 'shader' && (
        <>
          <Text size="xs" c="dimmed">
            GLSL fragment shader (same uniforms as built-in shaders)
          </Text>
          <Textarea
            value={effect.customShader || defaultCustomShader}
            onChange={(e) => onChange({ customShader: e.currentTarget.value })}
            autosize
            minRows={8}
            maxRows={20}
            styles={{ input: { fontFamily: 'monospace', fontSize: 11 } }}
          />
        </>
      )}
    </Stack>
  );
}
