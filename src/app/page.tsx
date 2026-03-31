"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ================================================================
   DATA
   ================================================================ */

const PRODUCTS = [
  {
    name: "Automotive Batteries",
    desc: "Four wheelers, three wheelers, two wheelers & e-rickshaw batteries with up to 77-month warranty.",
    tags: ["EPIQ", "Matrix", "Mileage"],
  },
  {
    name: "Infrastructure Batteries",
    desc: "Telecommunications, power projects, traction, railways & miners' cap lamp solutions.",
    tags: ["Telecom", "Railways", "Traction"],
  },
  {
    name: "Inverter Batteries",
    desc: "Tubular batteries engineered for longer life, higher backup & deep discharge recovery.",
    tags: ["EL Ultra", "Powerbox", "Tubular"],
  },
  {
    name: "Institutional UPS",
    desc: "NXT+ Range, Powersafe Plus, EHP & Flooded 6EL for mission-critical infrastructure.",
    tags: ["NXT+", "Powersafe", "Data Centre"],
  },
  {
    name: "Solar Solutions",
    desc: "Rooftop solar systems, batteries, inverters & PV modules for clean energy independence.",
    tags: ["Sunday Rooftop", "MPPT", "PV Modules"],
  },
  {
    name: "Genset Batteries",
    desc: "Maintenance-free GENPLUS batteries with cutting-edge technology for reliable generator power.",
    tags: ["GENPLUS", "Zero Maintenance"],
  },
  {
    name: "Submarine Batteries",
    desc: "High-end batteries for naval submarines, meeting the most stringent military specifications.",
    tags: ["Defence Grade", "ISO Certified"],
  },
  {
    name: "Inverter Systems",
    desc: "Pure sine wave home inverters — Home Magic, Home Star & Home GQP across all KVA ranges.",
    tags: ["Home Magic", "Pure Sine"],
  },
  {
    name: "E-Rickshaw Vehicles",
    desc: "Exide NEO battery-powered vehicles — smart design, comfort & better savings on every ride.",
    tags: ["Exide NEO", "Smart Design"],
  },
];

const STATS = [
  { value: "9", label: "Product Lines" },
  { value: "#1", label: "In India" },
  { value: "77", label: "Month Warranty" },
];

const FEATURES = [
  {
    title: "Track Every Sale",
    desc: "Record sales with MyBillBook bill codes. Real-time tracking of your entire sales pipeline.",
  },
  {
    title: "Build Your Network",
    desc: "Grow your team and watch your network expand. Visualize your complete downline tree.",
  },
  {
    title: "Earn Commissions",
    desc: "Automatic commission calculations on every sale in your network. Transparent earnings.",
  },
  {
    title: "Digital Wallet",
    desc: "Track earnings, request withdrawals, and manage your finances — all in one place.",
  },
];

/* ================================================================
   HOOKS
   ================================================================ */

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );

    el.querySelectorAll(".reveal").forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, []);

  return ref;
}

function useScrolled(threshold = 50) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return scrolled;
}

/* ================================================================
   PRODUCT ICONS (24x24 stroke-based SVGs)
   ================================================================ */

