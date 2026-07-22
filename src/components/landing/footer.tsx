const COLUMNS = [
  {
    title: "Products",
    links: [{ label: "Pricing", href: "/pricing" }],
  },
  {
    title: "Resources",
    links: [{ label: "Blog", href: "/blog" }],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/#" },
      { label: "Contact", href: "/#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/#" },
      { label: "Terms", href: "/#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
      <div className="mx-auto max-w-5xl px-4 py-12 xl:max-w-6xl xl:px-8 xl:py-16 2xl:max-w-7xl 2xl:px-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 xl:gap-12 2xl:gap-16">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold" style={{ color: "#000000" }}>
                {col.title}
              </h4>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm transition-colors hover:underline"
                      style={{ color: "rgba(0,0,0,0.55)" }}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8 border-t pt-6 text-center" style={{ borderColor: "#F0F4F5" }}>
          <p className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
            © 2026 Med Spa Compliance. Built for the 15,000+ med spas in the US.
          </p>
        </div>
      </div>
    </footer>
  );
}
