import React from "react";
import type { ParamSpec } from "../remotion/animations";
import type { ParamValue } from "../types";

export const ParamControls: React.FC<{
  specs: ParamSpec[];
  values: Record<string, ParamValue>;
  onChange: (key: string, value: ParamValue) => void;
}> = ({ specs, values, onChange }) => {
  return (
    <>
      {specs.map((spec) => {
        const value = values[spec.key] ?? spec.default;
        return (
          <div className="field" key={spec.key}>
            <label>
              {spec.label}
              {spec.type === "number" && <span className="muted"> · {Number(value).toFixed(2)}</span>}
            </label>
            {spec.type === "number" ? (
              <input
                type="range"
                min={spec.min ?? 0}
                max={spec.max ?? 1}
                step={spec.step ?? 0.01}
                value={Number(value)}
                onChange={(e) => onChange(spec.key, Number(e.target.value))}
              />
            ) : spec.type === "select" ? (
              <select value={String(value)} onChange={(e) => onChange(spec.key, e.target.value)}>
                {spec.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : spec.type === "color" ? (
              <input type="color" value={String(value)} onChange={(e) => onChange(spec.key, e.target.value)} />
            ) : (
              <input type="text" value={String(value)} onChange={(e) => onChange(spec.key, e.target.value)} />
            )}
          </div>
        );
      })}
    </>
  );
};
