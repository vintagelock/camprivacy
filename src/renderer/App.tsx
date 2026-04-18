import { AppShell, Box, MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import { useEffect, useState } from 'react';

import { DEFAULT_EFFECT, type EffectConfig } from '../shared/types';
import { Controls } from './components/Controls';
import { VideoFeed } from './components/VideoFeed';

const theme = createTheme({
  primaryColor: 'violet',
  defaultRadius: 'md',
});

export default function App() {
  const [effect, setEffect] = useState<EffectConfig>(DEFAULT_EFFECT);
  const [enabled, setEnabled] = useState(true);
  const [mirrored, setMirrored] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    async function loadDevices() {
      // Trigger the camera permission prompt, then immediately release the
      // stream — VideoFeed will open its own stream once deviceId is set.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        // Permission denied or no camera — enumeration may still return devices
      }

      const all = await navigator.mediaDevices.enumerateDevices();
      const cameras = all.filter((d) => d.kind === 'videoinput');
      setDevices(cameras);
      // Only set on first load; use functional update to avoid stale closure
      setDeviceId((prev) => prev ?? cameras[0]?.deviceId ?? null);
    }

    loadDevices();
  }, []);

  const patchEffect = (patch: Partial<EffectConfig>) => setEffect((prev) => ({ ...prev, ...patch }));

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <AppShell navbar={{ width: 280, breakpoint: 'xs' }} padding={0}>
        <AppShell.Navbar style={{ background: '#141417', borderRight: '1px solid #2a2a35' }}>
          <Controls
            effect={effect}
            enabled={enabled}
            deviceId={deviceId}
            devices={devices}
            onChange={patchEffect}
            onEnabledChange={setEnabled}
            mirrored={mirrored}
            onMirroredChange={setMirrored}
            showDebug={showDebug}
            onShowDebugChange={setShowDebug}
            onDeviceChange={setDeviceId}
          />
        </AppShell.Navbar>

        <AppShell.Main
          style={{
            background: '#0d0d12',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <Box style={{ width: '100%', maxWidth: 1200 }}>
            <VideoFeed
              effect={effect}
              enabled={enabled}
              mirrored={mirrored}
              showDebug={showDebug}
              deviceId={deviceId}
            />
          </Box>
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}
