import Link from "next/link";

const navItems = [
  { href: "/", label: "Collection" },
  { href: "/cards/new", label: "Add Card" }
];

export function AppHeader() {
  return (
    <header className="mb-8 rounded-2xl border border-slate-200 bg-white/95 px-5 py-4 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-xl font-semibold text-slate-900">
            Card Collection
          </Link>
          <p className="text-xs text-slate-500">Track cards, upload images, and review AI pre-grade estimates.</p>
        </div>

        <nav aria-label="Main navigation" className="flex items-center gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
