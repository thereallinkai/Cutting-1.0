import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck2,
  ChartNoAxesCombined,
  Check,
  Leaf,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const benefits = [
  {
    icon: Sparkles,
    title: "Personalized meal guidance",
    body: "Build a seven-day rhythm around foods you already enjoy, with every estimate clearly labeled.",
  },
  {
    icon: CalendarCheck2,
    title: "Daily meal check-ins",
    body: "Mark breakfast, lunch, and dinner without streak pressure, scores, or judgment.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Weight-trend tracking",
    body: "See the direction of your trend while keeping normal day-to-day variation in context.",
  },
];

export default function Home() {
  return (
    <main id="main-content" className="landing">
      <header className="landing-header shell">
        <Link className="brand" href="/" aria-label="Cutting Plan home">
          <span className="brand-mark" aria-hidden="true">
            <Leaf size={19} strokeWidth={2.25} />
          </span>
          Cutting Plan
        </Link>
        <nav aria-label="Public navigation" className="header-actions">
          <Link className="text-link" href="/login">
            Log in
          </Link>
          <Button asChild size="sm">
            <Link href="/register">Create account</Link>
          </Button>
        </nav>
      </header>

      <section className="hero shell">
        <div className="hero-copy">
          <p className="eyebrow">Food guidance without the noise</p>
          <h1>Plan meals. Notice patterns. Adjust with care.</h1>
          <p className="hero-lede">
            A thoughtful daily companion for meal planning, simple check-ins, and
            weight-trend context—built around your preferences and your pace.
          </p>
          <div className="hero-actions">
            <Button asChild variant="accent">
              <Link href="/register">
                Create your plan <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">I already have an account</Link>
            </Button>
          </div>
          <p className="microcopy">
            General wellness information only. No outcome promises, shame, or
            automatic restriction.
          </p>
        </div>

        <div
          className="product-preview"
          aria-label="Preview of the Cutting Plan Today page"
          tabIndex={0}
        >
          <div className="preview-topline">
            <div>
              <span className="preview-kicker">THURSDAY · JUL 24</span>
              <strong>Good morning, Jamie</strong>
            </div>
            <span className="status-chip">
              <span aria-hidden="true">●</span> On track
            </span>
          </div>
          <div className="preview-progress">
            <div className="preview-progress-copy">
              <span>Today&apos;s rhythm</span>
              <strong>2 of 3 meals marked</strong>
            </div>
            <div className="progress-track" aria-hidden="true">
              <span style={{ width: "66%" }} />
            </div>
          </div>
          <div className="meal-preview-grid">
            {[
              ["Breakfast", "Oats, yogurt & blueberries", true],
              ["Lunch", "Rice bowl with chicken & greens", true],
              ["Dinner", "Salmon, potato & broccoli", false],
            ].map(([meal, detail, complete]) => (
              <article className="mini-meal" key={String(meal)}>
                <div className={`meal-check ${complete ? "is-complete" : ""}`}>
                  {complete ? <Check size={15} aria-hidden="true" /> : null}
                </div>
                <span>{meal}</span>
                <strong>{detail}</strong>
                <small>{complete ? "Completed" : "Not marked"}</small>
              </article>
            ))}
          </div>
          <div className="trend-preview">
            <div>
              <span>7-day trend</span>
              <strong>Steady progress</strong>
              <small>Calculated from 6 entries</small>
            </div>
            <div className="sparkline" aria-hidden="true">
              {[72, 64, 68, 55, 58, 43, 39].map((height, index) => (
                <i key={index} style={{ height: `${height}%` }} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="benefit-section shell" aria-labelledby="benefits-heading">
        <div className="section-intro">
          <p className="eyebrow">A steadier way forward</p>
          <h2 id="benefits-heading">Useful structure, with room for real life.</h2>
        </div>
        <div className="benefit-grid">
          {benefits.map(({ icon: Icon, title, body }, index) => (
            <article className="benefit" key={title}>
              <span className="benefit-number">0{index + 1}</span>
              <Icon size={24} strokeWidth={1.7} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="principles shell">
        <div>
          <p className="eyebrow">Designed with boundaries</p>
          <h2>Guidance that tells you what it knows—and what it doesn&apos;t.</h2>
        </div>
        <ul>
          <li><Check size={17} aria-hidden="true" /> Your entries stay distinct from calculations.</li>
          <li><Check size={17} aria-hidden="true" /> AI suggestions are labeled and reviewed before saving.</li>
          <li><Check size={17} aria-hidden="true" /> Missing nutrition data is never quietly invented.</li>
        </ul>
      </section>

      <footer className="landing-footer shell">
        <div className="brand"><span className="brand-mark" aria-hidden="true"><Leaf size={18} /></span>Cutting Plan</div>
        <p>
          This product provides general wellness information and is not medical
          advice. Individual needs can vary.
        </p>
        <div>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </div>
      </footer>
    </main>
  );
}
