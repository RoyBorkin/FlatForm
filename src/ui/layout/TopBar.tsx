/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { LogoMark } from '../components/LogoMark';
import { Box, Download, Grid2x2, LayoutPanelTop, Redo2, Undo2, FolderOpen, Save } from 'lucide-react';
import { useStore } from 'zustand';
import { useProject, undo, redo } from '@/state/project';
import { useUI, type ViewId } from '@/state/ui';
import { IconButton, Segmented, Button } from '../components/controls';
import { saveProjectFile, openProjectFile } from '@/io/projectFile';

export function TopBar() {
  const name = useProject((s) => s.project.name);
  const update = useProject((s) => s.update);
  const view = useUI((s) => s.view);
  const setView = useUI((s) => s.setView);
  const setStep = useUI((s) => s.setStep);
  const canUndo = useStore(useProject.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useProject.temporal, (s) => s.futureStates.length > 0);
  return (
    <header className="topbar">
      <div className="topbar__left">
        <Logo />
        <input
          className="topbar__name"
          value={name}
          aria-label="Project name"
          onChange={(e) => {
            const v = e.currentTarget.value;
            update((p) => {
              p.name = v;
            });
          }}
        />
      </div>
      <div className="topbar__center">
        <Segmented<ViewId>
          ariaLabel="View"
          value={view}
          onChange={setView}
          options={[
            { value: '3d', label: '3D', icon: <Box size={14} aria-hidden /> },
            { value: 'flat', label: 'Flat parts', icon: <LayoutPanelTop size={14} aria-hidden /> },
            { value: 'sheets', label: 'Sheets', icon: <Grid2x2 size={14} aria-hidden /> },
          ]}
        />
      </div>
      <div className="topbar__right">
        <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <Undo2 size={16} aria-hidden />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
          <Redo2 size={16} aria-hidden />
        </IconButton>
        <span className="topbar__sep" aria-hidden />
        <IconButton label="Open project (Ctrl+O)" onClick={openProjectFile}>
          <FolderOpen size={16} aria-hidden />
        </IconButton>
        <IconButton label="Save project (Ctrl+S)" onClick={saveProjectFile}>
          <Save size={16} aria-hidden />
        </IconButton>
        <Button variant="primary" icon={<Download size={15} aria-hidden />} onClick={() => setStep('export')}>
          Export
        </Button>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <div className="logo" aria-label="FlatForm">
      <LogoMark />
      <span className="logo__word">FlatForm</span>
    </div>
  );
}
