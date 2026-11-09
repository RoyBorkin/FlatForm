/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { useEffect } from 'react';
import { undo, redo } from '@/state/project';
import { useUI, type StepId } from '@/state/ui';
import { saveProjectFile, openProjectFile } from '@/io/projectFile';

const STEPS: StepId[] = ['shape', 'surface', 'method', 'joinery', 'material', 'nest', 'export'];

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = !!t?.closest('input, textarea, select, [contenteditable="true"]');
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveProjectFile();
      } else if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        openProjectFile();
      } else if (!mod && !typing && /^[1-7]$/.test(e.key)) {
        useUI.getState().setStep(STEPS[Number(e.key) - 1]);
      } else if (e.key === 'Escape' && !typing) {
        useUI.getState().set({ selectedPart: null, selectedNode: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
