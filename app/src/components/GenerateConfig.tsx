import { useState, useEffect } from 'react';
import { Shuffle, ArrowLeft, ArrowRight } from 'lucide-react';
import type { Rule, GeneratedConfig } from '../types';

interface GenerateConfigProps {
  rules: Rule[];
  config: GeneratedConfig;
  setConfig: (config: GeneratedConfig) => void;
  onConfirm: () => void;
  onBack: () => void;
}

/** Generate random integers that sum exactly to `total` over `n` buckets. */
function randomPartsTo(n: number, total: number): number[] {
  if (n === 0) return [];
  if (n === 1) return [total];

  // Generate n-1 random cut-points in [0, total], sort them, derive gaps
  const cuts: number[] = Array.from({ length: n - 1 }, () =>
    Math.floor(Math.random() * (total + 1))
  ).sort((a, b) => a - b);

  const parts: number[] = [];
  let prev = 0;
  for (const cut of cuts) {
    parts.push(cut - prev);
    prev = cut;
  }
  parts.push(total - prev);
  return parts;
}

export default function GenerateConfig({ rules, config, setConfig, onConfirm, onBack }: GenerateConfigProps) {
  const [outcomes, setOutcomes] = useState<string[]>([]);
  // counts: each outcome gets a direct record count (starts at 0)
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    // Dynamic Outcomes based on Rules
    // Only include rules that terminate directly into an action
    const terminalRules = rules.filter(r => r.isTerminal);
    const dynamicOutcomes = Array.from(new Set(terminalRules.map(r => r.description || 'Manual Review'))).sort();
    
    if (dynamicOutcomes.length === 0) {
      setOutcomes(['Approve Account']);
    } else {
      setOutcomes([...dynamicOutcomes, 'Default (No Match)']);
    }
  }, [rules]);

  // Initialise counts to 0 when outcomes are first determined
  useEffect(() => {
    if (outcomes.length === 0) return;
    const init: Record<string, number> = {};
    outcomes.forEach(o => { init[o] = 0; });
    setCounts(init);
  }, [outcomes]);

  // Sync counts into config whenever they change
  useEffect(() => {
    if (outcomes.length === 0) return;
    const derived: GeneratedConfig = {};
    outcomes.forEach(o => { derived[o] = counts[o] ?? 0; });
    setConfig(derived);
  }, [counts, outcomes]);

  const handleCountChange = (outcome: string, val: number) => {
    setCounts(prev => ({ ...prev, [outcome]: Math.max(0, Math.min(100000, val)) }));
  };

  const handleRandomize = () => {
    const total = totalCases > 0 ? totalCases : 500;
    const parts = randomPartsTo(outcomes.length, total);
    const randomized: Record<string, number> = {};
    outcomes.forEach((o, i) => { randomized[o] = parts[i]; });
    setCounts(randomized);
  };

  const totalCases = Object.values(counts).reduce((acc, v) => acc + (v || 0), 0);

  // Derive percentage for each outcome
  const getPercent = (count: number) => totalCases > 0 ? (count / totalCases) * 100 : 0;

  return (
    <div className="animate-fade-in flex-col">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        <button className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <button
          className="btn btn-primary"
          onClick={onConfirm}
          disabled={totalCases === 0}
        >
          Preview Generated Data <ArrowRight size={18} />
        </button>
      </div>

      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Configure Test Distribution</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Set the number of records to generate for each outcome. Percentages are calculated automatically.
        </p>
      </div>

      {/* Randomize row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginBottom: '1rem',
      }}>
        <button
          onClick={handleRandomize}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          title="Assign random record counts across all outcomes"
        >
          <Shuffle size={16} />
          Randomize
        </button>
      </div>

      {/* Per-outcome rows */}
      <div style={{ display: 'grid', gap: '0.875rem', marginBottom: '1.5rem' }}>
        {outcomes.map(outcome => {
          const count = counts[outcome] ?? 0;
          const pct = getPercent(count);
          return (
            <div
              key={outcome}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                background: 'var(--field-bg)',
                padding: '0.875rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--primary)', marginBottom: '0.25rem' }}>{outcome}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {rules.filter(r => r.description === outcome).map(r => (
                    <span key={r.id} style={{ background: 'var(--container-bg)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      {r.name}
                    </span>
                  ))}
                  {outcome === 'Default (No Match)' && <span style={{ fontStyle: 'italic' }}>Matches when no rules are triggered</span>}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                {/* Record count input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    min="0"
                    max="100000"
                    value={count}
                    onChange={e => handleCountChange(outcome, parseInt(e.target.value, 10) || 0)}
                    className="form-input"
                    style={{ width: '90px', padding: '0.4rem 0.5rem', textAlign: 'right' }}
                  />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>records</span>
                </div>

                {/* Derived percentage badge */}
                <div style={{
                  minWidth: '60px',
                  textAlign: 'right',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                  color: count > 0 ? 'var(--primary)' : 'var(--text-secondary)',
                  opacity: count > 0 ? 1 : 0.5,
                }}>
                  {pct.toFixed(1)}%
                </div>

                {/* Mini bar */}
                <div style={{
                  width: '80px',
                  height: '6px',
                  background: 'var(--border)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${Math.min(pct, 100)}%`,
                    height: '100%',
                    background: 'var(--primary)',
                    borderRadius: '3px',
                    transition: 'width 0.2s ease',
                  }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary bar */}
      <div style={{
        marginBottom: '1.5rem',
        padding: '0.875rem 1.25rem',
        borderRadius: '8px',
        background: 'var(--field-bg)',
        border: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem'
      }}>
        <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Total records:{' '}
          <span style={{ fontWeight: 700, color: totalCases > 0 ? 'var(--primary)' : '#facc15' }}>
            {totalCases.toLocaleString()}
          </span>
          {totalCases === 0 && (
            <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: '#facc15' }}>
              (set at least one outcome above 0)
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          {outcomes.filter(o => (counts[o] ?? 0) > 0).length} of {outcomes.length} outcomes active
        </div>
      </div>


    </div>
  );
}
