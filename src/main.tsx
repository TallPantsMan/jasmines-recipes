import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import LoginGate from './components/LoginGate.tsx';
import ProfileGate from './components/ProfileGate.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LoginGate>
      <ProfileGate>{(profile) => <App profile={profile} />}</ProfileGate>
    </LoginGate>
  </React.StrictMode>,
);
