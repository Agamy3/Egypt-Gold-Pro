'use client';

import React from 'react';

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function colorForConfidence(c: number): { ring: string; label: string; text: string } {
  if (c <= 0.39) return { ring: '#ef4444', label: 'Low', text: 'text-red-300' };
  if (c <= 0.69) return { ring: '#f59e0b', label: 'Medium', text: 'text-yellow-300' };
  return { ring: '#22c55e', label: 'High', text: 'text-green-300' };
}

export default function ConfidenceRing(props: { value0to1: number; size?: number; label?: string }) {
  const size = props.size ?? 46;
  const v = clamp01(props.value0to1);
  const pct = Math.round(v * 100);
  const { ring, label, text } = colorForConfidence(v);

  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '9999px',
    background: `conic-gradient(${ring} ${pct}%, rgba(255,255,255,0.10) 0)`,
  };

  return (
    <div className="flex items-center gap-3">
      <div style={style} className="relative flex items-center justify-center">
        <div className="absolute inset-[3px] rounded-full bg-gray-950 flex items-center justify-center">
          <div className="text-xs font-semibold text-gray-200">{pct}%</div>
        </div>
      </div>
      <div className="leading-tight">
        <div className="text-xs text-gray-400">{props.label ?? 'Confidence'}</div>
        <div className={`text-sm font-semibold ${text}`}>{label}</div>
      </div>
    </div>
  );
}

