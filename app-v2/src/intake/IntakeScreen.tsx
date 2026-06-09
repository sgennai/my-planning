import React, { useState, useMemo } from 'react';
import type { AppDataV26, LearningItem, TimeBlock, ContentIdea } from '../storage/types';

interface IntakeScreenProps {
  data: AppDataV26;
  onPersist: (data: AppDataV26) => void;
  onScheduleBlock: (block: TimeBlock) => void;
}

export function IntakeScreen({ data, onPersist, onScheduleBlock }: IntakeScreenProps) {
  const [activeTab, setActiveTab] = useState<'queue' | 'certifications'>('queue');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<'priority' | 'time' | 'topic'>('priority');
  
  const [urlInput, setUrlInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [kindInput, setKindInput] = useState<'reading' | 'podcast' | 'other'>('reading');

  const items = data.learning || [];

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    const newItem: LearningItem = {
      id: 'intake-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      kind: kindInput,
      title: titleInput.trim() || urlInput.trim(),
      url: urlInput.trim(),
      status: 'queue',
      priority: 0,
      addedAt: new Date().toISOString()
    };

    onPersist({
      ...data,
      learning: [newItem, ...items]
    });

    setUrlInput('');
    setTitleInput('');
  };

  const handleToggleComplete = (item: LearningItem) => {
    const updated = items.map(x => {
      if (x.id === item.id) {
        return {
          ...x,
          status: x.status === 'completed' ? 'queue' : 'completed',
          completedAt: x.status !== 'completed' ? new Date().toISOString() : undefined
        };
      }
      return x;
    });
    onPersist({ ...data, learning: updated });
  };

  const handleDelete = (id: string) => {
    const updated = items.map(x => x.id === id ? { ...x, _deleted: true } as any : x);
    onPersist({ ...data, learning: updated });
  };

  const handleCreateIdea = (item: LearningItem) => {
    const newIdea: ContentIdea = {
      id: 'idea-' + Date.now(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hook: `Lessons from: ${item.title || 'Intake'}`,
      angle: 'Draft angle here...',
      sourceRef: item.id,
      status: 'active'
    };
    const ideas = data.create?.ideas || [];
    onPersist({ ...data, create: { ...data.create!, ideas: [newIdea, ...ideas] } });
    alert("Post idea created in the Create Engine!");
  };

  const handleAddBlock = (item: LearningItem) => {
    onScheduleBlock({
      id: 'block-' + Date.now(),
      title: `Consume: ${item.title}`,
      projectId: 'intake',
      isLocked: false,
      isLogged: false,
      origin: 'intake',
      refId: item.id
    } as any); // Let the main app fill in start/end or rely on drag drop. Wait, onScheduleBlock might need more fields.
    // Actually, in app-v2 pendingCalAction just takes the payload and opens a modal or drops it on calendar.
  };

  const visibleItems = useMemo(() => {
    let filtered = items.filter(x => !x._deleted && x.status !== 'completed');
    
    if (activeTab === 'certifications') {
      filtered = filtered.filter(x => x.kind === 'certification');
    } else {
      filtered = filtered.filter(x => x.kind !== 'certification');
      if (kindFilter !== 'all') {
        filtered = filtered.filter(x => x.kind === kindFilter);
      }
    }

    filtered.sort((a, b) => {
      if (activeTab === 'certifications') {
        // Sort by signalValue/cost or just priority for now
        return (b.priority || 0) - (a.priority || 0);
      }
      if (sortMode === 'time') {
        return (a.estMinutes || 999) - (b.estMinutes || 999);
      } else if (sortMode === 'topic') {
        return (a.topic || '').localeCompare(b.topic || '');
      }
      return (b.priority || 0) - (a.priority || 0);
    });

    return filtered;
  }, [items, activeTab, kindFilter, sortMode]);

  return (
    <div className="practice-screen fade-in" style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Intake Engine</h1>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Quick Add</h3>
        <form onSubmit={handleQuickAdd} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="url"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="Paste URL..."
            className="input"
            required
            style={{ flex: 2 }}
          />
          <input
            type="text"
            value={titleInput}
            onChange={e => setTitleInput(e.target.value)}
            placeholder="Title (optional)"
            className="input"
            style={{ flex: 1 }}
          />
          <select value={kindInput} onChange={e => setKindInput(e.target.value as any)} className="input">
            <option value="reading">Reading</option>
            <option value="podcast">Podcast</option>
            <option value="other">Other</option>
          </select>
          <button type="submit" className="btn btn-primary">Save</button>
        </form>
      </div>

      <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
        <div className="view-switcher">
          <button className={`view-switcher-btn ${activeTab === 'queue' ? 'active' : ''}`} onClick={() => setActiveTab('queue')}>Queue</button>
          <button className={`view-switcher-btn ${activeTab === 'certifications' ? 'active' : ''}`} onClick={() => setActiveTab('certifications')}>Certifications</button>
        </div>
        
        {activeTab === 'queue' && (
          <>
            <select value={kindFilter} onChange={e => setKindFilter(e.target.value)} className="input">
              <option value="all">All Kinds</option>
              <option value="reading">Reading</option>
              <option value="podcast">Podcast</option>
              <option value="webinar">Webinar</option>
              <option value="course">Course</option>
            </select>
            <select value={sortMode} onChange={e => setSortMode(e.target.value as any)} className="input">
              <option value="priority">Sort by Priority</option>
              <option value="time">Sort by Time (est.)</option>
              <option value="topic">Sort by Topic</option>
            </select>
          </>
        )}
      </div>

      <div className="practice-grid" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibleItems.length === 0 && <div className="empty-state">No items in queue.</div>}
        {visibleItems.map(item => (
          <div key={item.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12, padding: '2px 6px', background: 'var(--color-bg-secondary)', borderRadius: 4, textTransform: 'uppercase' }}>
                  {item.kind}
                </span>
                {item.topic && <span style={{ fontSize: 12, opacity: 0.6 }}>{item.topic}</span>}
                {item.estMinutes && <span style={{ fontSize: 12, opacity: 0.6 }}>· {item.estMinutes}m</span>}
              </div>
              <a href={item.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, fontSize: 16, textDecoration: 'none', color: 'var(--color-text)' }}>
                {item.title || item.url}
              </a>
              {activeTab === 'certifications' && item.kind === 'certification' && (
                <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
                  {(item as any).signalValue && <span>Signal: {(item as any).signalValue} </span>}
                  {(item as any).cost && <span>· Cost: ${(item as any).cost} </span>}
                  {(item as any).effortHrs && <span>· Effort: {(item as any).effortHrs}h</span>}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => handleCreateIdea(item)} title="Turn into Post Idea">💡 Post Idea</button>
              <button className="btn" onClick={() => handleAddBlock(item)} title="Add Consume Block">📅 Block</button>
              <button className="btn" onClick={() => handleToggleComplete(item)} title="Mark Complete">✓ Done</button>
              <button className="btn" onClick={() => handleDelete(item.id)} title="Delete">🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
