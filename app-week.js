// RIGHT NOW BANNER
// ═════════════════════════════════════════════════════════════
function RightNowBanner({ routine, overrides, scheduledBlocks, projects, referenceLibrary, now, onOpenReference, elsewhereToggles, completions }) {
  const jsDay = now.getDay();
  const todayCol = jsDay === 0 ? 6 : jsDay - 1;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Routine items happening today (with overrides applied + elsewhere filter + skip completed), sorted chronologically
  const todayRoutine = applyElsewhereFilter(
    resolvedRoutineForDate(routine, overrides || {}, now, completions),
    now,
    elsewhereToggles,
    now
  )
    .filter(it => !it._completed) // hide items already checked off today
    .map(it => ({
      source: 'routine',
      title: it.title,
      start: toMinutes(it.start),
      end: toMinutes(it.start) + it.duration,
      note: it.note,
      category: it.category,
    }));

  // Scheduled project blocks for today (excluding completed/skipped — those are done)
  const todayBlocks = blocksForDate(scheduledBlocks || [], now)
    .filter(b => b.status !== 'completed')
    .map(b => {
      const project = projects.find(p => p.id === b.projectId);
      return {
        source: 'project',
        title: b.title,
        start: toMinutes(b.start),
        end: toMinutes(b.start) + b.duration,
        note: project ? project.name : '',
        category: 'project',
      };
    });

  const allTodayItems = [...todayRoutine, ...todayBlocks].sort((a, b) => a.start - b.start);

  const current = allTodayItems.find(it => it.start <= nowMin && it.end > nowMin);
  const upcoming = allTodayItems.filter(it => it.start > nowMin);
  const next = upcoming[0];

  const isWeekday = jsDay >= 1 && jsDay <= 5;

  // Find the micro-strength routine item (if any) and its configured window
  const microItem = (routine || []).find(r => r.recurrence && r.recurrence.kind === 'top-of-hour');
  let microWindow = null;
  if (microItem) {
    const days = microItem.days || [];
    const startHour = (microItem.recurrence && microItem.recurrence.startHour) ?? 9;
    const endHour = (microItem.recurrence && microItem.recurrence.endHour) ?? 18;
    const inDayWindow = days.includes(jsDay);
    const inHourWindow = now.getHours() >= startHour && now.getHours() <= endHour;
    const inMinuteWindow = now.getMinutes() < 2; // first 2 min of the hour
    if (inDayWindow && inHourWindow && inMinuteWindow) {
      microWindow = { item: microItem };
    }
  }
  const inMicroWindow = !!microWindow;

  // Derive a one-line summary from the Reference Library entry's body.
  // Strategy: prefer the first non-empty line that mentions reps; fall back to a generic line.
  const microSummary = (() => {
    const ref = (referenceLibrary || []).find(r => r.id === 'ref-micro-strength');
    if (!ref || !ref.body) return '~60–80s · take a movement break';
    // Find first line that looks like "1. Air squats — 10 reps" etc., concatenate into a compact list
    const lines = ref.body.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const moves = lines
      .filter(l => /^\d+\./.test(l))
      .map(l => l.replace(/^\d+\.\s*/, '').replace(/\s*—.*$/, '').trim())
      .filter(Boolean);
    if (moves.length === 0) return '~60–80s · take a movement break';
    return `~60–80s · ${moves.join(' · ')}`;
  })();

  const dayName = DAY_NAMES_LONG[todayCol];
  const dateStr = formatDateShort(now);
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  let nowBlock;
  if (inMicroWindow) {
    nowBlock = (
      <>
        <div className="right-now-now">⚡ {microItem.title} · top of the hour</div>
        <div className="right-now-next" style={{ color: 'var(--teal)' }}>
          {microSummary}
        </div>
      </>
    );
  } else if (current) {
    const remaining = current.end - nowMin;
    nowBlock = (
      <>
        <div className="right-now-now">{current.title}</div>
        <div className="right-now-next">
          <b>{remaining} min remaining</b>
          {next && <> · then <b>{next.title}</b> at {pad(Math.floor(next.start / 60))}:{pad(next.start % 60)}</>}
        </div>
      </>
    );
  } else if (next) {
    const minsUntil = next.start - nowMin;
    const startStr = `${pad(Math.floor(next.start / 60))}:${pad(next.start % 60)}`;
    nowBlock = (
      <>
        <div className="right-now-now-empty">
          {minsUntil < 60 ? `Free for ${minsUntil} min — use them deliberately.` : 'Open block. Decide what to work on.'}
        </div>
        <div className="right-now-next">Next: <b>{next.title}</b> at {startStr}</div>
      </>
    );
  } else {
    nowBlock = (
      <>
        <div className="right-now-now-empty">Day is done. Rest is part of the work.</div>
      </>
    );
  }

  // Reference Library quick links — show first 4 entries; "More…" opens full modal
  const quickRefs = (referenceLibrary || []).slice(0, 4);

  return (
    <div className="right-now">
      <div>
        <div className="right-now-label">Right Now</div>
        {nowBlock}
      </div>
      <div className="right-now-time">
        <div className="right-now-time-big">{timeStr}</div>
        <div className="right-now-time-day">{dayName} · {dateStr}</div>
      </div>
      <div className="right-now-reference">
        <div className="right-now-reference-label">Reference</div>
        <div className="ref-quick-list">
          {quickRefs.map(r => (
            <button key={r.id} className="ref-quick-item" onClick={() => onOpenReference && onOpenReference(r.id)}>
              {r.title}
            </button>
          ))}
          {(referenceLibrary || []).length > 4 && (
            <button className="ref-quick-more" onClick={() => onOpenReference && onOpenReference(null)}>
              More…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// PORTFOLIO PANEL
// ═════════════════════════════════════════════════════════════
function ProjectsRailPanel({ projects, scheduledBlocks, onCompleteAction, onAddAction, onDeleteAction }) {
  const [collapsedProjects, setCollapsedProjects] = useState(null);
  const [expandedModules, setExpandedModules] = useState({});
  const [addingFor, setAddingFor] = useState(null); // key: `${projectId}:${moduleId}` or `${projectId}`
  const [addText, setAddText] = useState('');
  const [addMinutes, setAddMinutes] = useState('');

  useEffect(() => {
    if (collapsedProjects !== null) return;
    const init = {};
    (projects || []).forEach(p => { init[p.id] = true; });
    setCollapsedProjects(init);
  }, [projects, collapsedProjects]);

  const collapsedMap = collapsedProjects || {};
  const toggleCollapse = (pid) => setCollapsedProjects(c => ({ ...(c || {}), [pid]: !(c || {})[pid] }));
  const toggleModule = (pid, mid) => {
    const k = `${pid}:${mid}`;
    setExpandedModules(m => ({ ...m, [k]: !m[k] }));
  };

  const railProjects = useMemo(() => {
    const scheduledIds = new Set((scheduledBlocks || []).filter(b => b.status !== 'completed').map(b => b.actionId).filter(Boolean));
    return (projects || [])
      .filter(p => p.tier <= 5)
      .sort((a, b) => a.tier - b.tier)
      .map(p => {
        if (p.isMaster && Array.isArray(p.modules) && Array.isArray(p.prioritySequence)) {
          const seq = p.prioritySequence;
          const orderedModules = seq
            .map(num => p.modules.find(m => m.number === num))
            .filter(Boolean)
            .map(m => ({
              ...m,
              nextActions: (m.nextActions || []).map(a => ({ ...a, scheduled: scheduledIds.has(a.id) })),
            }));
          return { ...p, _isMaster: true, _modules: orderedModules, _actions: [] };
        }
        const actions = Array.isArray(p.nextActions) ? p.nextActions : [];
        return {
          ...p,
          _isMaster: false,
          _modules: [],
          _actions: actions.map(a => ({ ...a, scheduled: scheduledIds.has(a.id) })),
        };
      });
  }, [projects, scheduledBlocks]);

  const onProjectActionDragStart = (e, project, action) => {
    if (action.scheduled) { e.preventDefault(); return; }
    const payload = {
      type: 'next-action',
      projectId: project.id,
      actionId: action.id,
      title: action.text,
      duration: action.duration || 30,
    };
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
  };

  const startAdding = (key) => { setAddingFor(key); setAddText(''); setAddMinutes(''); };
  const cancelAdding = () => { setAddingFor(null); setAddText(''); setAddMinutes(''); };
  const submitAdd = (projectId, moduleId) => {
    const t = addText.trim();
    if (!t || !onAddAction) return;
    onAddAction(projectId, moduleId || null, t, addMinutes ? parseInt(addMinutes, 10) : null);
    cancelAdding();
  };

  const renderActionTile = (p, a, moduleId) => (
    <div
      key={a.id}
      className={`today-project-action ${a.scheduled ? 'scheduled' : ''}`}
      draggable={!a.scheduled}
      onDragStart={(e) => onProjectActionDragStart(e, p, a)}
      title={a.scheduled ? 'Already scheduled' : 'Drag to schedule'}
    >
      <span className="today-project-action-text">{a.text}</span>
      {a.estimatedMin != null && (
        <span className="today-project-action-time">~{a.estimatedMin}m</span>
      )}
      {onCompleteAction && (
        <button
          className="today-action-btn today-action-btn-complete"
          draggable={false}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onCompleteAction(p.id, moduleId || null, a.id); }}
          title="Mark complete — removes from list"
        >✓</button>
      )}
      {onDeleteAction && (
        <button
          className="today-action-btn today-action-btn-delete"
          draggable={false}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDeleteAction(p.id, moduleId || null, a.id); }}
          title="Delete action"
        >×</button>
      )}
    </div>
  );

  const renderAddRow = (projectId, moduleId) => {
    const key = moduleId ? `${projectId}:${moduleId}` : projectId;
    if (addingFor === key) {
      return (
        <div className="today-action-add-form">
          <input
            className="today-action-add-input"
            placeholder="Describe next action…"
            value={addText}
            onChange={e => setAddText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submitAdd(projectId, moduleId);
              if (e.key === 'Escape') cancelAdding();
            }}
            autoFocus
          />
          <input
            className="today-action-add-min"
            placeholder="min"
            type="number"
            value={addMinutes}
            onChange={e => setAddMinutes(e.target.value)}
            min={5} max={480}
          />
          <button className="today-action-add-submit" onClick={() => submitAdd(projectId, moduleId)}>Add</button>
          <button className="today-action-add-cancel" onClick={cancelAdding}>✕</button>
        </div>
      );
    }
    return onAddAction ? (
      <button className="today-action-add-row" onClick={() => startAdding(key)}>+ next action</button>
    ) : null;
  };

  return (
    <div className="today-rail-section today-projects-section">
      <div className="today-rail-header">
        <div className="today-rail-eyebrow">Projects</div>
        <div className="today-rail-count">{railProjects.length}</div>
      </div>
      <div className="today-rail-list">
        {railProjects.length === 0 ? (
          <div className="today-rail-empty">No projects.</div>
        ) : railProjects.map(p => {
          const isCollapsed = !!collapsedMap[p.id];
          return (
            <div key={p.id} className={`today-project-chip ${isCollapsed ? 'collapsed' : ''}`} style={{ '--card-accent': p.color || 'var(--primary)' }}>
              <div className="today-project-chip-header" onClick={() => toggleCollapse(p.id)}>
                <span className={`today-project-chip-chevron ${isCollapsed ? 'collapsed' : ''}`}>▾</span>
                <div className="today-project-chip-name" title={p.name}>{p.name.replace('APP - ', '')}</div>
                <div className="today-project-chip-tier">T{p.tier}</div>
              </div>
              {!isCollapsed && p._isMaster && p._modules.length > 0 && (
                <div className="today-project-modules">
                  <div className="today-project-modules-eyebrow">Modules · Priority</div>
                  {p._modules.map(m => {
                    const mKey = `${p.id}:${m.id || m.number}`;
                    const mExpanded = !!expandedModules[mKey];
                    const isDone = m.status === 'done';
                    return (
                      <div key={mKey} className={`today-module ${mExpanded ? 'expanded' : ''} ${isDone ? 'done' : ''}`}>
                        <div className="today-module-row" onClick={() => toggleModule(p.id, m.id || m.number)}>
                          <span className={`today-module-num ${mExpanded ? 'expanded' : ''}`}>#{m.number}</span>
                          <span className="today-module-title">{m.name || m.title}</span>
                          {m.estimateHours != null && (
                            <span className="today-module-time">~{m.estimateHours}h</span>
                          )}
                          <span className={`today-module-dot ${isDone ? 'done' : (mExpanded ? 'active' : '')}`} />
                        </div>
                        {mExpanded && (
                          <div className="today-module-body">
                            {m.description && (
                              <div className="today-module-desc">{m.description}</div>
                            )}
                            {m.nextActions && m.nextActions.length > 0 && (
                              <>
                                <div className="today-module-actions-eyebrow">Next actions</div>
                                <div className="today-module-actions">
                                  {m.nextActions.map(a => renderActionTile(p, a, m.id))}
                                </div>
                              </>
                            )}
                            {renderAddRow(p.id, m.id)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {!isCollapsed && !p._isMaster && (
                <div className="today-project-chip-actions">
                  {p._actions.map(a => renderActionTile(p, a, null))}
                  {renderAddRow(p.id, null)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PortfolioPanel({ projects, scheduledBlocks, weekStart }) {
  const [expandedId, setExpandedId] = useState('next'); // NEXT expanded by default

  const totalBudgetMin = projects.reduce((sum, p) => sum + (p.weeklyBudgetHours || 0) * 60, 0);
  const totalScheduledMin = projects.reduce(
    (sum, p) => sum + plannedMinutesForProject(scheduledBlocks, weekStart, p.id),
    0
  );
  const overBudget = totalScheduledMin > totalBudgetMin;
  const actionStates = useMemo(() => actionStateMap(scheduledBlocks), [scheduledBlocks]);

  return (
    <div className="portfolio-section">
      <div className="portfolio-header">
        <div className="portfolio-eyebrow">Portfolio</div>
        <div className={`portfolio-budget-summary ${overBudget ? 'over' : ''}`}>
          <b>{minutesToHrLabel(totalScheduledMin)}</b> / {minutesToHrLabel(totalBudgetMin)} this week
        </div>
      </div>
      <div className="portfolio-list">
        {projects.map(project => (
          <ProjectCard
            key={project.id}
            project={project}
            expanded={expandedId === project.id}
            onToggle={() => setExpandedId(expandedId === project.id ? null : project.id)}
            scheduledBlocks={scheduledBlocks}
            weekStart={weekStart}
            actionStates={actionStates}
          />
        ))}
      </div>
    </div>
  );
}

function minutesToHrLabel(min) {
  if (!min) return '0h';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function ProjectCard({ project, expanded, onToggle, scheduledBlocks, weekStart, actionStates }) {
  const isMaster = !!project.isMaster;
  const tierLabel = `Tier ${project.tier}`;

  const plannedMin = plannedMinutesForProject(scheduledBlocks, weekStart, project.id);
  const budgetMin = (project.weeklyBudgetHours || 0) * 60;
  const fillPct = budgetMin > 0 ? Math.min(100, (plannedMin / budgetMin) * 100) : 0;
  const isOver = budgetMin > 0 && plannedMin > budgetMin;
  const isSlackOnly = project.weeklyBudgetHours === 0;

  const budgetText = isSlackOnly
    ? 'slack only'
    : `${minutesToHrLabel(plannedMin)} / ${project.weeklyBudgetHours}h`;

  return (
    <div
      className={`project-card ${isMaster ? 'master' : ''} ${expanded ? 'expanded' : ''}`}
      style={{ '--card-accent': project.color || 'var(--border)' }}
    >
      <div className="project-card-header" onClick={onToggle}>
        <div className="project-card-top">
          <div className="project-card-name" style={isMaster ? { color: project.color } : {}}>
            {project.name}
          </div>
          <div className="project-card-tier">{tierLabel}</div>
        </div>
        {project.subtitle && (
          <div className="project-card-subtitle">{project.subtitle}</div>
        )}
        <div className="project-card-status">{project.status}</div>
        <div className="project-card-meta">
          <div className="project-card-budget">
            {!isSlackOnly && (
              <div className="project-card-budget-bar">
                <div
                  className="project-card-budget-bar-fill"
                  style={{
                    width: `${fillPct}%`,
                    background: isOver ? 'var(--coral)' : project.color,
                  }}
                />
              </div>
            )}
            <span className="project-card-budget-text" style={isOver ? { color: 'var(--coral)' } : {}}>
              {budgetText}
            </span>
          </div>
          {project.totalEffortRemainingHours != null && (
            <span className="project-card-effort">~{project.totalEffortRemainingHours}h remaining</span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="project-card-body">
          {isMaster && project.modules ? (
            <NextModulesList project={project} actionStates={actionStates} />
          ) : (
            <ProjectNextActions project={project} actionStates={actionStates} />
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ActionChip — draggable chip representing a "next action" in the portfolio
// ─────────────────────────────────────────────────────────────
function ActionChip({ action, project, moduleNumber, actionStates }) {
  const state = actionStates[action.id];
  const status = state ? state.status : 'open';
  const draggable = status !== 'completed';

  const onDragStart = (e) => {
    if (!draggable) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = 'copy';
    const payload = {
      type: 'next-action',
      projectId: project.id,
      actionId: action.id,
      title: action.text,
      duration: action.estimatedMin || 30,
      moduleNumber: moduleNumber || null,
      color: project.color,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.currentTarget.classList.add('next-action-dragging');
  };
  const onDragEnd = (e) => {
    e.currentTarget.classList.remove('next-action-dragging');
  };

  const cls = `next-action${status === 'scheduled' ? ' scheduled' : ''}`;
  const tooltip = draggable
    ? (status === 'scheduled'
        ? 'Already scheduled — drag to schedule another instance'
        : 'Drag onto a calendar slot to schedule')
    : 'Completed';

  return (
    <div
      className={cls}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={tooltip}
    >
      <div className="next-action-text">{action.text}</div>
      {status === 'scheduled' && (
        <span className="next-action-badge scheduled" title="A calendar block exists for this">SCHED</span>
      )}
      {action.estimatedMin && status !== 'scheduled' && (
        <div className="next-action-time">~{action.estimatedMin}m</div>
      )}
    </div>
  );
}

function ProjectNextActions({ project, actionStates }) {
  const actions = (project.nextActions || []).filter(a => {
    const s = actionStates[a.id];
    return !s || s.status !== 'completed';
  });
  if (actions.length === 0) {
    return <div style={{ fontSize: 11, color: 'var(--muted-4)', fontStyle: 'italic' }}>All actions complete or none defined.</div>;
  }
  return (
    <>
      <div className="next-actions-label">Next actions</div>
      {actions.map(a => (
        <ActionChip key={a.id} action={a} project={project} actionStates={actionStates} />
      ))}
    </>
  );
}

function NextModulesList({ project, actionStates }) {
  const [expandedModuleId, setExpandedModuleId] = useState(null);
  const sequence = project.prioritySequence || [];
  const moduleByNumber = {};
  project.modules.forEach(m => { moduleByNumber[m.number] = m; });
  const orderedModules = [];
  sequence.forEach(n => { if (moduleByNumber[n]) orderedModules.push(moduleByNumber[n]); });
  project.modules.forEach(m => { if (!sequence.includes(m.number)) orderedModules.push(m); });

  return (
    <>
      <div className="next-actions-label">Modules · priority order</div>
      <div className="module-list">
        {orderedModules.map((mod, idx) => {
          const statusStyle = MODULE_STATUS_STYLE[mod.status] || MODULE_STATUS_STYLE['not started'];
          const isExpanded = expandedModuleId === mod.id;
          const isTop = idx < 3;
          const visibleActions = (mod.nextActions || []).filter(a => {
            const s = actionStates[a.id];
            return !s || s.status !== 'completed';
          });
          return (
            <div key={mod.id} className={`module-row ${isExpanded ? 'expanded' : ''}`}>
              <div className="module-row-header" onClick={() => setExpandedModuleId(isExpanded ? null : mod.id)}>
                <div className={`module-row-priority ${isTop ? 'top' : ''}`}>#{idx + 1}</div>
                <div className="module-row-name">{mod.name}</div>
                <div className="module-row-effort">~{mod.effortRemainingHours}h</div>
                <div
                  className="module-row-status"
                  style={{ background: statusStyle.color }}
                  title={statusStyle.label}
                />
              </div>
              {isExpanded && (
                <div className="module-row-body">
                  <div className="module-row-description">{mod.description}</div>
                  <div className="next-actions-label">Next actions</div>
                  {visibleActions.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--muted-4)', fontStyle: 'italic' }}>All actions complete.</div>
                  ) : (
                    visibleActions.map(a => (
                      <ActionChip key={a.id} action={a} project={project} moduleNumber={mod.number} actionStates={actionStates} />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════════════════
// BLOCK POPOVER — click any scheduled block to manage it
// ═════════════════════════════════════════════════════════════
function BlockPopover({ block, projects, onClose, onUpdate, onDelete }) {
  const project = projects.find(p => p.id === block.projectId);
  const projectColor = (project && project.color) || 'var(--primary)';
  const dateObj = new Date(block.date);
  const dayName = DAY_NAMES_LONG[(dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1)];
  const startMin = toMinutes(block.start);
  const endMin = startMin + (block.duration || 0);
  const endStr = `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`;

  const isPast = new Date(block.date).getTime() < startOfDay(new Date()).getTime() - 1;
  const isCompleted = block.status === 'completed';
  const isPartial = block.status === 'partial';

  // Local form state for editing duration + start
  const [editStart, setEditStart] = useState(block.start);
  const [editDuration, setEditDuration] = useState(block.duration);
  const [actualMin, setActualMin] = useState(block.actualMinutes || block.duration || 30);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleComplete = () => {
    onUpdate({
      status: 'completed',
      actualMinutes: Number(actualMin) || 0,
      completedAt: new Date().toISOString(),
    });
    onClose();
  };
  const handlePartial = () => {
    onUpdate({
      status: 'partial',
      actualMinutes: Number(actualMin) || 0,
      completedAt: new Date().toISOString(),
    });
    onClose();
  };
  const handleSkip = () => {
    // Treat skip as deletion (action returns to open). For past blocks this also removes
    // them from the calendar — which matches "didn't happen".
    onDelete();
  };
  const handleSaveEdit = () => {
    const dur = Number(editDuration);
    if (!editStart.match(/^\d{1,2}:\d{2}$/) || isNaN(dur) || dur < 5) return;
    const [h, m] = editStart.split(':').map(Number);
    const cleanStart = `${pad(h)}:${pad(m)}`;
    onUpdate({ start: cleanStart, duration: dur });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal" style={{ borderTopColor: projectColor }}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <div className="modal-header">
          <div className="modal-eyebrow" style={{ color: projectColor }}>
            {project ? project.name : 'Block'}
            {isCompleted && ' · completed'}
            {isPartial && ' · partial'}
          </div>
          <div className="modal-title">{block.title}</div>
          <div className="modal-meta">
            <span>{dayName} · {formatDateShort(dateObj)}</span>
            <span>{block.start}–{endStr}</span>
            <span>{block.duration} min scheduled</span>
            {block.actualMinutes != null && (
              <span style={{ color: 'var(--teal)' }}>{block.actualMinutes} min spent</span>
            )}
          </div>
        </div>

        <div className="modal-body">
          {!isCompleted && (
            <div className="modal-section">
              <div className="modal-section-label">Time spent</div>
              <div className="modal-input-row">
                <input
                  type="number"
                  className="modal-input"
                  value={actualMin}
                  min="0" max="600" step="5"
                  onChange={e => setActualMin(e.target.value)}
                />
                <span className="modal-input-suffix">minutes</span>
              </div>
            </div>
          )}

          <div className="modal-section">
            <div className="modal-section-label">{isCompleted ? 'Adjust' : 'Mark this block as'}</div>
            <div className="modal-actions">
              {!isCompleted && (
                <>
                  <button className="modal-btn complete" onClick={handleComplete}>
                    <span>✓ Done · log time and remove from list</span>
                    <span className="modal-btn-hint">action complete</span>
                  </button>
                  <button className="modal-btn" onClick={handlePartial}>
                    <span>½ Partial · log time, action stays open</span>
                    <span className="modal-btn-hint">re-schedule it</span>
                  </button>
                </>
              )}
              <button className="modal-btn danger" onClick={handleSkip}>
                <span>{isPast ? "✕ Didn't happen · remove block" : "✕ Unschedule · return to portfolio"}</span>
                <span className="modal-btn-hint">action returns to open</span>
              </button>
            </div>
          </div>

          {!isCompleted && (
            <div className="modal-section">
              <div className="modal-section-label">Edit time + duration</div>
              <div className="modal-input-row">
                <input
                  type="text"
                  className="modal-input wide"
                  value={editStart}
                  onChange={e => setEditStart(e.target.value)}
                  placeholder="HH:MM"
                />
                <input
                  type="number"
                  className="modal-input"
                  value={editDuration}
                  min="5" max="600" step="5"
                  onChange={e => setEditDuration(e.target.value)}
                />
                <span className="modal-input-suffix">min</span>
                <button className="modal-btn primary" style={{ flex: 1 }} onClick={handleSaveEdit}>
                  <span>Save changes</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarHeader({ weekStart, weekEnd, isCurrentWeek, dayView, onPrev, onNext, onToday, saving, error, lastSyncedAt, onManageRoutine, now, isWorkingAway, onToggleWorkingAway, hideTitle }) {
  const synced = lastSyncedAt
    ? lastSyncedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : '—';
  const status = error ? 'error' : (saving ? 'saving' : '');
  const statusText = error ? 'Save error' : (saving ? 'Saving…' : `Synced ${synced}`);

  const isDayView = dayView !== null;
  const focusedDate = isDayView ? addDays(weekStart, dayView) : null;
  const focusedIsToday = isDayView && isSameDay(focusedDate, new Date());

  const timeLabel = (now || new Date()).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="cal-header">
      {!hideTitle && (
        <div className="cal-title-block">
          <div className="cal-eyebrow">My Planning</div>
          <div className="cal-week-label">
            {isDayView
              ? (focusedIsToday ? 'Today' : DAY_NAMES_LONG[dayView])
              : (isCurrentWeek ? 'This week' : `Week of ${formatDateShort(weekStart)}`)}
          </div>
          <div className="cal-week-range">
            {isDayView ? formatDateShort(focusedDate) + ', ' + focusedDate.getFullYear() : formatRange(weekStart, weekEnd)}
          </div>
          <div className="cal-week-time">{timeLabel}</div>
        </div>
      )}
      <div className="cal-controls">
        <span className={`sync-pill ${status}`}>{statusText}</span>
        {onToggleWorkingAway && (
          <button
            className={`cal-away-pill ${isWorkingAway ? 'active' : ''}`}
            onClick={onToggleWorkingAway}
            title={isWorkingAway ? 'Working away — tap to switch back to home' : 'Tap if you\'re away from home today'}
          >
            {isWorkingAway ? 'Away' : 'At home'}
          </button>
        )}
        {onManageRoutine && (
          <button className="cal-routine-pill" onClick={onManageRoutine} title="Manage your routine items">⚙ Routines</button>
        )}
        <button className="cal-nav-btn" onClick={onPrev} aria-label={isDayView ? 'Previous day' : 'Previous week'}>‹</button>
        <button
          className={`cal-today-btn ${(isDayView ? focusedIsToday : isCurrentWeek) ? 'active' : ''}`}
          onClick={onToday}
        >Today</button>
        <button className="cal-nav-btn" onClick={onNext} aria-label={isDayView ? 'Next day' : 'Next week'}>›</button>
      </div>
    </div>
  );
}

function Legend() {
  const keys = ['supplement', 'focus', 'gym', 'commute', 'review', 'planning', 'elsewhere'];
  return (
    <div className="legend">
      {keys.map(k => {
        const s = CATEGORY_STYLES[k];
        return (
          <div key={k} className="legend-item" style={{ color: s.color }}>
            <span className="legend-swatch" style={{ borderLeftColor: s.color }} />
            <span>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// WEEK GRID (desktop) — supports singleCol mode for day view
// ═════════════════════════════════════════════════════════════
const HOUR_HEIGHT_WEEK = 56;
const HOUR_HEIGHT_DAY  = 80;
const START_HOUR = 6;
const END_HOUR = 23;
const HOURS_VISIBLE = END_HOUR - START_HOUR;

function WeekGrid({ routine, overrides, scheduledBlocks, projects, weekStart, now, singleCol, onDayClick, onCreateBlock, onBlockClick, onRoutineClick, onUpdateBlock, elsewhereToggles, icsOccurrences, onTodoDrop, completions, onToggleComplete, categoryStyles }) {
  const isDayView = singleCol !== null && singleCol !== undefined;
  const HOUR_HEIGHT = isDayView ? HOUR_HEIGHT_DAY : HOUR_HEIGHT_WEEK;
  const totalHeight = HOURS_VISIBLE * HOUR_HEIGHT;
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(now));

  const cols = isDayView ? [singleCol] : [0, 1, 2, 3, 4, 5, 6];

  const [activeDropCol, setActiveDropCol] = useState(null);
  const [dropPreview, setDropPreview] = useState(null); // { col, top, height }
  const dragPayloadRef = useRef(null);

  // Convert mouse Y position within a day column → snapped HH:MM string
  const yToTimeString = (y) => {
    const minutesFromGridStart = (y / HOUR_HEIGHT) * 60;
    const totalMinutes = START_HOUR * 60 + minutesFromGridStart;
    const snapped = Math.max(START_HOUR * 60, Math.round(totalMinutes / 15) * 15);
    const clamped = Math.min(snapped, END_HOUR * 60 - 15);
    return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
  };

  const onColDragOver = (e, col) => {
    if (!onCreateBlock) return;
    // Only handle drags carrying our payload
    if (!Array.from(e.dataTransfer.types).includes('application/json')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const startStr = yToTimeString(y);
    const startMin = toMinutes(startStr);
    const dur = (dragPayloadRef.current && dragPayloadRef.current.duration) || 30;
    const top = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
    const height = (dur / 60) * HOUR_HEIGHT;
    setActiveDropCol(col);
    setDropPreview({ col, top, height, start: startStr });
  };

  const onColDragLeave = (e) => {
    // dragleave fires when entering child elements; only clear on actual exit
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setActiveDropCol(null);
    setDropPreview(null);
  };

  const onColDrop = (e, col) => {
    e.preventDefault();
    setActiveDropCol(null);
    setDropPreview(null);
    let payload;
    try {
      payload = JSON.parse(e.dataTransfer.getData('application/json'));
    } catch { return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const startStr = yToTimeString(y);
    const date = startOfDay(addDays(weekStart, col)).toISOString();
    if (payload.type === 'next-action') {
      onCreateBlock({
        projectId: payload.projectId,
        actionId: payload.actionId,
        title: payload.title,
        date,
        start: startStr,
        duration: payload.duration || 30,
      });
    } else if (payload.type === 'todo' && onTodoDrop) {
      onTodoDrop({
        todoId: payload.todoId,
        date,
        start: startStr,
        dropX: e.clientX,
        dropY: e.clientY,
      });
    }
    dragPayloadRef.current = null;
  };

  // Capture drag enter on document so we can read the payload (dataTransfer.getData
  // is restricted during dragover) — we read it from a ref instead, set on drag start.
  // Action chips in this app set window-level state via their own dragstart; we keep it simple
  // by re-parsing on dragover with a heuristic since duration is in payload.
  // Actually the cleanest path: read getData synchronously on drop only. For the preview
  // size we use the payload's duration value the chip set on a global window field.
  useEffect(() => {
    const handler = (e) => {
      if (!Array.from(e.dataTransfer.types).includes('application/json')) return;
      // Some browsers expose getData on dragstart only. We listen to dragstart globally:
    };
    const onDragStart = (e) => {
      try {
        const raw = e.dataTransfer.getData('application/json');
        if (raw) dragPayloadRef.current = JSON.parse(raw);
      } catch {}
    };
    // Listen at the document level so any chip's dragstart updates our ref
    document.addEventListener('dragstart', onDragStart, true);
    return () => document.removeEventListener('dragstart', onDragStart, true);
  }, []);

  return (
    <div className="week-grid">
      <div className="week-grid-header">
        <div className="time-gutter-header" />
        {cols.map(col => {
          const date = addDays(weekStart, col);
          const isToday = isCurrentWeek && isSameDay(date, now);
          const isWeekend = col === 5 || col === 6;
          return (
            <div
              key={col}
              className={`day-header ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}`}
              onClick={() => onDayClick && onDayClick(col)}
              title={isDayView ? 'Click to return to week view' : 'Click to zoom into this day'}
            >
              <div className="day-header-name">{DAY_NAMES_SHORT[col]}</div>
              <div className="day-header-date">{date.getDate()}</div>
            </div>
          );
        })}
      </div>

      <div className="week-grid-body" style={{ height: totalHeight }}>
        <div className="time-gutter">
          {Array.from({ length: HOURS_VISIBLE + 1 }, (_, i) => {
            const h = START_HOUR + i;
            const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
            return (
              <div
                key={i}
                className="hour-label"
                style={{ top: i * HOUR_HEIGHT }}
              >{label}</div>
            );
          })}
        </div>

        {cols.map(col => {
          const date = addDays(weekStart, col);
          const isToday = isCurrentWeek && isSameDay(date, now);
          const isWeekend = col === 5 || col === 6;
          const dayItems = combinedDayItems(col, routine, scheduledBlocks || [], weekStart, overrides, elsewhereToggles, now, icsOccurrences, completions);

          return (
            <div
              key={col}
              className={`day-column ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''} ${activeDropCol === col ? 'drop-active' : ''}`}
              onDragOver={(e) => onColDragOver(e, col)}
              onDragLeave={onColDragLeave}
              onDrop={(e) => onColDrop(e, col)}
            >
              {Array.from({ length: HOURS_VISIBLE }, (_, i) => (
                <div
                  key={i}
                  className="hour-line"
                  style={{ top: (i + 1) * HOUR_HEIGHT }}
                />
              ))}
              {dayItems.map(item => (
                <CalItem
                  key={item.id + ':' + col}
                  item={item}
                  date={date}
                  hourHeight={HOUR_HEIGHT}
                  projects={projects}
                  onBlockClick={onBlockClick}
                  onRoutineClick={onRoutineClick}
                  onUpdateBlock={onUpdateBlock}
                  onToggleComplete={onToggleComplete}
                  categoryStyles={categoryStyles}
                />
              ))}
              {isToday && <NowLine now={now} hourHeight={HOUR_HEIGHT} />}
              {dropPreview && dropPreview.col === col && (
                <div className="drop-ghost" style={{ top: dropPreview.top, height: dropPreview.height }}>
                  <div style={{ padding: 4, fontSize: 10, color: 'var(--primary)', fontFamily: 'var(--mono)', letterSpacing: '0.05em' }}>
                    {dropPreview.start}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalItem({ item, date, hourHeight, projects, onBlockClick, onRoutineClick, onUpdateBlock, onToggleComplete, categoryStyles }) {
  const CATS = categoryStyles || CATEGORY_STYLES;
  const isBlock = item._kind === 'block';
  const isRoutine = item._kind === 'routine';
  const isIcs = item._kind === 'ics';
  const block = isBlock ? item._block : null;
  const project = isBlock && projects ? projects.find(p => p.id === block.projectId) : null;
  const projectColor = (project && project.color) || 'var(--primary)';
  const isTodoBlock = isBlock && !!block.todoId;

  // Style + colors
  let style;
  if (isBlock) {
    if (isTodoBlock) {
      style = { color: '#B8A082', bgAlpha: 0.18 };
    } else {
      style = { color: projectColor, bgAlpha: 0.18 };
    }
  } else if (isIcs) {
    const icsColor = (item._ics && item._ics.color) || (item._ics && item._ics.source === 'work' ? '#8C8C96' : '#7896AF');
    style = { color: icsColor, bgAlpha: 0.16 };
  } else {
    style = (CATS[item.category] || CATS.supplement);
  }

  const startMin = toMinutes(item.start);
  const offsetMin = startMin - START_HOUR * 60;
  const top = (offsetMin / 60) * hourHeight;

  // Resize state (block-only, while dragging the bottom handle)
  const [resizingDuration, setResizingDuration] = useState(null);
  const effectiveDuration = resizingDuration != null ? resizingDuration : item.duration;
  const rawHeight = (effectiveDuration / 60) * hourHeight;
  const height = Math.max(rawHeight, 22);
  const isTiny = rawHeight < 26;
  const isShort = !isTiny && rawHeight < 50;

  const lane = item._lane || 0;
  const totalLanes = item._totalLanes || 1;
  const colspan = item._colspan || 1;
  const widthPct = (100 / totalLanes) * colspan;
  const leftPct = (100 / totalLanes) * lane;

  const endMin = startMin + effectiveDuration;
  const endStr = `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`;

  // Resize handler — only on blocks. Drags the bottom edge to change duration.
  const onResizeStart = (e) => {
    if (!isBlock || !onUpdateBlock) return;
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const initialDuration = item.duration;
    let lastDur = initialDuration;
    const onMove = (ev) => {
      const dy = ev.clientY - startY;
      const minutesDelta = (dy / hourHeight) * 60;
      let newDur = initialDuration + minutesDelta;
      newDur = Math.max(15, Math.round(newDur / 15) * 15); // snap to 15 min, min 15
      newDur = Math.min(newDur, (END_HOUR - START_HOUR) * 60 - (startMin - START_HOUR * 60)); // don't exceed view
      if (newDur !== lastDur) {
        lastDur = newDur;
        setResizingDuration(newDur);
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (lastDur !== initialDuration) {
        onUpdateBlock(block.id, { duration: lastDur });
      }
      setResizingDuration(null);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const tooltipParts = isBlock
    ? [
        `${item.title}`,
        project ? `Project: ${project.name}` : null,
        `${item.start}–${endStr} (${effectiveDuration} min)`,
        block.status === 'partial' ? `Partial · ${block.actualMinutes || 0} min logged` : null,
        block.status === 'completed' ? `Completed · ${block.actualMinutes || 0} min` : null,
        'Click to manage · drag bottom edge to resize',
      ].filter(Boolean)
    : isIcs
      ? [
          `${item.title}`,
          `Source: ${item._ics.source === 'work' ? 'Work calendar' : 'Household calendar'}`,
          `${item.start}–${endStr}`,
          item._ics.location ? `Location: ${item._ics.location}` : null,
          'Read-only · edit in source calendar',
        ].filter(Boolean)
      : [
          `${item.title} · ${item.start}–${endStr}`,
          item.note,
          item.homeOnly ? '(home only)' : null,
          item._moved ? 'Moved this week from another day' : null,
          item._overridden ? 'Edited just for this week' : null,
          'Click to edit',
        ].filter(Boolean);

  let cls = 'cal-item';
  if (isTiny) cls += ' tiny';
  else if (isShort) cls += ' short';
  if (isBlock) {
    cls += ' project-block';
    if (block.status === 'completed') cls += ' completed';
    if (block.status === 'partial') cls += ' partial';
    if (resizingDuration != null) cls += ' resizing';
  }
  if (isRoutine) {
    cls += ' routine-item';
    if (item._moved) cls += ' moved';
    else if (item._overridden) cls += ' overridden';
    if (item._completed) cls += ' routine-completed';
  }
  if (isIcs) {
    cls += ' ics-event';
    cls += item._ics.source === 'work' ? ' ics-work' : ' ics-household';
    if (item._ics.allDay) cls += ' all-day';
  }

  const onClick = (e) => {
    // Don't trigger when the click was actually on the resize handle or completion checkbox
    if (e.target.classList && (
      e.target.classList.contains('cal-item-resize-handle') ||
      e.target.classList.contains('cal-item-check') ||
      e.target.closest('.cal-item-check')
    )) return;
    if (isIcs) return; // ICS events are read-only
    e.stopPropagation();
    if (isBlock && onBlockClick) onBlockClick(block.id);
    else if (isRoutine && onRoutineClick && date) onRoutineClick(item.id, date);
  };

  const handleToggleComplete = (e) => {
    e.stopPropagation();
    if (onToggleComplete && date) onToggleComplete(item.id, date);
  };

  // 12-hour time format with am/pm
  const fmt12 = (m) => {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const period = h >= 12 ? 'pm' : 'am';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return min === 0 ? `${h12}` : `${h12}:${pad(min)}`;
  };
  const startPeriod = startMin >= 12 * 60 ? 'pm' : 'am';
  const endPeriod = endMin >= 12 * 60 ? 'pm' : 'am';
  const timeLabel = startPeriod === endPeriod
    ? `${fmt12(startMin)} – ${fmt12(endMin)}${endPeriod}`
    : `${fmt12(startMin)}${startPeriod} – ${fmt12(endMin)}${endPeriod}`;

  // Solid color fill for non-completed items; soft tint for completed.
  const blockColor = item._completed ? '#7EB8A4' : (isBlock ? (project?.color || style.color) : style.color);
  const isHexColor = typeof blockColor === 'string' && blockColor.startsWith('#');

  return (
    <div
      className={cls}
      title={tooltipParts.join('\n')}
      onClick={onClick}
      style={{
        top,
        height,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        background: item._completed
          ? hexToRgba('#7EB8A4', 0.25)
          : (isHexColor ? blockColor : style.color),
      }}
    >
      {isRoutine && !isTiny && (
        <button
          className="cal-item-check"
          onClick={handleToggleComplete}
          title={item._completed ? 'Mark not done' : 'Mark done'}
          aria-label={item._completed ? 'Mark not done' : 'Mark done'}
        >
          {item._completed ? '✓' : ''}
        </button>
      )}
      <div className="cal-item-title">
        {!isBlock && style && style.emoji ? `${style.emoji} ` : ''}
        {item.title}
        {item.homeOnly && !isBlock && <span className="cal-item-home-flag" />}
      </div>
      {!isTiny && (
        <div className="cal-item-time">{timeLabel}</div>
      )}
      {isBlock && project && !isTiny && !isShort && (
        <div className="cal-item-project">{project.name}</div>
      )}
      {item.note && !isTiny && !isShort && !isBlock && (
        <div className="cal-item-note">{item.note}</div>
      )}
      {isBlock && block.status !== 'completed' && (
        <div className="cal-item-resize-handle" onMouseDown={onResizeStart} />
      )}
    </div>
  );
}

function NowLine({ now, hourHeight }) {
  const min = now.getHours() * 60 + now.getMinutes();
  const offsetMin = min - START_HOUR * 60;
  if (offsetMin < 0 || offsetMin > HOURS_VISIBLE * 60) return null;
  const top = (offsetMin / 60) * hourHeight;
  return <div className="now-line" style={{ top }} />;
}

// ═════════════════════════════════════════════════════════════
