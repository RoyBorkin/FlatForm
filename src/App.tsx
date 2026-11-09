/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · MIT */
import { useEffect } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { TopBar } from './ui/layout/TopBar';
import { PipelineRail } from './ui/layout/PipelineRail';
import { Inspector } from './ui/layout/Inspector';
import { StatusBar } from './ui/layout/StatusBar';
import { Viewport } from './viewport/Viewport';
import { Toaster } from './ui/components/toast';
import { useTheme } from './ui/useTheme';
import { useShortcuts } from './ui/useShortcuts';
import { startEngine } from './state/engine';
import { TaskOverlay } from './ui/components/TaskOverlay';
import { useBootSplash } from './ui/useBootSplash';

export function App() {
  useTheme();
  useShortcuts();
  useEffect(() => startEngine(), []);
  useBootSplash();
  return (
    <Tooltip.Provider delayDuration={350} skipDelayDuration={200}>
      <div className="app">
        <TopBar />
        <PipelineRail />
        <Viewport />
        <Inspector />
        <StatusBar />
      </div>
      <TaskOverlay />
      <Toaster />
    </Tooltip.Provider>
  );
}
