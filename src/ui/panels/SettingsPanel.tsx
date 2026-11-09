/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
import { RotateCcw, Moon, Sun, Monitor } from 'lucide-react';
import { useProject } from '@/state/project';
import { useUI } from '@/state/ui';
import { WORLDS, worldById, type WorldId } from '@/themes/themes';
import { GROUP_LETTERS } from '@/core/parts';
import { Button, ColorInput, Section, Segmented, SegmentedField, SwitchField } from '../components/controls';
import { isDesktop } from '@/platform/save';
import { APP_NAME, AUTHOR_EMAIL, AUTHOR_URL, COPYRIGHT, TAGLINE } from '@/brand';

export function SettingsPanel() {
  const settings = useUI((s) => s.settings);
  const setSettings = useUI((s) => s.setSettings);
  const units = useProject((s) => s.project.units);
  const update = useProject((s) => s.update);
  const world = worldById(settings.world);
  const colors = settings.layerColors[settings.world];
  return (
    <>
      <Section title="Look">
        <div className="world-list" role="radiogroup" aria-label="Interface style">
          {WORLDS.map((w) => {
            const mode = settings.mode === 'light' ? 'light' : 'dark';
            const [ground, panel, accent, text] = w.preview[mode];
            return (
              <button
                key={w.id}
                type="button"
                role="radio"
                aria-checked={settings.world === w.id}
                className="world-card"
                onClick={() => setSettings((s) => void (s.world = w.id as WorldId))}
              >
                <span className="world-card__preview" style={{ background: ground }} aria-hidden>
                  <span style={{ background: panel }} />
                  <span style={{ background: accent }} />
                  {settings.layerColors[w.id].slice(0, 2).map((c) => (
                    <span key={c} className="world-card__line" style={{ background: c }} />
                  ))}
                  <span className="world-card__text" style={{ background: text }} />
                </span>
                <span className="world-card__name">{w.name}</span>
                <span className="world-card__blurb">{w.blurb}</span>
              </button>
            );
          })}
        </div>
        <div className="field">
          <span className="field__label">Mode</span>
          <Segmented
            ariaLabel="Colour mode"
            size="sm"
            value={settings.mode}
            onChange={(v) => setSettings((s) => void (s.mode = v))}
            options={[
              { value: 'dark', label: 'Dark', icon: <Moon size={13} aria-hidden /> },
              { value: 'light', label: 'Light', icon: <Sun size={13} aria-hidden /> },
              { value: 'system', label: 'System', icon: <Monitor size={13} aria-hidden /> },
            ]}
          />
        </div>
      </Section>
      <Section
        title={`Part & layer colours · ${world.name}`}
        aside={
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw size={13} aria-hidden />}
            onClick={() => setSettings((s) => void (s.layerColors[s.world] = [...worldById(s.world).layerColors]))}
          >
            Reset
          </Button>
        }
      >
        <p className="muted small">Used for lattice layers, rib and profile families, bar and triangle types and other part groups, in the 3D view, on the sheets and in exported guides. Each style keeps its own set.</p>
        <div className="color-list">
          {colors.map((c, i) => (
            <div className="color-row" key={i}>
              <span className="color-row__label">{i < 4 ? `Layer ${GROUP_LETTERS[i]}` : `Group ${GROUP_LETTERS[i]}`}</span>
              <ColorInput label={`Colour for group ${GROUP_LETTERS[i]}`} value={c} onChange={(v) => setSettings((s) => void (s.layerColors[s.world][i] = v))} />
            </div>
          ))}
        </div>
        <SegmentedField
          label="Colour parts by"
          value={settings.colorBy}
          onChange={(v) => setSettings((s) => void (s.colorBy = v))}
          options={[
            { value: 'layer', label: 'Layer' },
            { value: 'material', label: 'Material' },
          ]}
        />
      </Section>
      <Section title="Units & behaviour">
        <SegmentedField
          label="Units"
          hint="How lengths are shown and typed. Files and exports stay in millimetres, the cutting standard."
          value={units}
          onChange={(v) => update((p) => void (p.units = v))}
          options={[
            { value: 'mm', label: 'mm' },
            { value: 'cm', label: 'cm' },
            { value: 'm', label: 'm' },
            { value: 'in', label: 'inch' },
          ]}
        />
        <SwitchField label="Recompute automatically" hint="Off: changes wait until you press Update in the status bar." checked={settings.autoCompute} onChange={(v) => setSettings((s) => void (s.autoCompute = v))} />
        <SwitchField label="Floor grid" checked={settings.showGrid} onChange={(v) => setSettings((s) => void (s.showGrid = v))} />
        <SwitchField label="Shadows" checked={settings.showShadows} onChange={(v) => setSettings((s) => void (s.showShadows = v))} />
      </Section>
      <Section title="About" defaultOpen={false}>
        <div className="about">
          <p className="about__name">
            {APP_NAME} <span className="muted">{__APP_VERSION__} · {isDesktop() ? 'desktop' : 'web'}</span>
          </p>
          <p className="small">{TAGLINE}: slice a 3D model into flat parts for laser cutting, CNC routing or flat 3D printing, then build it back.</p>
          <p className="small">
            {COPYRIGHT} ·{' '}
            <a href={`mailto:${AUTHOR_EMAIL}`}>{AUTHOR_EMAIL}</a> ·{' '}
            <a href={AUTHOR_URL} target="_blank" rel="noreferrer">
              {AUTHOR_URL.replace(/^https:\/\//, '').replace(/\/$/, '')}
            </a>
          </p>
          <p className="muted small">
            All rights reserved. Geometry runs locally on your machine; nothing is uploaded. Built with open-source components:{' '}
            <a href="./THIRD-PARTY-NOTICES.txt" target="_blank" rel="noreferrer">
              notices
            </a>
            .
          </p>
        </div>
        <p className="muted small">Shortcuts: Ctrl/⌘ Z undo, Ctrl/⌘ Shift Z redo, Ctrl/⌘ S save, Ctrl/⌘ O open, 1–7 jump to a step, F frame the view.</p>
      </Section>
    </>
  );
}
