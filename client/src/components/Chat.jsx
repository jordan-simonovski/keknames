import { useState, useRef, useEffect } from 'react';
import { useSocket } from '../useSocket';

export default function Chat() {
  const { chatMessages, emit } = useSocket();
  const [text, setText] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    emit('send-chat', { text: trimmed });
    setText('');
  }

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {chatMessages.length === 0 && <div className="chat-empty">No messages yet</div>}
        {chatMessages.map((msg, i) => (
          <div key={msg.id || i} className={`chat-msg team-${msg.team || 'none'}`}>
            <span className="chat-author">{msg.name}:</span>
            <span className="chat-text">{msg.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="chat-input-row">
        <input
          type="text"
          placeholder="Message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          maxLength={200}
          autoComplete="off"
        />
      </div>
    </div>
  );
}
