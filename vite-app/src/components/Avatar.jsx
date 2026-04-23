import React from 'react';

export default function Avatar({ src, username, size = 28, style }) {
  if (src) {
    return (
      <img
        src={src}
        alt={username}
        style={{
          width: size, height: size, borderRadius: '50%',
          objectFit: 'cover', flexShrink: 0, ...style
        }}
      />
    );
  }
  const initial = (username || '?').charAt(0).toUpperCase();
  const hue = [...(username || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `hsl(${hue}, 50%, 40%)`, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.45, fontWeight: 700, lineHeight: 1,
      ...style
    }}>
      {initial}
    </div>
  );
}
