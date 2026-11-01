import { Link } from 'react-router-dom';
import { AlertTriangle, LoaderCircle, Trophy } from 'lucide-react';

export function Brand({ compact = false }) {
  return <Link className={`brand ${compact ? 'brand-compact' : ''}`} to="/" aria-label="BR@VO home">
    <span className="brand-mark"><Trophy size={18} strokeWidth={2.4} /></span>
    <span>BR<span className="brand-at">@</span>VO</span>
  </Link>;
}

export function LoadingScreen() {
  return <main className="loading-screen"><LoaderCircle className="spin" size={28} /><span>Loading your BR@VO space</span></main>;
}

export function Notice({ children, tone = 'error' }) {
  return <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
    {tone === 'error' && <AlertTriangle size={17} />}
    <span>{children}</span>
  </div>;
}

export function SupabaseSetupNotice() {
  return <Notice>Connect a Supabase project to enable accounts. Copy <code>.env.example</code> to <code>.env.local</code> and add your project URL and anon key.</Notice>;
}
