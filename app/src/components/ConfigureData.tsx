import { useState } from 'react';
import { Settings2, ArrowRight, ArrowLeft, Hash, Quote, ListFilter, Wand2 } from 'lucide-react';
import type { SchemaField } from '../types';

interface ConfigureDataProps {
  schema: SchemaField[];
  onConfirm: (updatedSchema: SchemaField[]) => void;
  onBack: () => void;
}

export default function ConfigureData({ schema, onConfirm, onBack }: ConfigureDataProps) {
  const [localSchema, setLocalSchema] = useState<SchemaField[]>(structuredClone(schema));
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [localValuesText, setLocalValuesText] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    const initFields = (fields: SchemaField[]) => {
      fields.forEach(f => {
        if (f.config?.values) {
          initial[f.key] = JSON.stringify(f.config.values);
        }
        if (f.nested) {
          initFields(Object.values(f.nested));
        }
      });
    };
    initFields(schema);
    return initial;
  });

  const updateField = (key: string, updates: Partial<NonNullable<SchemaField['config']>>) => {
    const next = structuredClone(localSchema) as SchemaField[];
    const findAndApply = (fields: SchemaField[]) => {
      for (const f of fields) {
        if (f.key === key) {
          f.config = { ...(f.config || {}), ...updates };
          return true;
        }
        if (f.nested && findAndApply(Object.values(f.nested))) return true;
      }
      return false;
    };
    findAndApply(next);
    setLocalSchema(next);
  };

  const openGleanPrompt = (field: SchemaField) => {
    const prompt = `I am configuring synthetic test data. I need an array of 15 realistic values for a field named "${field.key}" of type "${field.type}". Here is an example value for context: ${JSON.stringify(field.example)}. Please return ONLY a valid JSON array of these values, with no markdown formatting or extra text.`;
    // Copy prompt to clipboard so user can paste it into Glean
    navigator.clipboard.writeText(prompt).catch(() => {
      // Fallback: silently ignore if clipboard access is denied
    });
    // Open Glean Chat (prompt passed via clipboard, not URL)
    window.open('https://app.glean.com/chat', '_blank', 'noopener,noreferrer');
    // Show brief "Copied!" confirmation on the button
    setCopiedField(field.key);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const renderFieldConfig = (field: SchemaField) => {
    if (field.type === 'object' && field.nested) {
      return (
        <div key={field.key} style={{ marginBottom: '1.5rem', borderLeft: '2px solid var(--border)', paddingLeft: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{field.key}</span>
            <span className="badge">Object</span>
          </div>
          {Object.values(field.nested).map(renderFieldConfig)}
        </div>
      );
    }

    return (
      <div key={field.key} className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1rem', border: '1px solid var(--glass-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {field.type === 'number' ? <Hash size={16} color="var(--primary)" /> : <Quote size={16} color="var(--primary)" />}
            <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{field.key}</span>
            <span className="badge" style={{ fontSize: '0.65rem' }}>{field.type}</span>
            {field.optional && <span className="badge" style={{ fontSize: '0.65rem', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', border: '1px solid var(--primary)' }}>Nullable</span>}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Example: <code style={{ color: 'var(--text-primary)' }}>{JSON.stringify(field.example)}</code>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {field.type === 'number' && (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Min Value</label>
                <input 
                  type="number" 
                  className="form-input" 
                  placeholder="Min"
                  value={field.config?.min ?? ''} 
                  onChange={(e) => updateField(field.key, { min: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Max Value</label>
                <input 
                  type="number" 
                  className="form-input" 
                  placeholder="Max"
                  value={field.config?.max ?? ''} 
                  onChange={(e) => updateField(field.key, { max: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
              </div>
            </>
          )}

          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <ListFilter size={14} />
                Set of allowed values (Nullable JSON Array)
              </label>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', gap: '0.25rem', height: 'auto', minHeight: 'auto' }}
                onClick={() => openGleanPrompt(field)}
                title="Copy AI prompt to clipboard and open Glean Chat"
              >
                <Wand2 size={12} />
                {copiedField === field.key ? 'Copied!' : 'AI Prompt'}
              </button>
            </div>
            <input 
              className="form-input" 
              placeholder='["A", "B", "C"] or [10, 20, 30]'
              value={localValuesText[field.key] ?? (field.config?.values ? JSON.stringify(field.config.values) : '')}
              onChange={(e) => {
                const text = e.target.value;
                setLocalValuesText(prev => ({ ...prev, [field.key]: text }));
                try {
                  const val = (text ? JSON.parse(text) : undefined) as unknown;
                  if (val === undefined || Array.isArray(val)) {
                    updateField(field.key, { values: val as unknown[] | undefined });
                  }
                } catch {
                  // Allow typing invalid JSON temporarily
                }
              }}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-col animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        <button className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <button className="btn btn-primary" onClick={() => onConfirm(localSchema)}>
          Continue to Distribution <ArrowRight size={18} />
        </button>
      </div>

      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
          <Settings2 color="var(--primary)" />
          Configure Data Generation
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Override the default random generation by specifying constraints or fixed sets of values.
        </p>
      </div>

      <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.5rem', marginBottom: '2rem' }}>
        {localSchema.map(renderFieldConfig)}
      </div>
    </div>
  );
}
