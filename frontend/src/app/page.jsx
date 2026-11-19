import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="landing">
      <header className="topbar">
        <Link className="brand" href="/">SaaS Optimizer</Link>
        <nav aria-label="Account">
          <Link href="/sign-in">Sign in</Link>
          <Link className="cta" href="/sign-up">Get started</Link>
        </nav>
      </header>
      <div className="hero">
        <div>
          <h1>Know what to renew before it renews.</h1>
          <p>Bring software spend, license activity, and renewal deadlines into one workspace for Finance and Engineering.</p>
          <Link className="cta" href="/sign-up">Create a workspace</Link>
        </div>
        <figure>
          <video controls playsInline preload="none" poster="/workflow-poster.jpg" aria-label="Silent product workflow preview">
            <source src="/workflow-preview.mp4" type="video/mp4" />
            Your browser does not support embedded video.
          </video>
          <figcaption>Product concept preview · Import spend, review seats, decide before renewal.</figcaption>
        </figure>
      </div>
    </main>
  );
}