function ProductIcon({
  index,
  className = "w-10 h-10",
}: {
  index: number;
  className?: string;
}) {
  const s = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const icons = [
    // 0: Automotive — car silhouette
    <svg key={0} viewBox="0 0 24 24" className={className} {...s}>
      <path d="M7 13l2-5h6l2 5" />
      <rect x="5" y="13" width="14" height="4" rx="1.5" />
      <circle cx="8.5" cy="17" r="1.5" />
      <circle cx="15.5" cy="17" r="1.5" />
    </svg>,

    // 1: Infrastructure — transmission tower
    <svg key={1} viewBox="0 0 24 24" className={className} {...s}>
      <path d="M12 3v18M7 7h10M5 13h14M3 19h18" />
      <path d="M7 7l-2 6m12-6l2 6" />
    </svg>,

    // 2: Inverter Battery — battery + lightning bolt
    <svg key={2} viewBox="0 0 24 24" className={className} {...s}>
      <rect x="6" y="6" width="12" height="14" rx="1.5" />
      <path d="M10 4v2m4-2v2" />
      <path d="M14 10l-3 4h3l-3 4" />
    </svg>,

    // 3: UPS — shield
    <svg key={3} viewBox="0 0 24 24" className={className} {...s}>
      <path d="M12 3l8 4v5c0 5.25-3.5 9.75-8 12-4.5-2.25-8-6.75-8-12V7l8-4z" />
      <path d="M12 8v5m0 2.5v.5" />
    </svg>,

    // 4: Solar — sun with rays
    <svg key={4} viewBox="0 0 24 24" className={className} {...s}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3m0 14v3m-10-10h3m14 0h3" />
      <path d="M4.93 4.93l2.12 2.12m9.9 9.9l2.12 2.12m0-14.14l-2.12 2.12m-9.9 9.9l-2.12 2.12" />
    </svg>,

    // 5: Genset — generator machine
    <svg key={5} viewBox="0 0 24 24" className={className} {...s}>
      <rect x="3" y="7" width="13" height="10" rx="1.5" />
      <path d="M16 10h4a1 1 0 011 1v2a1 1 0 01-1 1h-4" />
      <circle cx="9.5" cy="12" r="2.5" />
      <path d="M6 17v2m8-2v2" />
    </svg>,

    // 6: Submarine — hull + conning tower
    <svg key={6} viewBox="0 0 24 24" className={className} {...s}>
      <ellipse cx="12" cy="15" rx="9" ry="4" />
      <path d="M10 11V8h4v3" />
      <path d="M14 8l3-3" />
      <path d="M7 15h2m6 0h2" />
    </svg>,

    // 7: Inverter Systems — sine wave + base
    <svg key={7} viewBox="0 0 24 24" className={className} {...s}>
      <path d="M2 12c2-5 4-7 5 0s3 5 5 0 3-5 5 0 3 5 5 0" />
      <path d="M5 19h14" />
      <path d="M8 19v-2m4 2v-2m4 2v-2" />
    </svg>,

    // 8: E-Rickshaw — three-wheeler
    <svg key={8} viewBox="0 0 24 24" className={className} {...s}>
      <path d="M4 11h10l2 5H3l1-5z" />
      <path d="M5 11l1.5-4h5L13 11" />
      <circle cx="6" cy="16" r="1.5" />
      <circle cx="13" cy="16" r="1.5" />
      <path d="M16 16h2.5l1.5-3v-2h-4" />
      <circle cx="19" cy="16" r="1.5" />
    </svg>,
  ];

  return icons[index] || null;
}

/* ================================================================
   SECTIONS
   ================================================================ */

