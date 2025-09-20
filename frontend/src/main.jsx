import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import {BrowserRouter} from 'react-router-dom';
import 'primereact/resources/themes/bootstrap4-dark-purple/theme.css'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
import 'primeflex/primeflex.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter> <App /> </BrowserRouter>
  </StrictMode>,
)
