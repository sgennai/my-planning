path = 'src/create/CreateScreen.tsx'
with open(path, 'r') as f: text = f.read()
# Columns
text = text.replace("style={{ flex: 1, background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}", "style={{ flex: 1, background: 'var(--bg-card)', padding: '1.2rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}")
# Ideas card
text = text.replace("style={{ background: '#fff', padding: '0.5rem', marginBottom: '0.5rem', borderLeft: '4px solid #f2c94c' }}", "className=\"kanban-card\" style={{ background: 'var(--bg)', padding: '1rem', marginBottom: '0.8rem', borderLeft: '4px solid #f2c94c', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}")
# Drafting card
text = text.replace("style={{ background: '#fff', padding: '0.5rem', marginBottom: '0.5rem', borderLeft: '4px solid #56ccf2' }}", "className=\"kanban-card\" style={{ background: 'var(--bg)', padding: '1rem', marginBottom: '0.8rem', borderLeft: '4px solid #56ccf2', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}")
# Scheduled card
text = text.replace("style={{ background: '#fff', padding: '0.5rem', marginBottom: '0.5rem', borderLeft: '4px solid #bb6bd9' }}", "className=\"kanban-card\" style={{ background: 'var(--bg)', padding: '1rem', marginBottom: '0.8rem', borderLeft: '4px solid #bb6bd9', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}")
# Published card
text = text.replace("style={{ background: '#fff', padding: '0.5rem', marginBottom: '0.5rem', borderLeft: '4px solid #27ae60' }}", "className=\"kanban-card\" style={{ background: 'var(--bg)', padding: '1rem', marginBottom: '0.8rem', borderLeft: '4px solid #27ae60', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}")

# Input tweaks
text = text.replace("style={{ width: '100%', border: 'none', fontWeight: 'bold' }}", "style={{ width: '100%', border: 'none', fontWeight: '600', fontSize: '1rem', background: 'transparent', outline: 'none' }}")
text = text.replace("style={{ width: '100%', border: 'none', fontSize: '0.9em', color: '#666' }}", "style={{ width: '100%', border: 'none', fontSize: '0.9rem', color: 'var(--muted-3)', background: 'transparent', outline: 'none', marginTop: '4px' }}")
text = text.replace("style={{ width: '100%', border: 'none', fontSize: '0.9em', minHeight: '60px' }}", "style={{ width: '100%', border: 'none', fontSize: '0.9rem', color: 'var(--text)', background: 'transparent', outline: 'none', minHeight: '60px', marginTop: '4px', resize: 'vertical' }}")

with open(path, 'w') as f: f.write(text)

css_path = 'src/index.css'
with open(css_path, 'a') as f:
    f.write("\n.kanban-card { transition: transform 0.15s ease, box-shadow 0.15s ease; }\n.kanban-card:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.05) !important; }\n")
