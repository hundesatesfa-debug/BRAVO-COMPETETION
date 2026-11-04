import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  CalendarDays,
  Check,
  CircleHelp,
  GraduationCap,
  LockKeyhole,
  Menu,
  ShieldCheck,
  Sparkles,
  Trophy,
  WalletCards,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand, Notice } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const steps = [
  { icon: Trophy, number: '01', title: 'Choose a competition', text: 'Join a weekly Micro-Arena or the Grand Competition when registration is open.' },
  { icon: WalletCards, number: '02', title: 'Pay and submit proof', text: 'Follow the published Telebirr or CBE Birr instructions, then send your receipt for manual review.' },
  { icon: BookOpenCheck, number: '03', title: 'Prepare at your pace', text: 'Use your lecture materials to study. Bravos track engagement; they are not cash and never replace exam scores.' },
  { icon: BadgeCheck, number: '04', title: 'Take the exam', text: 'Eligible students sit the scheduled exam. Results, rankings, and any rewards are finalized under the published rules.' },
];

const questions = [
  { question: 'What are Bravos?', answer: 'Bravos are educational engagement points. They help you track consistent study activity, are capped at 100 per weekly cycle, and cannot be exchanged for cash.' },
  { question: 'How is a payment verified?', answer: 'You pay through the configured Telebirr or CBE Birr instructions, submit the transaction reference and receipt, and wait for an administrator to check the actual transaction.' },
  { question: 'How are competition rewards calculated?', answer: 'The reward pool is a stated share of verified entry revenue. Eligible participants are ranked by exam performance, with the published tie rule applied at the reward cutoff.' },
  { question: 'Is the Grand Competition capped?', answer: 'No. The Grand Competition has no fixed participant limit. Weekly Micro-Arenas have a strict maximum of 100 students.' },
  { question: 'Are Bravos used to calculate exam results?', answer: 'No. Study engagement and academic performance stay separate. Grand Competition results use 5% weekly exam performance and 95% the final exam.' },
];

