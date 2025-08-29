// frontend/src/components/LandingPage.jsx
import React, { useEffect } from 'react';
import './LandingPage.css';

const LandingPage = ({ onEnterApp }) => {
  useEffect(() => {
    // Smooth scrolling for anchor links
    const handleClick = (e) => {
      const href = e.target.getAttribute('href');
      if (href && href.startsWith('#')) {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      }
    };

    document.addEventListener('click', handleClick);

    // Random glitch effect trigger
    const glitchInterval = setInterval(() => {
      const glitchElements = document.querySelectorAll('.glitch');
      const randomElement = glitchElements[Math.floor(Math.random() * glitchElements.length)];
      if (randomElement) {
        randomElement.style.animation = 'none';
        setTimeout(() => {
          randomElement.style.animation = '';
        }, 100);
      }
    }, 5000);

    // Terminal typing effect
    const terminalOutputs = document.querySelectorAll('.output');
    let delay = 0;
    
    terminalOutputs.forEach((output, index) => {
      setTimeout(() => {
        output.style.opacity = '0';
        output.style.transform = 'translateY(10px)';
        output.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        
        setTimeout(() => {
          output.style.opacity = '0.7';
          output.style.transform = 'translateY(0)';
        }, 100);
      }, delay);
      delay += 300;
    });

    // Parallax effect
    const handleScroll = () => {
      const scrolled = window.pageYOffset;
      const gridBg = document.querySelector('.grid-bg');
      if (gridBg) {
        gridBg.style.transform = `translateY(${scrolled * 0.5}px)`;
      }
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      document.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleScroll);
      clearInterval(glitchInterval);
    };
  }, []);

  return (
    <div className="landing-container">
      <div className="grid-bg"></div>
      
      <header>
        <nav>
          <div className="logo glitch" data-text="ReleasePeace">ReleasePeace</div>
          <ul className="nav-links">
            <li><a href="#home">Home</a></li>
            <li><a href="#features">Features</a></li>
            <li><a href="#demo" onClick={onEnterApp}>Live Demo</a></li>
          </ul>
        </nav>
      </header>
      
      <main>
        <section className="hero" id="home">
          <h1 className="glitch" data-text="ReleasePeace">ReleasePeace</h1>
          <p>// Feature Flag Governance Platform</p>
          <button onClick={onEnterApp} className="cta-button">
            Access Dashboard
          </button>
        </section>
        
        <section className="features" id="features">
          <h2>Core.Features</h2>
          <div className="feature-grid">
            <div className="feature-card"> 
              <h3>Feature Flags</h3>
              <p>Create and manage flags for safer rollouts across your app.</p>
            </div>

            <div className="feature-card">
              <h3>Approvals</h3>
              <p>Built-in review flow so risky changes need a second set of eyes.</p>
            </div>

            <div className="feature-card">
              <h3>Real-time Insights</h3>
              <p>See flag status and risk at a glance while you ship.</p>
            </div>

            <div className="feature-card">
              <h3>Audit Trail</h3>
              <p>Every toggle and approval is recorded for compliance and rollbacks.</p>
            </div>

            <div className="feature-card">
              <h3>Multi-Environment</h3>
              <p>Dev, staging, production—manage them side-by-side.</p>
            </div>

            <div className="feature-card">
              <h3>SDK & Caching</h3>
              <p>Fast evaluations with a simple SDK and edge-friendly caching.</p>
            </div>
          </div>

        </section>

        
        <section className="terminal">
          <div className="terminal-header">
            <div className="terminal-dots">
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
            </div>
            <span>terminal@releasepeace:~</span>
          </div>
          <div className="terminal-content">
            <div className="command">$ npm install @releasepeace/sdk</div>
            <div className="output">Installing ReleasePeace SDK...</div>
            <div className="output">✓ Engineers soundly sleeping</div>
            <div className="output">✓ Users are checking out seamlessly</div>
            <div className="output">✓ PMs are finally getting accurate metrics</div>
            <div className="output">✓ QA team found zero breaking changes</div>
            <div className="command">$ rp.isActive('new_checkout', user)</div>
            <div className="output">true // Flag active for user<span className="cursor"></span></div>
          </div>
        </section>
      </main>
      
      <footer>
        <p>&copy; 2025 ReleasePeace. Built for the future of feature management.</p>
      </footer>
    </div>
  );
};

export default LandingPage;