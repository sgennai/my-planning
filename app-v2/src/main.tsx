import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './main-app'
import './index.css'
// The design system loads after the legacy sheet so its :root wins the
// cascade and the aliased legacy tokens repaint the not-yet-relaid screens.
import './styles/system.css'
import './styles/shell.css'
import './styles/routine.css'
import './styles/screens.css'
import './styles/cinematic.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
