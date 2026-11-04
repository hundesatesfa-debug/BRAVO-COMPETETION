import { ArrowRight, BookOpenCheck, CreditCard, FileCheck2, GraduationCap, Trophy, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Brand } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const onboarding = [
  { icon: Trophy, title: 'Join a competition', text: 'Browse competitions that are open to your academic profile and read the entry rules first.' },
  { icon: CreditCard, title: 'Submit your payment', text: 'Pay using the published Telebirr or CBE Birr instructions, then upload the receipt for an administrator to verify.' },
  { icon: BookOpenCheck, title: 'Prepare with your materials', text: 'The study room is being built to keep your lecture documents on your device by default, including for offline study.' },
  { icon: WalletCards, title: 'Track your Bravos', text: 'Bravos measure study engagement and daily consistency. They are not money and do not count as exam marks.' },
  { icon: FileCheck2, title: 'Take scheduled exams', text: 'Competition results are based on examination performance. Rankings and reward calculations are finalized on the server.' },
  { icon: GraduationCap, title: 'Review results and rewards', text: 'If you qualify, an administrator records your manual payout and transaction reference in your competition history.' },
];

export default function WelcomePage() {
  const { account } = useAuth();
  const firstName = (account?.profile.full_name || 'Student').split(' ')[0];

  return <main className="welcome-page">
    <header className="welcome-header wrap"><Brand /><span>STUDENT ONBOARDING</span></header>
    <section className="welcome-content wrap">
      <div className="welcome-heading"><div className="eyebrow"><span className="live-dot" /> A CLEAR START</div><h1>Welcome, {firstName}.</h1><p>Here is how BRAVO Academy works, from your first competition to a finalized result.</p></div>
      <div className="onboarding-grid">{onboarding.map(({ icon: Icon, title, text }, index) => <article className="onboarding-card" key={title}>
        <div className="onboarding-card-head"><span className="onboarding-icon"><Icon size={19} /></span><span>{String(index + 1).padStart(2, '0')}</span></div>
        <h2>{title}</h2><p>{text}</p>
      </article>)}</div>
      <div className="welcome-note"><FileCheck2 size={18} /><p>Competition fees, schedules, capacity, prize rules, and refund terms will be shown before registration. Only pay after checking the rules for that specific competition.</p></div>
      <Link className="button button-primary" to="/dashboard">Open my dashboard <ArrowRight size={17} /></Link>
    </section>
  </main>;
}
