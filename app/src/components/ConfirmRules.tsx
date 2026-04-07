import { useState } from 'react';
import { Target, Activity, ArrowLeft, ArrowRight, List } from 'lucide-react';
import type { Rule } from '../types';
import { extractRequiredLists } from '../utils/engine';

interface ConfirmRulesProps {
  rules: Rule[];
  externalLists: Record<string, unknown[]>;
  onConfirm: (rules: Rule[], externalLists: Record<string, unknown[]>) => void;
  onBack: () => void;
}

export default function ConfirmRules({ rules: initialRules, externalLists, onConfirm, onBack }: ConfirmRulesProps) {
  const [localRules] = useState<Rule[]>(initialRules);
  const [localLists, setLocalLists] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    Object.entries(externalLists).forEach(([key, val]) => {
      initial[key] = Array.isArray(val) ? val.join(', ') : '';
    });
    return initial;
  });

  const requiredLists = extractRequiredLists(localRules);

  const handleListChange = (key: string, value: string) => {
    setLocalLists(prev => ({ ...prev, [key]: value }));
  };

  const handleConfirm = () => {
    const parsedLists: Record<string, unknown[]> = {};
    Object.entries(localLists).forEach(([key, val]) => {
      if (!val.trim()) {
        parsedLists[key] = [];
        return;
      }
      try {
        if (val.trim().startsWith('[')) {
          parsedLists[key] = JSON.parse(val);
        } else {
          parsedLists[key] = val.split(',').map(s => s.trim()).filter(s => s !== '');
        }
      } catch {
        parsedLists[key] = val.split(',').map(s => s.trim()).filter(s => s !== '');
      }
    });
    requiredLists.forEach(list => {
      if (!(list.listName in parsedLists)) {
        parsedLists[list.listName] = [];
      }
    });
    onConfirm(localRules, parsedLists);
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        <button className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <button className="btn btn-primary" onClick={handleConfirm}>
          Looks Good, Proceed <ArrowRight size={18} />
        </button>
      </div>

      {requiredLists.length > 0 && (
        <div style={{ 
          marginBottom: '2.5rem', 
          background: 'rgba(59, 130, 246, 0.05)', 
          border: '1px solid rgba(59, 130, 246, 0.2)', 
          borderRadius: '12px',
          padding: '1.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', color: 'var(--primary)' }}>
            <List size={22} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Required Data Lists</h3>
          </div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            The following variables were found in your rules (e.g., <code>userID IN blocklist</code>). 
            Please provide their values as comma-separated strings or a JSON array.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {requiredLists.map(list => (
              <div key={list.listName} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                  {list.listName} <span style={{ fontWeight: 400, opacity: 0.6 }}>(used with <code>{list.fieldName}</code>)</span>
                </label>
                <textarea 
                  className="input"
                  style={{ minHeight: '80px', fontFamily: 'monospace', fontSize: '0.9rem' }}
                  placeholder="value1, value2, value3..."
                  value={localLists[list.listName] || ''}
                  onChange={(e) => handleListChange(list.listName, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Workflow Decisions & Rules</h2>
        <p>We've identified {localRules.length} rule conditions across {new Set(localRules.map(r => r.description)).size} decisions.</p>
      </div>

      <div style={{ 
        maxHeight: '440px', 
        overflowY: 'auto', 
        paddingRight: '1rem',
        marginBottom: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem'
      }}>
        {Array.from(new Set(localRules.map(r => r.description))).map((rulesetName) => {
          const rulesInSet = localRules.filter(r => r.description === rulesetName);
          return (
            <div key={rulesetName} style={{ 
              background: 'var(--field-bg)', 
              border: '1px solid var(--border)', 
              borderRadius: '12px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '0.5rem', borderRadius: '8px', color: 'var(--primary)' }}>
                  <Target size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', fontWeight: 700, marginBottom: '0.2rem' }}>
                    Decision
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {rulesetName}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {rulesInSet.map((rule, idx) => (
                  <div key={rule.id} style={{ 
                    background: 'var(--container-bg)', 
                    padding: '1.25rem', 
                    borderRadius: '10px', 
                    border: '1px solid var(--border)',
                    position: 'relative'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', color: 'var(--primary)', fontSize: '0.95rem', fontWeight: 600 }}>
                      <Activity size={16} /> Rule Condition {rulesInSet.length > 1 ? `#${idx + 1}` : ''}
                    </div>
                    
                    <div style={{ fontSize: '1.05rem', color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: '1rem' }}>
                      <span style={{ background: 'var(--container-bg)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                        {rule.name}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: 'var(--text-secondary)', background: 'var(--container-bg)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border)', overflowX: 'auto' }}>
                      {rule.condition}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {localRules.length === 0 && (
          <div style={{ padding: '4rem 2rem', textAlign: 'center', border: '2px dashed var(--border)', borderRadius: '12px', background: 'var(--container-bg)' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>No workflow rules were discovered.</p>
          </div>
        )}
      </div>


    </div>
  );
}
