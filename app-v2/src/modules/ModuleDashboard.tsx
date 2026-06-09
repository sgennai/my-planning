import { useState } from 'react';
import type { AppDataV26, Module, UserProfile } from '../storage/types';
import { scheduleModuleBlocks } from './generator';
import { startOfWeek } from '../helpers/calendar-utils';

interface Props {
  data: AppDataV26;
  onPersist: (data: AppDataV26) => void;
}

export function ModuleDashboard({ data, onPersist }: Props) {
  const [profile, setProfile] = useState<UserProfile>(
    data.userProfile || {
      id: 'singleton-user-profile',
      targetRoles: [],
      competencyFramework: [],
      positioningThesis: '',
      industries: [],
      geos: [],
      switchDeadline: '',
    }
  );

  const updateProfile = (field: keyof UserProfile, value: string) => {
    // Basic comma-separated string to array logic for list fields
    const isArrayField = ['targetRoles', 'competencyFramework', 'industries', 'geos'].includes(field as string);
    const updatedValue = isArrayField 
      ? value.split(',').map(s => s.trim()).filter(s => s.length > 0)
      : value;
    
    const nextProfile = { ...profile, [field]: updatedValue };
    setProfile(nextProfile as UserProfile);
    onPersist({ ...data, userProfile: nextProfile as UserProfile });
  };

  const handleGenerateBlocks = (moduleId: string) => {
    // Use ISO string of startOfWeek(new Date()) to be deterministic
    const weekStartIso = startOfWeek(new Date()).toISOString();
    const nextData = scheduleModuleBlocks(data, moduleId, weekStartIso);
    if (nextData !== data) {
      onPersist(nextData);
      alert('Blocks scheduled for this week successfully!');
    } else {
      alert('Blocks are already scheduled or module is not active.');
    }
  };

  const toggleModuleStatus = (moduleId: string) => {
    const nextModules = data.modules?.map(m => {
      if (m.id === moduleId) {
        const nextStatus = m.status === 'active' ? 'paused' : 'active';
        return { ...m, status: nextStatus };
      }
      return m;
    });
    onPersist({ ...data, modules: nextModules as Module[] });
  };

  // Group modules by family
  const families: Record<string, Module[]> = {};
  (data.modules || []).forEach(m => {
    if (!families[m.family]) families[m.family] = [];
    families[m.family].push(m);
  });

  return (
    <div className="wrap screen-pad-top fade-in" style={{ paddingBottom: 100 }}>
      <div className="eyebrow">Governance & Architecture</div>
      <h1 className="title">Module Dashboard</h1>
      <div className="rule" />

      {/* User Profile / North Star Editor */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, marginBottom: 16 }}>North Star (User Profile)</h2>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <label className="field-label">Positioning Thesis</label>
            <textarea
              className="field-input"
              rows={3}
              value={profile.positioningThesis || ''}
              onChange={e => updateProfile('positioningThesis', e.target.value)}
              placeholder="Your core professional thesis..."
            />
          </div>
          <div>
            <label className="field-label">Switch Deadline</label>
            <input
              type="text"
              className="field-input"
              value={profile.switchDeadline || ''}
              onChange={e => updateProfile('switchDeadline', e.target.value)}
              placeholder="e.g. Q4 2026"
            />
          </div>
          <div>
            <label className="field-label">Target Roles (comma separated)</label>
            <input
              type="text"
              className="field-input"
              value={(profile.targetRoles || []).join(', ')}
              onChange={e => updateProfile('targetRoles', e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Competency Framework (comma separated)</label>
            <input
              type="text"
              className="field-input"
              value={(profile.competencyFramework || []).join(', ')}
              onChange={e => updateProfile('competencyFramework', e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Industries (comma separated)</label>
            <input
              type="text"
              className="field-input"
              value={(profile.industries || []).join(', ')}
              onChange={e => updateProfile('industries', e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Geos (comma separated)</label>
            <input
              type="text"
              className="field-input"
              value={(profile.geos || []).join(', ')}
              onChange={e => updateProfile('geos', e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Module Registry */}
      <section>
        <h2 style={{ fontSize: 18, marginBottom: 16 }}>Module Registry</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {Object.entries(families).map(([family, mods]) => (
            <div key={family}>
              <h3 style={{ fontSize: 14, textTransform: 'uppercase', color: 'var(--muted-3)', marginBottom: 12, letterSpacing: '0.05em' }}>
                {family}
              </h3>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                {mods.map(m => (
                  <div key={m.id} style={{ padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>{m.name}</div>
                      <span style={{ fontSize: 11, padding: '2px 6px', background: m.status === 'active' ? 'var(--blue-light)' : 'var(--bg-inset)', color: m.status === 'active' ? 'var(--blue-dark)' : 'var(--muted-3)', borderRadius: 4 }}>
                        {m.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, display: 'flex', gap: 8 }}>
                      <span style={{ padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4 }}>Type: {m.type}</span>
                      {m.cadence && (
                        <span style={{ padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4 }}>Cadence: {m.cadence.frequency}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button 
                        className="btn-secondary" 
                        style={{ padding: '4px 8px', fontSize: 12 }}
                        onClick={() => toggleModuleStatus(m.id)}
                      >
                        {m.status === 'active' ? 'Pause' : 'Activate'}
                      </button>
                      {m.type === 'generator' && (
                        <button 
                          className="btn-primary" 
                          style={{ padding: '4px 8px', fontSize: 12 }}
                          onClick={() => handleGenerateBlocks(m.id)}
                          disabled={m.status !== 'active'}
                        >
                          Schedule this week
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
