import { useState } from 'react';
import { Database, Type, Hash, ToggleLeft, Box, List as ListIcon, ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';
import type { SchemaField } from '../types';

interface ConfirmSchemaProps {
  schema: SchemaField[];
  onConfirm: (schema: SchemaField[]) => void;
  onBack: () => void;
}

export default function ConfirmSchema({ schema: initialSchema, onConfirm, onBack }: ConfirmSchemaProps) {
  const [localSchema, setLocalSchema] = useState<SchemaField[]>(initialSchema);
  
  const updateType = (key: string, newType: 'string' | 'number' | 'boolean' | 'object' | 'array') => {
    const nextSchema = structuredClone(localSchema) as SchemaField[];
    const findAndApply = (fields: SchemaField[]) => {
      for (const f of fields) {
        if (f.key === key) {
          f.type = newType;
          return true;
        }
        if (f.nested && findAndApply(Object.values(f.nested))) return true;
      }
      return false;
    };
    findAndApply(nextSchema);
    setLocalSchema(nextSchema);
  };
  
  const removeField = (key: string) => {
    const nextSchema = structuredClone(localSchema) as SchemaField[];
    const findAndRemove = (fields: SchemaField[], parent?: Record<string, SchemaField>) => {
      for (let i = 0; i < fields.length; i++) {
        if (fields[i].key === key) {
          if (parent) {
            const lastPart = key.split('.').pop()!;
            delete parent[lastPart];
          } else {
            nextSchema.splice(i, 1);
          }
          return true;
        }
        const nested = fields[i].nested;
        if (nested && findAndRemove(Object.values(nested), nested)) return true;
      }
      return false;
    };
    findAndRemove(nextSchema);
    setLocalSchema(nextSchema);
  };

  const toggleNullable = (key: string) => {
    const nextSchema = structuredClone(localSchema) as SchemaField[];
    const findAndToggle = (fields: SchemaField[]) => {
      for (const f of fields) {
        if (f.key === key) {
          f.optional = !f.optional;
          return true;
        }
        const nested = f.nested;
        if (nested && findAndToggle(Object.values(nested))) return true;
      }
      return false;
    };
    findAndToggle(nextSchema);
    setLocalSchema(nextSchema);
  };

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'string': return <Type size={16} color="#3b82f6" />;
      case 'number': return <Hash size={16} color="#f59e0b" />;
      case 'boolean': return <ToggleLeft size={16} color="#10b981" />;
      case 'object': return <Box size={16} color="#8b5cf6" />;
      case 'array': return <ListIcon size={16} color="#ec4899" />;
      default: return <Database size={16} color="#94a3b8" />;
    }
  };

  const renderSchemaNode = (field: SchemaField) => {
    return (
      <div key={field.key} style={{ marginBottom: '0.5rem' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem',
          padding: '0.5rem 0.75rem',
          background: 'rgba(15, 23, 42, 0.4)',
          borderRadius: '6px',
          border: '1px solid var(--border)'
        }}>
          {getTypeIcon(field.type)}
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>{field.key}</strong>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Example: <code>{String(JSON.stringify(field.example)).substring(0, 40)}{String(JSON.stringify(field.example)).length > 40 ? '...' : ''}</code>
            </div>
          </div>
            
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={field.optional} 
                onChange={() => toggleNullable(field.key)}
                style={{ cursor: 'pointer' }}
              />
              Nullable
            </label>

            <select 
              value={field.type}
              onChange={(e) => updateType(field.key, e.target.value as SchemaField['type'])}
              style={{
                background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '0.4rem 0.75rem', borderRadius: '4px', fontSize: '0.9rem', outline: 'none'
              }}
            >
              <option value="string">String</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
              <option value="array">Array</option>
              <option value="object">Object</option>
            </select>
            
            <button 
              onClick={() => removeField(field.key)}
              className="btn-icon"
              style={{ color: '#f87171', padding: '0.4rem' }}
              title="Remove field"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {field.nested && (
          <div style={{ paddingLeft: '2rem', borderLeft: '1px dashed var(--border)', marginLeft: '0.75rem', marginTop: '0.5rem' }}>
            {Object.values(field.nested).map((nestedField) => renderSchemaNode(nestedField))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="animate-fade-in flex-col">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        <button className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <button className="btn btn-primary" onClick={() => onConfirm(localSchema)}>
          Confirm Schema <ArrowRight size={18} />
        </button>
      </div>

      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Confirm Data Schema</h2>
        <p>This is the inferred data structure from your sample. The synthetic data will exactly match these types.</p>
      </div>

      <div style={{ 
        maxHeight: '400px', 
        overflowY: 'auto', 
        paddingRight: '1rem',
        marginBottom: '2rem',
        background: 'rgba(0, 0, 0, 0.1)',
        padding: '1.5rem',
        borderRadius: '12px',
        border: '1px solid var(--glass-border)'
      }}>
        {localSchema.map((field) => renderSchemaNode(field))}
      </div>
    </div>
  );
}
