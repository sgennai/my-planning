import React, { useState, useMemo } from 'react';
import type { AppDataV26, LearningItem, TimeBlock, ContentIdea } from '../storage/types';

function itemSrc(item: LearningItem): string {
  const i = item as any;
  if (item.kind === 'podcast') {
    const src = i.podcast || item.source || 'feeds';
    const mins = i.durationMin || item.estMinutes;
    return mins ? `${src} · ${mins} min` : src;
  }
  if (item.kind === 'reading') {
    let domain = item.source || '';
    if (!domain && item.url) {
      try { domain = new URL(item.url).hostname.replace(/^www\./, ''); } catch { domain = ''; }
    }
    return item.estMinutes ? `${domain} · ${item.estMinutes} min` : domain;
  }
  if (item.kind === 'certification') {
    const src = i.vendor || item.source || 'certification';
    return i.effortHrs ? `${src} · ${i.effortHrs}h` : src;
  }
  const src = item.source || item.kind;
  return item.estMinutes ? `${src} · ${item.estMinutes} min` : src;
}

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
    onPersist({ ...data, learning: [newItem, ...items] });
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
    alert('Post idea created in the Create Engine!');
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
    } as any);
  };

  const visibleItems = useMemo(() => {
    let filtered = items.filter(x => !x._deleted && x.status !== 'completed');
    if (activeTab === 'certifications') {
      filtered = filtered.filter(x => x.kind === 'certification');
    } else {
      filtered = filtered.filter(x => x.kind !== 'certification');
      if (kindFilter !== 'all') filtered = filtered.filter(x => x.kind === kindFilter);
    }
    filtered.sort((a, b) => {
      if (activeTab === 'certifications') return (b.priority || 0) - (a.priority || 0);
      if (sortMode === 'time') return (a.estMinutes || 999) - (b.estMinutes || 999);
      if (sortMode === 'topic') return (a.topic || '').localeCompare(b.topic || '');
      return (b.priority || 0) - (a.priority || 0);
    });
    return filtered;
  }, [items, activeTab, kindFilter, sortMode]);

  return (
    <div className="intk-screen fade-in">
      <div className="ph">
        <div className="eb">Intake</div>
        <h2 className="t">What to consume next</h2>
        <div className="p">Your reading, podcasts, and certifications — prioritized.</div>
      </div>

      <form className="intake-add" onSubmit={handleQuickAdd}>
        <div className="field">
          <label>Add a link</label>
          <input
            type="url"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="Paste a URL…"
            required
          />
        </div>
        <div className="field">
          <label>Title</label>
          <input
            type="text"
            value={titleInput}
            onChange={e => setTitleInput(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="field">
          <label>Kind</label>
          <select
            value={kindInput}
            onChange={e => setKindInput(e.target.value as any)}
            className="intk-sel"
          >
            <option value="reading">Reading</option>
            <option value="podcast">Podcast</option>
            <option value="other">Other</option>
          </select>
        </div>
        <button type="submit" className="intk-save-btn">Save</button>
      </form>

      <div className="intake-controls">
        <div className="segment">
          <span className={activeTab === 'queue' ? 'on' : ''} onClick={() => setActiveTab('queue')}>Queue</span>
          <span className={activeTab === 'certifications' ? 'on' : ''} onClick={() => setActiveTab('certifications')}>Certifications</span>
        </div>
        {activeTab === 'queue' && (
          <>
            <select value={kindFilter} onChange={e => setKindFilter(e.target.value)} className="intk-sel">
              <option value="all">All kinds</option>
              <option value="reading">Reading</option>
              <option value="podcast">Podcast</option>
              <option value="webinar">Webinar</option>
              <option value="course">Course</option>
            </select>
            <select value={sortMode} onChange={e => setSortMode(e.target.value as any)} className="intk-sel">
              <option value="priority">Sort by priority</option>
              <option value="time">Sort by time (est.)</option>
              <option value="topic">Sort by topic</option>
            </select>
          </>
        )}
      </div>

      <div className="intk-list">
        {visibleItems.length === 0 && (
          <div className="intk-empty">No items in queue.</div>
        )}
        {visibleItems.map(item => {
          const cert = item as any;
          const certMeta = activeTab === 'certifications' && item.kind === 'certification'
            ? [
                cert.signalValue && `Signal: ${cert.signalValue}`,
                cert.cost != null && `Cost: $${cert.cost}`,
                cert.effortHrs != null && `Effort: ${cert.effortHrs}h`,
              ].filter(Boolean).join(' · ')
            : '';
          const src = itemSrc(item);
          return (
            <div key={item.id} className="icard">
              <div className="body">
                <div className="meta">
                  <span className="chip-tag">{item.kind}</span>
                  {src && <span className="src">{src}</span>}
                </div>
                <a href={item.url} target="_blank" rel="noreferrer" className="ttl">
                  {item.title || item.url}
                </a>
                {certMeta && <div className="src cert-meta">{certMeta}</div>}
              </div>
              <div className="iact">
                <button className="ib go" onClick={() => handleCreateIdea(item)}>Post idea</button>
                <button className="ib" onClick={() => handleAddBlock(item)}>Block</button>
                <button className="ib" onClick={() => handleToggleComplete(item)}>Done</button>
                <button className="ib del" onClick={() => handleDelete(item.id)}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
