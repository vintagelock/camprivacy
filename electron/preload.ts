// Preload is intentionally minimal for POC.
// Future: expose virtual camera IPC via contextBridge here.
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('camprivacy', {
  version: process.env.npm_package_version ?? '0.1.0',
});
