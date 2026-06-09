import { useState } from 'react';
import type { AppDataV26, ContentIdea, LinkedInPost, TimeBlock } from '../storage/types';

interface CreateScreenProps {
  data: AppDataV26;
  onPersist: (d: AppDataV26) => void;
}

export function CreateScreen({ data, onPersist }: CreateScreenProps) {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'digest'>('pipeline');
  
  const ideas = data.create?.ideas || [];
  const posts = data.create?.posts || [];

  const handleUpdateIdea = (ideaId: string, updates: Partial<ContentIdea>) => {
    const nextIdeas = ideas.map(i => i.id === ideaId ? { ...i, ...updates, updatedAt: new Date().toISOString() } : i);
    onPersist({ ...data, create: { ...data.create!, ideas: nextIdeas } });
  };

  const handleUpdatePost = (postId: string, updates: Partial<LinkedInPost>) => {
    const nextPosts = posts.map(p => p.id === postId ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p);
    onPersist({ ...data, create: { ...data.create!, posts: nextPosts } });
  };

  const handleAddIdea = () => {
    const newIdea: ContentIdea = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hook: 'New Hook',
      angle: 'New Angle',
      status: 'active'
    };
    onPersist({ ...data, create: { ...data.create!, ideas: [...ideas, newIdea] } });
  };

  const handleDraftWithClaude = (idea: ContentIdea) => {
    const voice = data.userProfile?.positioningThesis || "professional and insightful";
    const prompt = `I want to write a LinkedIn post. The hook is: '${idea.hook}'. The angle is: '${idea.angle}'. Write a 200-word draft in my voice. My positioning thesis is: ${voice}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(prompt).then(() => {
      alert("Prompt copied! Paste it into Claude.");
      // Convert to a drafting post
      const newPost: LinkedInPost = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        title: idea.hook,
        body: '',
        status: 'drafting'
      };
      const nextIdeas = ideas.filter(i => i.id !== idea.id);
      onPersist({ ...data, create: { ideas: nextIdeas, posts: [...posts, newPost] } });
    });
  };

  const schedulePublish = (post: LinkedInPost) => {
    // Emits a TimeBlock reminder
    const tb: TimeBlock = {
      id: crypto.randomUUID(),
      title: `Publish Post: ${post.title}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      start: new Date().toISOString().substring(0, 10) + 'T09:00:00Z', // 9:00 AM
      durationMin: 15,
      category: 'create',
      origin: 'create'
    };
    const nextPosts = posts.map(p => p.id === post.id ? { ...p, status: 'scheduled' as const, updatedAt: new Date().toISOString() } : p);
    onPersist({ ...data, scheduledBlocks: [...data.scheduledBlocks, tb], create: { ...data.create!, posts: nextPosts } });
    alert("Publish reminder scheduled for today at 9:00 AM. Please publish manually when ready.");
  };

  return (
    <div className="ip-engine-container">
      <div className="ip-engine-header">
        <h1>Create Engine</h1>
        <div className="ip-engine-tabs">
          <button className={`ip-tab ${activeTab === 'pipeline' ? 'active' : ''}`} onClick={() => setActiveTab('pipeline')}>Pipeline</button>
          <button className={`ip-tab ${activeTab === 'digest' ? 'active' : ''}`} onClick={() => setActiveTab('digest')}>Weekly Digest</button>
        </div>
      </div>
      
      {activeTab === 'pipeline' && (
        <div className="ip-pipeline-board" style={{ display: 'flex', gap: '1rem', padding: '1rem' }}>
          {/* IDEAS COLUMN */}
          <div className="ip-kanban-col" style={{ flex: 1, background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
            <h3>Ideas <button onClick={handleAddIdea}>+</button></h3>
            {ideas.map(idea => (
              <div key={idea.id} style={{ background: '#fff', padding: '0.5rem', marginBottom: '0.5rem', borderLeft: '4px solid #f2c94c' }}>
                <input value={idea.hook} onChange={e => handleUpdateIdea(idea.id, { hook: e.target.value })} style={{ width: '100%', border: 'none', fontWeight: 'bold' }} />
                <input value={idea.angle} onChange={e => handleUpdateIdea(idea.id, { angle: e.target.value })} style={{ width: '100%', border: 'none', fontSize: '0.9em', color: '#666' }} />
                <div style={{ marginTop: '0.5rem' }}>
                  <button onClick={() => handleDraftWithClaude(idea)} style={{ fontSize: '0.8em', padding: '2px 5px' }}>Draft with Claude (Copy)</button>
                </div>
              </div>
            ))}
          </div>

          {/* DRAFTING COLUMN */}
          <div className="ip-kanban-col" style={{ flex: 1, background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
            <h3>Drafting</h3>
            {posts.filter(p => p.status === 'drafting').map(post => (
              <div key={post.id} style={{ background: '#fff', padding: '0.5rem', marginBottom: '0.5rem', borderLeft: '4px solid #56ccf2' }}>
                <input value={post.title} onChange={e => handleUpdatePost(post.id, { title: e.target.value })} style={{ width: '100%', border: 'none', fontWeight: 'bold' }} />
                <textarea value={post.body} onChange={e => handleUpdatePost(post.id, { body: e.target.value })} placeholder="Paste draft here..." style={{ width: '100%', border: 'none', fontSize: '0.9em', minHeight: '60px' }} />
                <div style={{ marginTop: '0.5rem' }}>
                  <button onClick={() => schedulePublish(post)} style={{ fontSize: '0.8em', padding: '2px 5px' }}>Schedule Publish</button>
                </div>
              </div>
            ))}
          </div>

          {/* SCHEDULED COLUMN */}
          <div className="ip-kanban-col" style={{ flex: 1, background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
            <h3>Scheduled</h3>
            {posts.filter(p => p.status === 'scheduled').map(post => (
              <div key={post.id} style={{ background: '#fff', padding: '0.5rem', marginBottom: '0.5rem', borderLeft: '4px solid #bb6bd9' }}>
                <div style={{ fontWeight: 'bold' }}>{post.title}</div>
                <button onClick={() => handleUpdatePost(post.id, { status: 'published' })} style={{ fontSize: '0.8em', padding: '2px 5px', marginTop: '5px' }}>Mark Published</button>
              </div>
            ))}
          </div>

          {/* PUBLISHED COLUMN */}
          <div className="ip-kanban-col" style={{ flex: 1, background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
            <h3>Published</h3>
            {posts.filter(p => p.status === 'published').map(post => (
              <div key={post.id} style={{ background: '#fff', padding: '0.5rem', marginBottom: '0.5rem', borderLeft: '4px solid #27ae60' }}>
                <div style={{ fontWeight: 'bold' }}>{post.title}</div>
                <div style={{ fontSize: '0.8em', color: '#666' }}>Done</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'digest' && (
        <div style={{ padding: '1rem' }}>
          <h3>Weekly Digest (Deterministic)</h3>
          <p>This aggregates learning and practice from the last 7 days.</p>
          <pre style={{ background: '#eee', padding: '1rem', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
            {`## 📚 Intake Consumed\n`}
            {data.learning?.filter(l => l.completedAt && (Date.now() - new Date(l.completedAt).getTime() < 7*86400000)).map(l => `- ${l.title}`).join('\n') || '- None'}
            {`\n\n## 🏋️ Practice\n`}
            {data.practiceItems?.filter(p => p.lastPracticedAt && (Date.now() - new Date(p.lastPracticedAt).getTime() < 7*86400000)).map(p => `- ${typeof p.prompt === 'string' ? p.prompt : (p.prompt?.en || 'Practice Item')}`).join('\n') || '- None'}
            {`\n\n## 📣 Published Posts\n`}
            {posts.filter(p => p.status === 'published').map(p => `- ${p.title}`).join('\n') || '- None'}
          </pre>
        </div>
      )}
    </div>
  );
}
