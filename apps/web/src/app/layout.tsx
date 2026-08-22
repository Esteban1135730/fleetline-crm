import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme";
import { AppShell } from "@/components/app-shell";
import { ForcePasswordGate } from "@/components/force-password-gate";
import { brand } from "@/lib/brand";

const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700", "800"],
});

const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: `${brand.name} · ${brand.product}`,
  description: brand.tagline,
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    shortcut: ["/icon.svg"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: brand.shortName,
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0D14",
};

const themeBootScript = `
(function(){
  try {
    var s = localStorage.getItem('flt-theme');
    var m = (s === 'light' || s === 'dark') ? s : 'dark';
    var r = document.documentElement;
    r.classList.remove('light', 'dark');
    r.classList.add(m);
    r.dataset.theme = m;
  } catch (e) {
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
  }
  /* Bitdefender/Kaspersky inyectan bis_skin_checked → falso mismatch de hidratación */
  var EXT_ATTRS = ['bis_skin_checked', 'bis_register'];
  function stripExtAttrs(root) {
    if (!root || root.nodeType !== 1) return;
    for (var i = 0; i < EXT_ATTRS.length; i++) {
      var attr = EXT_ATTRS[i];
      if (root.hasAttribute && root.hasAttribute(attr)) root.removeAttribute(attr);
      var nodes = root.querySelectorAll ? root.querySelectorAll('[' + attr + ']') : [];
      for (var j = 0; j < nodes.length; j++) nodes[j].removeAttribute(attr);
    }
  }
  stripExtAttrs(document.documentElement);
  try {
    var obs = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var mu = muts[i];
        if (mu.type === 'attributes' && mu.target && mu.target.removeAttribute) {
          mu.target.removeAttribute(mu.attributeName);
        } else if (mu.addedNodes) {
          for (var k = 0; k < mu.addedNodes.length; k++) stripExtAttrs(mu.addedNodes[k]);
        }
      }
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: EXT_ATTRS,
      childList: true,
      subtree: true
    });
    setTimeout(function () { obs.disconnect(); }, 4000);
  } catch (err) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${display.variable} ${body.variable} ${mono.variable} dark`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            <ForcePasswordGate>
              <AppShell>{children}</AppShell>
            </ForcePasswordGate>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
