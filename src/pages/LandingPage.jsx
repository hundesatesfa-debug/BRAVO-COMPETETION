import { ArrowDownRight, ArrowRight, BookOpenCheck, BrainCircuit, Medal, ShieldCheck, Sparkles, Trophy, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Brand } from '../components/UI.jsx';

const steps = [
  { number: '01', title: 'Choose your lane', text: 'Set your academic level and stream. BR@VO brings the right challenges to you.' },
  { number: '02', title: 'Enter the arena', text: 'Join an independent competition and prove your skill in a fair, timed examination.' },
  { number: '03', title: 'Rise by merit', text: 'See your official result and how you rank among eligible competitors.' },
];

export default function LandingPage() {
  return <div className="landing-page">
    <header className="site-header wrap">
      <Brand />
      <nav className="site-nav" aria-label="Main navigation">
        <a href="#how-it-works">How it works</a><a href="#learning">Learning</a>
      </nav>
      <div className="header-actions"><Link className="text-link" to="/login">Log in</Link><Link className="button button-small button-primary" to="/register">Get started <ArrowRight size={15} /></Link></div>
    </header>

    <main>
      <section className="hero wrap">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot" /> A new standard for academic competition</div>
          <h1>Your knowledge.<br /><span>Your moment.</span></h1>
          <p className="hero-lede">Compete on what you know. Learn what comes next. BR@VO brings ambitious students together to earn their place at the top.</p>
          <div className="hero-actions"><Link to="/register" className="button button-primary">Find your competition <ArrowRight size={17} /></Link><a href="#how-it-works" className="button button-quiet">See how it works <ArrowDownRight size={17} /></a></div>
          <div className="hero-proof"><span className="proof-icon"><ShieldCheck size={17} /></span><span>Fair, score-based rankings<br /><strong>Built for every serious learner</strong></span></div>
        </div>
        <div className="hero-art" aria-label="BR@VO competition preview">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="hero-glow" />
          <div className="floating-label label-top"><span className="label-dot cyan" /> FORMAT PREVIEW</div>
          <div className="hero-emblem"><div className="emblem-ring"><div className="emblem-core"><Trophy size={47} strokeWidth={1.35} /></div></div><div className="emblem-star">✦</div></div>
          <div className="competition-card"><div className="card-topline"><span className="status-pill"><span className="live-dot" /> EVENT FORMAT</span><span className="card-index">INDEPENDENT EVENTS</span></div><h3>Academic<br />Competition</h3><div className="card-divider" /><div className="card-meta"><span><UsersRound size={14} /> Grade 12 + Freshman</span><span className="card-prize"><Medal size={14} /> Real rewards</span></div></div>
          <div className="floating-label label-bottom"><Sparkles size={14} /> PERFORMANCE, NOT PARTICIPATION</div>
          <div className="hero-caption">Designed for the ones who<br />keep asking one more question.</div>
        </div>
      </section>

      <section className="signal-strip"><div className="wrap signal-inner"><span>ONE SCORE</span><i /><span>ONE FAIR SHOT</span><i /><span>YOUR NEXT CHAPTER</span></div></section>

      <section id="how-it-works" className="how-section wrap section-pad">
        <div className="section-heading"><div><div className="eyebrow">THE BR@VO WAY</div><h2>Challenge yourself.<br /><span>Know where you stand.</span></h2></div><p>Every competition is its own event. Join the ones that fit your goals and earn your ranking through your examination score.</p></div>
        <div className="step-grid">{steps.map((step) => <article className="step-card" key={step.number}><span className="step-number">{step.number}</span><h3>{step.title}</h3><p>{step.text}</p><span className="step-line" /></article>)}</div>
      </section>

      <section id="learning" className="learning-band"><div className="wrap learning-inner"><div><div className="eyebrow">MORE THAN A MOMENT</div><h2>Competition sharpens you.<br /><span>Learning carries you forward.</span></h2><p>Build confidence between events with focused study notes, subject practice, and an AI tutor designed to explain—not just answer.</p><Link to="/register" className="inline-link">Start building momentum <ArrowRight size={16} /></Link></div><div className="learning-cards"><div className="learning-card card-notes"><span className="feature-icon"><BookOpenCheck size={20} /></span><h3>Study with purpose</h3><p>Notes aligned to your level and stream.</p><span className="feature-index">01 / LEARN</span></div><div className="learning-card card-tutor"><span className="feature-icon"><BrainCircuit size={20} /></span><h3>Get unstuck</h3><p>A tutor that walks through the why.</p><span className="feature-index">02 / GROW</span></div></div></div></section>

      <section className="final-cta wrap"><div className="cta-orb">✦</div><div><div className="eyebrow">YOUR PLACE IS WAITING</div><h2>Ready to see what you can do?</h2><p>Create a profile and find your next challenge.</p></div><Link to="/register" className="button button-primary">Join BR@VO <ArrowRight size={17} /></Link></section>
    </main>

    <footer className="site-footer wrap"><Brand compact /><span>Built for every mind ready to rise.</span><span className="footer-copy">© 2026 BR@VO</span></footer>
  </div>;
}
