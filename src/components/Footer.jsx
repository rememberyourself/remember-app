export default function Footer() {
  return (
    <footer className="pt-16 pb-8 px-4 text-center">
      <p className="text-earth-600 text-xs tracking-[0.2em] mb-1 heading-brand" style={{ fontSize: '14px' }}>
        Remember Yourself
      </p>
      <p className="text-earth-700 text-[11px] mb-1">
        Oliver Rust ·{' '}
        <a href="https://rememberyourself.ch" target="_blank" rel="noopener noreferrer"
           className="text-gold-500/60 hover:text-gold-400 transition-colors">
          rememberyourself.ch
        </a>
      </p>
      <p className="text-earth-700 text-[10px]">© 2026 Remember Yourself · <span className="text-earth-800">v8</span></p>
    </footer>
  );
}