export default function LandingPage() {
  const { account, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState('');

  async function logout() {
    setSigningOut(true);
    setError('');
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (logoutError) {
      setError(logoutError.message || 'We could not sign you out. Please try again.');
      setSigningOut(false);
    }
  }

  return <div className="landing-page">
    <header className="site-header wrap">
      <Brand />
      <button className="menu-toggle" type="button" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
      <nav id="main-navigation" className={`site-nav ${menuOpen ? 'open' : ''}`} aria-label="Main navigation">
        <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
        <a href="#competitions" onClick={() => setMenuOpen(false)}>Competitions</a>
        <a href="#bravos" onClick={() => setMenuOpen(false)}>Bravos</a>
        <a href="#about" onClick={() => setMenuOpen(false)}>About</a>
      </nav>
      <div className="header-actions">
        {account ? <>
          <Link className="text-link" to="/dashboard">My dashboard</Link>
          <button className="button button-small button-primary" type="button" onClick={logout} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Log out'}</button>
        </> : <>
          <Link className="text-link" to="/login">Log in</Link>
          <Link className="button button-small button-primary" to="/register">Get started <ArrowRight size={15} /></Link>
        </>}
      </div>
    </header>

    <main>
      {error && <div className="wrap landing-notice"><Notice>{error}</Notice></div>}

      <section id="home" className="hero wrap">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot" /> BUILT FOR ETHIOPIAN UNIVERSITY FRESHMEN</div>
          <h1>Study smarter.<br /><span>Compete better.</span><br />Earn rewards.</h1>
          <p className="hero-lede">Turn everyday study into visible academic progress. Prepare with your own materials, build a steady study habit, and enter fair competitions with clear rules.</p>
          <div className="hero-actions">
            <Link to={account ? '/dashboard' : '/register'} className="button button-primary">{account ? 'Open my dashboard' : 'Start learning'} <ArrowRight size={17} /></Link>
            <a href="#competitions" className="button button-quiet">Explore competitions</a>
          </div>
          <div className="hero-proof"><span className="proof-icon"><ShieldCheck size={18} /></span><span>Clear entry fees. Verified payments.<br /><strong>Scores decided by examination performance.</strong></span></div>
        </div>

        <div className="hero-art" aria-label="BRAVO Academy competition overview">
          <div className="arena-preview">
            <div className="arena-preview-top"><span className="arena-brand-mark"><Trophy size={19} /></span><span className="arena-preview-status"><span /> RULES AT A GLANCE</span></div>
            <div className="arena-preview-title">Your effort,<br />made measurable.</div>
            <div className="arena-preview-row"><span className="arena-preview-icon green"><BookOpenCheck size={17} /></span><span><strong>Study consistently</strong><small>Earn up to 100 Bravos each week</small></span><Check size={17} /></div>
            <div className="arena-preview-row"><span className="arena-preview-icon turquoise"><Trophy size={17} /></span><span><strong>Compete fairly</strong><small>Rankings come from exam results</small></span><Check size={17} /></div>
            <div className="arena-preview-foot"><LockKeyhole size={14} /> Bravos are engagement points, not cash</div>
          </div>
          <span className="hero-art-spark spark-a">✦</span><span className="hero-art-spark spark-b">✦</span>
        </div>
      </section>

      <section className="signal-strip" aria-label="BRAVO Academy commitments"><div className="wrap signal-inner"><span>UNIVERSITY FRESHMEN</span><i /><span>OFFLINE-FIRST STUDY</span><i /><span>TRANSPARENT COMPETITIONS</span></div></section>

      <section id="how-it-works" className="how-section wrap">
        <div className="section-heading"><div><div className="eyebrow">YOUR STUDY JOURNEY</div><h2>Make each step <span>count.</span></h2></div><p>From registration through results, know what happens and what each score means.</p></div>
        <div className="steps-grid">{steps.map(({ icon: Icon, number, title, text }) => <article className="step-card" key={number}>
          <div className="step-card-top"><span className="step-icon"><Icon size={20} /></span><span className="step-number">{number}</span></div>
          <h3>{title}</h3><p>{text}</p>
        </article>)}</div>
      </section>

      <section id="competitions" className="competitions-section">
        <div className="wrap">
          <div className="section-heading"><div><div className="eyebrow">TWO WAYS TO CHALLENGE YOURSELF</div><h2>Choose your <span>arena.</span></h2></div><p>Entry revenue is split using the rules shown here and on each competition before you pay.</p></div>
          <div className="competition-cards">
            <article className="public-competition-card weekly-card">
              <div className="public-card-top"><span className="public-card-icon"><CalendarDays size={21} /></span><span className="public-card-tag">WEEKLY</span></div>
              <h3>Weekly Micro-Arena</h3>
              <p className="public-card-lede">A focused weekly exam with a small, fixed field.</p>
              <div className="public-entry-fee"><strong>10</strong><span>ETB entry fee</span></div>
              <dl className="competition-facts">
                <div><dt>Maximum field</dt><dd>100 students</dd></div>
                <div><dt>Winners</dt><dd>Top 10% of eligible students</dd></div>
                <div><dt>Verified entry revenue</dt><dd>75% rewards · 25% platform</dd></div>
                <div><dt>Exam cycle</dt><dd>Weekly examination</dd></div>
              </dl>
              <Link to={account ? '/dashboard' : '/register'} className="public-card-link">{account ? 'View competitions' : 'Get started'} <ArrowRight size={16} /></Link>
            </article>
            <article className="public-competition-card grand-card">
              <div className="public-card-top"><span className="public-card-icon"><GraduationCap size={21} /></span><span className="public-card-tag">MILESTONE</span></div>
              <h3>Grand Competition</h3>
              <p className="public-card-lede">A longer preparation cycle around major university exams.</p>
              <div className="public-entry-fee"><strong>100</strong><span>ETB entry fee</span></div>
              <dl className="competition-facts">
                <div><dt>Maximum field</dt><dd>No fixed limit</dd></div>
                <div><dt>Winners</dt><dd>Top 10% of eligible students</dd></div>
                <div><dt>Verified entry revenue</dt><dd>50% rewards · 50% platform</dd></div>
                <div><dt>Final score</dt><dd>5% weekly · 95% final exam</dd></div>
              </dl>
              <Link to={account ? '/dashboard' : '/register'} className="public-card-link">{account ? 'View competitions' : 'Get started'} <ArrowRight size={16} /></Link>
            </article>
          </div>
          <p className="rules-note"><ShieldCheck size={16} /> Reward amounts depend on actual verified entries and final results. Registration and rewards follow the published competition rules.</p>
        </div>
      </section>

      <section id="bravos" className="bravos-section wrap">
        <div className="bravo-visual"><div className="bravo-visual-orbit" /><div className="bravo-score"><Sparkles size={21} /><strong>100</strong><span>WEEKLY LIMIT</span></div><div className="bravo-progress"><div><span>Study engagement</span><strong>50</strong></div><i><b /></i><div><span>Unique documents</span><strong>30</strong></div><i><b /></i><div><span>Daily consistency</span><strong>20</strong></div><i><b /></i></div></div>
        <div className="bravo-copy"><div className="eyebrow">A LITTLE PROGRESS, EVERY DAY</div><h2>Bravos celebrate<br /><span>how you study.</span></h2><p>Earn Bravos for active study engagement, spending time with distinct documents, and showing up consistently. Your weekly total is capped at 100.</p><div className="bravo-separation"><span><CircleHelp size={18} /></span><p><strong>Bravos are not cash.</strong> They do not change exam scores, rankings, or reward eligibility. Academic knowledge is measured by examinations.</p></div></div>
      </section>

      <section id="about" className="about-section">
        <div className="wrap about-inner"><div><div className="eyebrow">ABOUT BRAVO ACADEMY</div><h2>Built for focused learning and fair competition.</h2></div><div className="about-copy"><p>BRAVO Academy helps Ethiopian university freshmen make study progress visible and take part in academic competitions with understandable rules. Your lecture files stay on your device by default. Payment receipts are checked by an administrator, and prizes are paid manually after results are finalized.</p><p className="legal-note">Real-money competitions require appropriate legal and regulatory review before launch. BRAVO Academy does not claim regulatory approval.</p><a className="inline-link" href="#rules">Review the competition rules <ArrowRight size={16} /></a></div></div>
      </section>

      <section id="faq" className="faq-section wrap">
        <div className="section-heading"><div><div className="eyebrow">GOOD TO KNOW</div><h2>Frequently asked <span>questions.</span></h2></div></div>
        <div className="faq-list">{questions.map(({ question, answer }) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div>
      </section>

      <section id="rules" className="final-cta wrap"><div><div className="eyebrow">YOUR NEXT STEP STARTS HERE</div><h2>Ready to make your study count?</h2><p>Create your student profile to see competitions available to you.</p></div><Link to={account ? '/dashboard' : '/register'} className="button button-primary">{account ? 'Open my dashboard' : 'Join BRAVO Academy'} <ArrowRight size={17} /></Link></section>
    </main>

    <footer id="contact" className="site-footer wrap"><Brand compact /><span>Study with purpose. Compete with clarity.</span><div className="footer-links"><a href="#rules">Competition rules</a><span>Privacy and contact details will be published before competition launch.</span></div><span className="footer-copy">© 2026 BRAVO Academy</span></footer>
  </div>;
}