function Navbar() {
  const scrolled = useScrolled();

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-surface/95 backdrop-blur-md border-b border-surface-border shadow-lg shadow-black/20"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-heading tracking-wide text-white">
            ARTILLIGENCE
          </span>
          <span className="hidden sm:inline text-[10px] text-muted font-body tracking-[0.2em] uppercase">
            Powered by Exide
          </span>
        </Link>

        <div className="flex items-center gap-6">
          <a
            href="#products"
            className="hidden md:inline-block text-sm text-gray-400 hover:text-white transition-colors font-body"
          >
            Products
          </a>
          <a
            href="#platform"
            className="hidden md:inline-block text-sm text-gray-400 hover:text-white transition-colors font-body"
          >
            Platform
          </a>
          <Link
            href="/login"
            className="rounded-full bg-exide px-5 py-2 text-sm font-semibold text-white hover:bg-exide-dark transition-colors font-body"
          >
            Sign In
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Solid dark base */}
      <div className="absolute inset-0 bg-surface" />

      {/* Dot grid pattern */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Red glow orb — right side */}
      <div
        className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/4 w-[500px] h-[500px] md:w-[700px] md:h-[700px] rounded-full animate-glow-pulse pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(234,0,6,0.18) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      {/* Secondary glow — top-left */}
      <div
        className="absolute top-0 left-1/4 w-[350px] h-[350px] rounded-full animate-glow-pulse pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(234,0,6,0.07) 0%, transparent 70%)",
          filter: "blur(60px)",
          animationDelay: "2s",
        }}
      />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-7xl px-6 pt-32 pb-20 w-full">
        {/* Badge */}
        <div
          className="hero-anim inline-flex items-center gap-2 rounded-full border border-exide/30 bg-exide/10 px-4 py-1.5 mb-8"
          style={{ animationDelay: "0.1s" }}
        >
          <span className="w-2 h-2 rounded-full bg-exide animate-pulse" />
          <span className="text-xs font-semibold tracking-[0.15em] text-exide uppercase font-body">
            India&apos;s Largest Selling Batteries
          </span>
        </div>

        {/* Heading */}
        <h1
          className="hero-anim font-heading font-bold text-white leading-[0.92] tracking-tight"
          style={{ animationDelay: "0.25s" }}
        >
          <span className="block text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl">
            POWER
          </span>
          <span className="block text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl">
            YOUR SALES
          </span>
          <span className="block text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl text-exide">
            NETWORK
          </span>
        </h1>

        {/* Subtitle */}
        <p
          className="hero-anim mt-8 max-w-xl text-base sm:text-lg text-gray-400 font-body leading-relaxed"
          style={{ animationDelay: "0.45s" }}
        >
          Track sales, build your team, and grow your business with
          India&apos;s most trusted battery brand. Nine product lines. One
          powerful platform.
        </p>

        {/* CTAs */}
        <div
          className="hero-anim mt-10 flex flex-wrap gap-4"
          style={{ animationDelay: "0.6s" }}
        >
          <a
            href="#products"
            className="inline-flex items-center gap-2 rounded-full bg-exide px-7 py-3.5 text-sm font-semibold text-white hover:bg-exide-dark transition-all hover:shadow-lg hover:shadow-exide/25 font-body"
          >
            Explore Products
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </a>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-surface-border px-7 py-3.5 text-sm font-semibold text-white hover:bg-white/5 transition-all font-body"
          >
            Sign In
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </Link>
        </div>

        {/* Stats */}
        <div
          className="hero-anim mt-20 flex flex-wrap gap-8 md:gap-16 border-t border-surface-border pt-8"
          style={{ animationDelay: "0.8s" }}
        >
          {STATS.map((stat) => (
            <div key={stat.label}>
              <div className="text-3xl md:text-4xl font-bold font-heading text-white">
                {stat.value}
              </div>
              <div className="text-xs text-muted font-body tracking-[0.15em] uppercase mt-1">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductsSection() {
  const ref = useScrollReveal();

  return (
    <section id="products" className="relative bg-surface-raised py-24 md:py-32">
      <div ref={ref} className="mx-auto max-w-7xl px-6">
        {/* Header */}
        <div className="reveal flex items-center gap-4 mb-4">
          <div className="h-px w-12 bg-exide" />
          <span className="text-xs font-semibold tracking-[0.2em] text-exide uppercase font-body">
            Product Range
          </span>
        </div>
        <h2 className="reveal font-heading text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight mb-4">
          India&apos;s Most Comprehensive
          <br />
          <span className="text-muted">Battery Portfolio</span>
        </h2>
        <p
          className="reveal text-gray-400 font-body max-w-2xl text-lg mb-16"
          style={{ transitionDelay: "0.1s" }}
        >
          From automotive to submarines, from solar to e-rickshaws — Exide
          powers every corner of India&apos;s energy needs.
        </p>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {PRODUCTS.map((product, i) => (
            <div
              key={product.name}
              className="reveal group relative rounded-2xl bg-surface-card border border-surface-border p-7 transition-all duration-300 hover:border-exide/40 hover:shadow-xl hover:shadow-exide/5 hover:-translate-y-1"
              style={{ transitionDelay: `${0.05 * i}s` }}
            >
              {/* Hover accent line */}
              <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-exide/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              {/* Icon + number */}
              <div className="flex items-start justify-between mb-5">
                <div className="text-exide">
                  <ProductIcon index={i} />
                </div>
                <span className="text-3xl font-bold font-heading text-surface-border group-hover:text-exide/20 transition-colors duration-300 select-none">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>

              {/* Name */}
              <h3 className="font-heading text-xl font-bold text-white mb-3 tracking-tight">
                {product.name}
              </h3>

              {/* Red divider */}
              <div className="h-px w-8 bg-exide/40 mb-3" />

              {/* Description */}
              <p className="text-sm text-gray-400 font-body leading-relaxed mb-5">
                {product.desc}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                {product.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] font-medium font-body text-gray-500 bg-surface-raised px-2.5 py-1 rounded-full border border-surface-border"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlatformSection() {
  const ref = useScrollReveal();

  return (
    <section id="platform" className="relative bg-surface py-24 md:py-32">
      <div ref={ref} className="mx-auto max-w-7xl px-6">
        {/* Header */}
        <div className="reveal flex items-center gap-4 mb-4">
          <div className="h-px w-12 bg-exide" />
          <span className="text-xs font-semibold tracking-[0.2em] text-exide uppercase font-body">
            The Platform
          </span>
        </div>
        <h2 className="reveal font-heading text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight mb-4">
          Everything You Need
          <br />
          <span className="text-muted">To Grow Your Business</span>
        </h2>
        <p
          className="reveal text-gray-400 font-body max-w-2xl text-lg mb-16"
          style={{ transitionDelay: "0.1s" }}
        >
          Artilligence gives you the tools to track, manage, and scale your
          Exide battery sales network.
        </p>

        {/* Features grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className="reveal group rounded-2xl bg-surface-card border border-surface-border p-8 transition-all duration-300 hover:border-exide/30"
              style={{ transitionDelay: `${0.08 * i}s` }}
            >
              <div className="w-10 h-10 rounded-xl bg-exide/10 flex items-center justify-center mb-5 group-hover:bg-exide/20 transition-colors">
                <div className="w-2.5 h-2.5 rounded-full bg-exide" />
              </div>
              <h3 className="font-heading text-xl font-bold text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-400 font-body leading-relaxed">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  const ref = useScrollReveal();

  return (
    <section className="relative overflow-hidden">
      {/* Red gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-exide via-exide-dark to-red-950" />
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div
        ref={ref}
        className="relative z-10 mx-auto max-w-7xl px-6 py-24 md:py-32 text-center"
      >
        <h2 className="reveal font-heading text-4xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight mb-6">
          READY TO START?
        </h2>
        <p
          className="reveal text-white/70 font-body text-lg max-w-xl mx-auto mb-10"
          style={{ transitionDelay: "0.1s" }}
        >
          Join India&apos;s fastest growing battery sales network. Sign in to
          your account or contact your upline to get started.
        </p>
        <div className="reveal" style={{ transitionDelay: "0.2s" }}>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-white px-10 py-4 text-base font-bold text-exide hover:bg-gray-100 transition-all shadow-xl shadow-black/20 font-body"
          >
            Sign In Now
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-surface border-t border-surface-border">
      <div className="mx-auto max-w-7xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold font-heading tracking-wide text-white">
            ARTILLIGENCE
          </span>
          <span className="text-xs text-muted font-body">
            Powered by Exide Industries
          </span>
        </div>
        <p className="text-xs text-muted font-body">
          &copy; {new Date().getFullYear()} Artilligence. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

/* ================================================================
   PAGE
   ================================================================ */

export default function Home() {
  return (
    <div className="bg-surface text-white min-h-screen font-body overflow-x-hidden">
      <Navbar />
      <Hero />
      <ProductsSection />
      <PlatformSection />
      <CTASection />
      <Footer />
    </div>
  );
}
