/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Form controls for the inspector. Every control is a standard, accessible
 * widget (Radix primitives underneath) with a visible label. Length values
 * are stored in mm and shown in the project's units.
 */
import * as RSlider from '@radix-ui/react-slider';
import * as RSelect from '@radix-ui/react-select';
import * as RSwitch from '@radix-ui/react-switch';
import * as RToggle from '@radix-ui/react-toggle-group';
import * as RTooltip from '@radix-ui/react-tooltip';
import { Check, ChevronDown, ChevronRight, Info, TriangleAlert, CircleAlert } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useProject } from '@/state/project';
import type { Units } from '@/core/params';

// ------------------------------------------------------------------ units

export const UNIT_MM: Record<Units, number> = { mm: 1, cm: 10, m: 1000, in: 25.4 };
const UNIT_DIGITS: Record<Units, number> = { mm: 1, cm: 2, m: 3, in: 2 };

/** Lengths are stored in mm; this converts for display in the chosen unit. */
export function useUnits() {
  const unit = useProject((s) => s.project.units) ?? 'mm';
  const k = UNIT_MM[unit] ?? 1;
  return {
    unit,
    k,
    toDisplay: (mm: number) => mm / k,
    fromDisplay: (v: number) => v * k,
    fmt: (mm: number, digits = UNIT_DIGITS[unit], withUnit = true) => `${(mm / k).toFixed(digits)}${withUnit ? ` ${unit}` : ''}`,
    /** Areas: mm² shown as unit². */
    fmtArea: (mm2: number, digits = UNIT_DIGITS[unit]) => `${(mm2 / (k * k)).toFixed(digits)} ${unit}²`,
  };
}

const roundTo = (v: number, step: number) => {
  const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return Number(v.toFixed(Math.min(6, d)));
};

// ------------------------------------------------------------------ layout

export function Field({ label, hint, children, htmlFor, inline }: { label: string; hint?: string; children: ReactNode; htmlFor?: string; inline?: boolean }) {
  return (
    <div className={inline ? 'field field--inline' : 'field'}>
      <div className="field__head">
        <label className="field__label" htmlFor={htmlFor}>
          {label}
        </label>
        {hint && <Hint text={hint} />}
      </div>
      <div className="field__control">{children}</div>
    </div>
  );
}

export function Hint({ text }: { text: string }) {
  return (
    <RTooltip.Root delayDuration={250}>
      <RTooltip.Trigger asChild>
        <button type="button" className="hint" aria-label={text}>
          <Info size={13} aria-hidden />
        </button>
      </RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content className="tooltip" side="top" sideOffset={6} collisionPadding={8}>
          {text}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export function Tip({ label, children, side = 'bottom' }: { label: string; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <RTooltip.Root delayDuration={350}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content className="tooltip" side={side} sideOffset={6} collisionPadding={8}>
          {label}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export function Section({ title, children, defaultOpen = true, aside }: { title: string; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="section" data-open={open}>
      <div className="section__head">
        <button type="button" className="section__toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
          <span>{title}</span>
        </button>
        {aside}
      </div>
      {open && (
        <div className="section__body" id={id}>
          {children}
        </div>
      )}
    </section>
  );
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'danger'; children: ReactNode }) {
  const Icon = tone === 'info' ? Info : tone === 'warn' ? TriangleAlert : CircleAlert;
  return (
    <div className={`callout callout--${tone}`} role={tone === 'info' ? 'note' : 'status'}>
      <Icon size={14} aria-hidden className="callout__icon" />
      <div>{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------ number

interface NumberProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** 'len' converts mm ↔ display units; 'deg', '%', 'x' or any suffix are shown as-is. */
  unit?: 'len' | string;
  id?: string;
  ariaLabel?: string;
  width?: number;
}

export function NumberInput({ value, onChange, min = -Infinity, max = Infinity, step = 1, unit, id, ariaLabel, width }: NumberProps) {
  const u = useUnits();
  const isLen = unit === 'len';
  const disp = isLen ? u.toDisplay(value) : value;
  const dStep = isLen && u.k !== 1 ? Math.max(step / u.k, 0.0001) : step;
  const [text, setText] = useState(String(roundTo(disp, dStep)));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(roundTo(disp, dStep)));
  }, [disp, dStep, focused]);
  const commit = (raw: string) => {
    const v = Number(raw.replace(',', '.'));
    if (!Number.isFinite(v)) {
      setText(String(roundTo(disp, dStep)));
      return;
    }
    const mm = isLen ? u.fromDisplay(v) : v;
    onChange(Math.min(max, Math.max(min, mm)));
  };
  const suffix = isLen ? u.unit : unit;
  return (
    <div className="num" style={width ? { width } : undefined}>
      <input
        id={id}
        aria-label={ariaLabel}
        className="num__input"
        inputMode="decimal"
        value={text}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={(e) => {
          setFocused(false);
          commit(e.currentTarget.value);
        }}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const mult = e.shiftKey ? 10 : 1;
            const next = value + (e.key === 'ArrowUp' ? 1 : -1) * step * mult;
            onChange(Math.min(max, Math.max(min, roundTo(next, step))));
          }
        }}
      />
      {suffix && <span className="num__suffix">{suffix}</span>}
    </div>
  );
}

