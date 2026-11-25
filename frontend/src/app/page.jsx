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
          <span className="eyebrow">Clarity before commitment</span>
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
      <section className="landing-features" aria-label="A calmer renewal workflow">
        <article><span className="eyebrow">Spend</span><h2>Start with the statement.</h2><p>Import transactions, match merchants, and see your software portfolio in one place.</p></article>
        <article><span className="eyebrow">Ownership</span><h2>Give every renewal a plan.</h2><p>Verify notice deadlines and bring Finance, Engineering, and Admin into the decision.</p></article>
        <article><span className="eyebrow">Outcomes</span><h2>Follow through to the invoice.</h2><p>Review seats, track vendor conversations, and compare estimated savings with reviewed invoices.</p></article>
      </section>
    </main>
  );
}
