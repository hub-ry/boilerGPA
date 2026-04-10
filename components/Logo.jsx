const ASCII = `   ___       _ __        ________  ___ 
  / _ )___  (_) /__ ____/ ___/ _ \\/ _ |
 / _  / _ \\/ / / -_) __/ (_ / ___/ __ |
/____/\\___/_/_/\\__/_/  \\___/_/  /_/ |_|
                                       `;

export function Logo({ className = '' }) {
  return (
    <div
      aria-label="BoilerGPA"
      className={`select-none overflow-hidden ${className}`}
      style={{ height: '36px' }}
    >
      <pre
        style={{
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: '13px',
          lineHeight: '1.15',
          letterSpacing: '0',
          margin: 0,
          padding: 0,
          color: '#CFB991',
          whiteSpace: 'pre',
          WebkitTextStroke: '0.6px #CFB991',
          textShadow: '0.5px 0 0 #CFB991, -0.5px 0 0 #CFB991',
          transformOrigin: 'top left',
          transform: 'scale(0.6)',
        }}
      >
        {ASCII}
      </pre>
    </div>
  );
}