export function NumberField(props: NumberProps & { label: string; hint?: string }) {
  const id = useId();
  return (
    <Field label={props.label} hint={props.hint} htmlFor={id} inline>
      <NumberInput {...props} id={id} />
    </Field>
  );
}

export function SliderField({ label, hint, value, onChange, min, max, step = 1, unit }: NumberProps & { label: string; hint?: string; min: number; max: number }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="slider-row">
        <RSlider.Root
          className="slider"
          value={[Math.min(max, Math.max(min, value))]}
          min={min}
          max={max}
          step={step}
          onValueChange={([v]) => onChange(v)}
          aria-label={label}
        >
          <RSlider.Track className="slider__track">
            <RSlider.Range className="slider__range" />
          </RSlider.Track>
          <RSlider.Thumb className="slider__thumb" aria-label={label} />
        </RSlider.Root>
        <NumberInput id={id} value={value} onChange={onChange} min={min} max={Math.max(max, value)} step={step} unit={unit} width={86} />
      </div>
    </Field>
  );
}

// ------------------------------------------------------------------ select

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function SelectField<T extends string>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: T; options: Option<T>[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <Select id={id} value={value} options={options} onChange={onChange} ariaLabel={label} />
    </Field>
  );
}

export function Select<T extends string>({ value, options, onChange, id, ariaLabel }: { value: T; options: Option<T>[]; onChange: (v: T) => void; id?: string; ariaLabel?: string }) {
  return (
    <RSelect.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <RSelect.Trigger className="select" id={id} aria-label={ariaLabel}>
        <RSelect.Value />
        <RSelect.Icon className="select__icon">
          <ChevronDown size={14} aria-hidden />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content className="select__menu" position="popper" sideOffset={4} collisionPadding={8}>
          <RSelect.Viewport>
            {options.map((o) => (
              <RSelect.Item key={o.value} value={o.value} className="select__item" disabled={o.disabled}>
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                {o.hint && <span className="select__hint">{o.hint}</span>}
                <RSelect.ItemIndicator className="select__check">
                  <Check size={13} aria-hidden />
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

// ------------------------------------------------------------------ toggles

export function SwitchField({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id} inline>
      <RSwitch.Root id={id} className="switch" checked={checked} onCheckedChange={onChange}>
        <RSwitch.Thumb className="switch__thumb" />
      </RSwitch.Root>
    </Field>
  );
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel, size = 'md' }: { value: T; options: (Option<T> & { icon?: ReactNode })[]; onChange: (v: T) => void; ariaLabel: string; size?: 'sm' | 'md' }) {
  return (
    <RToggle.Root
      type="single"
      className={`seg seg--${size}`}
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <RToggle.Item key={o.value} value={o.value} className="seg__item" disabled={o.disabled} aria-label={o.label} title={o.hint}>
          {o.icon}
          <span>{o.label}</span>
        </RToggle.Item>
      ))}
    </RToggle.Root>
  );
}

export function SegmentedField<T extends string>({ label, hint, ...rest }: { label: string; hint?: string; value: T; options: Option<T>[]; onChange: (v: T) => void }) {
  return (
    <Field label={label} hint={hint}>
      <Segmented {...rest} ariaLabel={label} size="sm" />
    </Field>
  );
}

export function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="color" title={label}>
      <span className="color__swatch" style={{ background: value }} />
      <input type="color" value={value} onChange={(e) => onChange(e.currentTarget.value)} aria-label={label} />
      <span className="color__hex">{value.toUpperCase()}</span>
    </label>
  );
}

// ------------------------------------------------------------------ buttons

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  icon,
  disabled,
  title,
  type = 'button',
  full,
}: {
  children?: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  full?: boolean;
}) {
  return (
    <button type={type} className={`btn btn--${variant} btn--${size}${full ? ' btn--full' : ''}`} onClick={onClick} disabled={disabled} title={title}>
      {icon}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ label, onClick, children, active, disabled, side = 'bottom' }: { label: string; onClick?: () => void; children: ReactNode; active?: boolean; disabled?: boolean; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <Tip label={label} side={side}>
      <button type="button" className="icon-btn" aria-label={label} aria-pressed={active} data-active={active} onClick={onClick} disabled={disabled}>
        {children}
      </button>
    </Tip>
  );
}
