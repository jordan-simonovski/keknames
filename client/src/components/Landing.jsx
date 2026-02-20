import { useState } from 'react';
import { useSocket } from '../useSocket';

export default function Landing() {
  const { createRoom, joinRoom } = useSocket();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  async function handleCreate() {
    if (!name.trim()) return;
    try { await createRoom(name.trim()); }
    catch (e) { setErr(e); }
  }

  async function handleJoin() {
    if (!name.trim() || !code.trim()) return;
    try { await joinRoom(code.trim(), name.trim()); }
    catch (e) { setErr(e); }
  }

  return (
    <div className="screen landing-screen">
      <div className="landing-container">
        <h1 className="logo">KEKNAMES</h1>
        <p className="tagline">codenames but unhinged</p>
        <div className="landing-form">
          <input
            type="text"
            placeholder="Your name"
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoComplete="off"
          />
          <button className="btn btn-primary" onClick={handleCreate}>
            Create Room
          </button>
          <div className="join-row">
            <input
              type="text"
              placeholder="ROOM CODE"
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              autoComplete="off"
            />
            <button className="btn btn-secondary" onClick={handleJoin}>
              Join
            </button>
          </div>
          {err && <p className="error-msg">{err}</p>}
        </div>
      </div>
    </div>
  );
}
