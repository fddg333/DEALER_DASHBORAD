'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password) {
      setError('Enter the password.');
      return;
    }
    setError('');
    setLoading(true);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      window.location.href = '/dashboard';
    } else {
      setError('Wrong password. Try again.');
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: '0 16px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>BM Tiles dashboard</h1>
      <p style={{ color: '#6b6a63', fontSize: 14, marginBottom: 24 }}>Enter the shared password to continue.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #c9c5b8', fontSize: 14, marginBottom: 8 }}
        />
        {error && <div style={{ color: '#a32d2d', fontSize: 13, marginBottom: 8 }}>{error}</div>}
        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: 'none', background: '#1f1e1b', color: '#fff', fontWeight: 500, cursor: 'pointer' }}
        >
          {loading ? 'Checking...' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
