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
    <div className="setup-screen fade-in">
      <div className="ph">
        <div className="eb">Setup</div>
        <h2 className="t">Your North Star</h2>
        <div className="p">The goal and profile that shape what you practice.</div>
      </div>

      {/* North Star / profile — labels above fields, autosaves */}
      <div className="formcard">
        <div className="form-grid">
          <div className="field full">
            <label>Your positioning</label>
            <textarea
              rows={2}
              value={profile.positioningThesis || ''}
              onChange={e => updateProfile('positioningThesis', e.target.value)}
              placeholder="Enterprise seller becoming an agentic-AI advisor to the C-suite."
            />
          </div>
          <div className="field">
            <label>Target roles</label>
            <input
              type="text"
              value={(profile.targetRoles || []).join(', ')}
              onChange={e => updateProfile('targetRoles', e.target.value)}
              placeholder="Senior AE, Sales Manager, VP Sales"
            />
            <div className="hint">Comma-separated. The first feeds the North Star anchor.</div>
          </div>
          <div className="field">
            <label>Target date</label>
            <input
              type="text"
              value={profile.switchDeadline || ''}
              onChange={e => updateProfile('switchDeadline', e.target.value)}
              placeholder="e.g. Q4 2026"
            />
          </div>
          <div className="field">
            <label>Competency framework</label>
            <input
              type="text"
              value={(profile.competencyFramework || []).join(', ')}
              onChange={e => updateProfile('competencyFramework', e.target.value)}
              placeholder="Comma-separated"
            />
          </div>
          <div className="field">
            <label>Industries</label>
            <input
              type="text"
              value={(profile.industries || []).join(', ')}
              onChange={e => updateProfile('industries', e.target.value)}
              placeholder="Banking, Insurance"
            />
          </div>
          <div className="field">
            <label>Regions</label>
            <input
              type="text"
              value={(profile.geos || []).join(', ')}
              onChange={e => updateProfile('geos', e.target.value)}
              placeholder="EMEA, APAC"
            />
          </div>
        </div>
        <div className="setup-hint">Changes save automatically.</div>
      </div>

      {/* Modules — grouped by family, all controls preserved */}
      <div className="formcard">
        <div className="tok-h">Modules</div>
        {Object.entries(families).map(([family, mods]) => (
          <div key={family} className="mod-family">
            <div className="mod-family-label">{family}</div>
            {mods.map(m => (
              <div key={m.id} className="modrow">
                <div className="ml">
                  <span className="mn">{m.name}</span>
                  <span className="md">{m.type}{m.cadence ? ` · ${m.cadence.frequency}` : ''}</span>
                </div>
                <div className="mod-actions">
                  {m.type === 'generator' && (
                    <button
                      className="mod-btn gold"
                      onClick={() => handleGenerateBlocks(m.id)}
                      disabled={m.status !== 'active'}
                    >
                      Schedule this week
                    </button>
                  )}
                  <button className="mod-btn" onClick={() => toggleModuleStatus(m.id)}>
                    {m.status === 'active' ? 'Pause' : 'Activate'}
                  </button>
                  <span className={`badge ${m.status}`}>{m.status}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
