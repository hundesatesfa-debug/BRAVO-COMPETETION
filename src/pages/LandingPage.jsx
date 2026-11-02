import { ArrowDownRight, ArrowRight, BookOpenCheck, BrainCircuit, LogOut, ShieldCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand, Notice } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const previews = [
  { number: '01', label: 'STUDY GUIDES', title: 'Build strong foundations', text: 'Organized learning notes for Grade 12 and university freshmen.', icon: BookOpenCheck, art: 'notes' },
  { number: '02', label: 'PRACTICE', title: 'Practice with purpose', text: 'Focused practice tools for the subjects you are working on.', icon: Sparkles, art: 'practice' },
  { number: '03', label: 'STUDY SUPPORT', title: 'Get unstuck, step by step', text: 'A learning companion designed to explain the reasoning behind an answer.', icon: BrainCircuit, art: 'tutor' },
];

export default function LandingPage() {
  const { account, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
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
      <nav className="site-nav" aria-label="Main navigation">
        <a href="#home">Home</a><a href="#about">About</a><a href="#courses">Courses</a><a href="#contact">Contact</a>
      </nav>
      <div className="header-actions">
        {account ? <>
          <Link className="text-link" to="/dashboard">My space</Link>
          <button className="button button-small button-primary" type="button" onClick={logout} disabled={signingOut}><LogOut size={15} />{signingOut ? 'Signing out…' : 'Log out'}</button>
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
          <div className="eyebrow"><span className="live-dot" /> A place for ambitious learners</div>
          <h1>Best challenges are waiting to <span>enrich your skills.</span></h1>
          <p className="hero-lede">Learn with purpose, prepare for what comes next, and find a fair challenge that fits your academic path.</p>
          <div className="hero-actions">
            <Link to={account ? '/dashboard' : '/register'} className="button button-primary">{account ? 'Open my space' : 'Get started'} <ArrowRight size={17} /></Link>
            <a href="#courses" className="button button-quiet">Explore learning <ArrowDownRight size={17} /></a>
          </div>
          <div className="hero-proof"><span className="proof-icon"><ShieldCheck size={18} /></span><span>Built around your goals<br /><strong>For Grade 12 and university freshmen</strong></span></div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="hero-glow" />
          <span className="art-star star-one">✦</span><span className="art-star star-two">✦</span><span className="art-spark">＋</span>
          <div className="student-disc" />
          <div className="student-figure"><div className="student-hair" /><div className="student-head" /><div className="student-neck" /><div className="student-body"><BookOpenCheck size={27} /></div><div className="student-arm student-arm-left" /><div className="student-arm student-arm-right" /><div className="student-leg student-leg-left" /><div className="student-leg student-leg-right" /><div className="student-shoe student-shoe-left" /><div className="student-shoe student-shoe-right" /></div>
          <div className="hero-float-card"><span className="hero-float-icon"><Sparkles size={16} /></span><span><strong>Keep growing</strong><small>Your next step starts here</small></span></div>
          <div className="hero-caption">LEARN · PRACTICE · RISE</div>
        </div>
      </section>

      <section className="signal-strip" aria-label="BR@VO learners"><div className="wrap signal-inner"><span>GRADE 12</span><i /><span>UNIVERSITY FRESHMEN</span><i /><span>NATURAL + SOCIAL SCIENCE</span></div></section>

      <section id="courses" className="courses-section wrap">
        <div className="section-heading"><div><div className="eyebrow">LEARNING THAT MOVES YOU FORWARD</div><h2>Popular <span>learning spaces</span></h2></div><p>Explore the tools BR@VO is building to help you study, practice, and feel ready for your next challenge.</p></div>
        <div className="course-grid">{previews.map((item) => {
          const Icon = item.icon;
          return <article className="course-card" key={item.number}>
            <div className={`course-art course-art-${item.art}`} aria-hidden="true"><div className="art-paper"><span /><span /><span /></div><div className="art-illustration"><Icon size={42} strokeWidth={1.6} /></div><span className="course-art-spark">✦</span></div>
            <div className="course-body"><div className="course-meta"><span>{item.label}</span><span className="coming-pill">Coming soon</span></div><h3>{item.title}</h3><p>{item.text}</p><div className="course-card-footer"><span className="course-index">{item.number} / BR@VO PREVIEW</span><span className="course-arrow"><ArrowRight size={16} /></span></div></div>
          </article>;
        })}</div>
      </section>

      <section id="about" className="learning-band"><div className="wrap learning-inner"><div><div className="eyebrow">THE BR@VO APPROACH</div><h2>Prepare with purpose.<br /><span>Let progress take you further.</span></h2><p>BR@VO is being shaped around focused study, fair academic competitions, and clear student profiles that keep your learning path in view.</p><Link to={account ? '/dashboard' : '/register'} className="inline-link">{account ? 'Go to your space' : 'Create your profile'} <ArrowRight size={16} /></Link></div><div className="learning-cards"><article className="learning-card card-notes"><span className="feature-icon"><BookOpenCheck size={20} /></span><h3>Study with purpose</h3><p>Learning notes matched to your level and stream.</p><span className="feature-index">01 / LEARN</span></article><article className="learning-card card-tutor"><span className="feature-icon"><BrainCircuit size={20} /></span><h3>Grow with support</h3><p>Clear explanations that help you understand the why.</p><span className="feature-index">02 / GROW</span></article></div></div></section>

      <section id="contact" className="final-cta wrap"><div className="cta-orb">✦</div><div><div className="eyebrow">YOUR NEXT STEP STARTS HERE</div><h2>Ready to see what you can do?</h2><p>Create a profile and keep your academic path close.</p></div><Link to={account ? '/dashboard' : '/register'} className="button button-primary">{account ? 'Open my space' : 'Join BR@VO'} <ArrowRight size={17} /></Link></section>
    </main>

    <footer className="site-footer wrap"><Brand compact /><span>Built for every mind ready to rise.</span><span className="footer-copy">© 2026 BR@VO</span></footer>
  </div>;
}
