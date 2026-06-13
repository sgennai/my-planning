import { useState } from 'react';
import { generateId } from '../ui/helpers';
import type { AppDataV26, ContentIdea, LinkedInPost, TimeBlock } from '../storage/types';

interface CreateScreenProps {
  data: AppDataV26;
  onPersist: (d: AppDataV26) => void;
}

export function CreateScreen({ data, onPersist }: CreateScreenProps) {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'digest'>('pipeline');

  const ideas   = data.create?.ideas || [];
  const posts   = data.create?.posts || [];

  const draftingPosts   = posts.filter(p => p.status === 'drafting');
  const scheduledPosts  = posts.filter(p => p.status === 'scheduled');
  const publishedPosts  = posts.filter(p => p.status === 'published');

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
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hook: 'New Hook',
      angle: 'New Angle',
      status: 'active'
    };
    onPersist({ ...data, create: { ...data.create!, ideas: [...ideas, newIdea] } });
  };

  const handleDraftWithClaude = (idea: ContentIdea) => {
    const voice = data.userProfile?.positioningThesis || 'professional and insightful';
    const prompt = `I want to write a LinkedIn post. The hook is: '${idea.hook}'. The angle is: '${idea.angle}'. Write a 200-word draft in my voice. My positioning thesis is: ${voice}`;
    navigator.clipboard.writeText(prompt).then(() => {
      alert('Prompt copied! Paste it into Claude.');
      const newPost: LinkedInPost = {
        id: generateId(),
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
    const tb: TimeBlock = {
      id: generateId(),
      title: `Publish Post: ${post.title}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      start: new Date().toISOString().substring(0, 10) + 'T09:00:00Z',
      durationMin: 15,
      category: 'create',
      origin: 'create'
    };
    const scheduledAt = new Date().toISOString();
    const nextPosts = posts.map(p => p.id === post.id ? { ...p, status: 'scheduled' as const, scheduledFor: scheduledAt, updatedAt: scheduledAt } : p);
    onPersist({ ...data, scheduledBlocks: [...data.scheduledBlocks, tb], create: { ...data.create!, posts: nextPosts } });
    alert('Publish reminder scheduled for today at 9:00 AM. Please publish manually when ready.');
  };

  // Digest data — all three sections use start-of-ISO-week (Monday 00:00) as the cutoff
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun … 6=Sat
  const daysSinceMonday = (dayOfWeek + 6) % 7;  // 0 on Mon, 6 on Sun
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
  const weekStartMs = weekStart.getTime();
  const consumed  = data.learning?.filter(l => l.completedAt && new Date(l.completedAt).getTime() >= weekStartMs) || [];
  const practiced = data.practiceItems?.filter(p => p.lastPracticedAt && new Date(p.lastPracticedAt).getTime() >= weekStartMs) || [];
  const publishedThisWeek = posts.filter(p => p.publishedAt && new Date(p.publishedAt).getTime() >= weekStartMs);

  return (
    <div className="crt-screen fade-in">
      <div className="ph">
        <div className="eb">Create</div>
        <h2 className="t">Post pipeline</h2>
        <div className="p">Turn what you learn into LinkedIn posts.</div>
      </div>

      <div className="crt-body">
        <div className="kbtabs segment">
          <span className={activeTab === 'pipeline' ? 'on' : ''} onClick={() => setActiveTab('pipeline')}>Pipeline</span>
          <span className={activeTab === 'digest'   ? 'on' : ''} onClick={() => setActiveTab('digest')}>Weekly digest</span>
        </div>

        {activeTab === 'pipeline' && (
          <div className="kanban">

            {/* IDEAS */}
            <div className="kcol">
              <div className="kh">
                <span className="kt">Ideas</span>
                <span className="kn">{ideas.length}</span>
              </div>
              {ideas.map(idea => (
                <div key={idea.id} className="kcard">
                  <div className="kc-tag">{idea.sourceRef ? 'From · Intake' : 'Idea'}</div>
                  <input
                    className="kc-h kcard-edit"
                    value={idea.hook}
                    onChange={e => handleUpdateIdea(idea.id, { hook: e.target.value })}
                  />
                  <input
                    className="kcard-sub kcard-edit"
                    value={idea.angle}
                    onChange={e => handleUpdateIdea(idea.id, { angle: e.target.value })}
                  />
                  <button className="kcard-act" onClick={() => handleDraftWithClaude(idea)}>
                    Draft with Claude →
                  </button>
                </div>
              ))}
              <button className="addbtn" onClick={handleAddIdea}>+ Capture an idea</button>
            </div>

            {/* DRAFTING */}
            <div className="kcol">
              <div className="kh">
                <span className="kt">Drafting</span>
                <span className="kn">{draftingPosts.length}</span>
              </div>
              {draftingPosts.map(post => (
                <div key={post.id} className="kcard">
                  <div className="kc-tag">Draft</div>
                  <input
                    className="kc-h kcard-edit"
                    value={post.title}
                    onChange={e => handleUpdatePost(post.id, { title: e.target.value })}
                  />
                  <textarea
                    className="kcard-body kcard-edit"
                    value={post.body}
                    onChange={e => handleUpdatePost(post.id, { body: e.target.value })}
                    placeholder="Paste draft here…"
                  />
                  <button className="kcard-act" onClick={() => schedulePublish(post)}>
                    Schedule →
                  </button>
                </div>
              ))}
              <div className="addbtn">Draft with Claude →</div>
            </div>

            {/* SCHEDULED */}
            <div className="kcol">
              <div className="kh">
                <span className="kt">Scheduled</span>
                <span className="kn">{scheduledPosts.length}</span>
              </div>
              {scheduledPosts.length === 0 ? (
                <div className="kempty">
                  <span className="plus">+</span>
                  Nothing scheduled.<br />Move a draft here with a date.
                </div>
              ) : scheduledPosts.map(post => (
                <div key={post.id} className="kcard">
                  <div className="kc-tag">Scheduled</div>
                  <div className="kc-h">{post.title}</div>
                  <button className="kcard-act" onClick={() => handleUpdatePost(post.id, { status: 'published', publishedAt: new Date().toISOString() })}>
                    Mark Published
                  </button>
                </div>
              ))}
            </div>

            {/* PUBLISHED */}
            <div className="kcol">
              <div className="kh">
                <span className="kt">Published</span>
                <span className="kn">{publishedPosts.length}</span>
              </div>
              {publishedPosts.length === 0 ? (
                <div className="kempty">
                  <span className="plus">✓</span>
                  Your published posts<br />will collect here.
                </div>
              ) : publishedPosts.map(post => (
                <div key={post.id} className="kcard">
                  <div className="kc-tag">Published</div>
                  <div className="kc-h">{post.title}</div>
                </div>
              ))}
            </div>

          </div>
        )}

        {activeTab === 'digest' && (
          <div className="crdt-digest">
            <div className="crdt-section">
              <div className="crdt-sh">Consumed this week</div>
              {consumed.length === 0
                ? <div className="crdt-empty">Nothing marked done in the last 7 days.</div>
                : consumed.map(l => <div key={l.id} className="crdt-row">{l.title}</div>)
              }
            </div>
            <div className="crdt-section">
              <div className="crdt-sh">Practiced</div>
              {practiced.length === 0
                ? <div className="crdt-empty">No practice sessions in the last 7 days.</div>
                : practiced.map(p => {
                    const label = typeof p.prompt === 'string' ? p.prompt : ((p.prompt as any)?.en || 'Practice item');
                    return <div key={p.id} className="crdt-row">{label}</div>;
                  })
              }
            </div>
            <div className="crdt-section">
              <div className="crdt-sh">Published</div>
              {publishedThisWeek.length === 0
                ? <div className="crdt-empty">No posts published this week.</div>
                : publishedThisWeek.map(p => <div key={p.id} className="crdt-row">{p.title}</div>)
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
