import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import OvenEntrance from './components/OvenEntrance'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OvenEntrance>
      <App />
    </OvenEntrance>
  </StrictMode>,
)
