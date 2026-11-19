import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import VendorQuotePortal from './components/VendorQuotePortal.tsx';
import {isVendorQuotePage} from './lib/vendorQuoteLinks.ts';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isVendorQuotePage() ? <VendorQuotePortal /> : <App />}
  </StrictMode>,
);
