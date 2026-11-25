import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

/**
 * Renders the AI's Markdown safely.
 *
 * - remark-gfm adds tables, strikethrough and task lists.
 * - rehype-sanitize strips scripts, event handlers, iframes and unsafe URLs, so a
 *   model that echoes user text cannot inject HTML into the page.
 * - KaTeX is loaded lazily and only when a message actually contains maths, so the
 *   main bundle stays small.
 */
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), ["className", /^language-[\w-]+$/, "math-display", "math-inline", "math"]],
    span: [...(defaultSchema.attributes?.span || []), ["className", "math", "math-inline", "math-display"]],
    div: [...(defaultSchema.attributes?.div || []), ["className", "math", "math-display"]],
  },
};

function nodeText(node) {
  if (!node) return "";
  if (node.type === "text") return node.value || "";
  if (Array.isArray(node.children)) return node.children.map(nodeText).join("");
  return "";
}

// KaTeX is fetched the first time a formula appears, then reused.
let katexPromise = null;
function loadKatex() {
  if (!katexPromise) {
    katexPromise = Promise.all([import("katex"), import("katex/dist/katex.min.css")])
      .then(([mod]) => mod.default || mod)
      .catch(() => null);
  }
  return katexPromise;
}

function Formula({ value, display }) {
  const [katex, setKatex] = useState(null);

  useEffect(() => {
    let alive = true;
    loadKatex().then((mod) => {
      if (alive) setKatex(mod);
    });
    return () => {
      alive = false;
    };
  }, []);

  const html = useMemo(() => {
    if (!katex) return null;
    try {
      return katex.renderToString(value, { displayMode: display, throwOnError: false, output: "html" });
    } catch {
      return null;
    }
  }, [katex, value, display]);

  if (!html) {
    // While KaTeX loads (or if it cannot), show the formula in a readable monospace block.
    return <code className="md-math-fallback">{value}</code>;
  }
  return (
    <span
      className={display ? "md-math-block" : "md-math-inline"}
      // KaTeX output is generated from the formula string and escapes its own input.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const components = {
  a: ({ children, href, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
  span: ({ node, className, children, ...props }) => {
    if (typeof className === "string" && /\bmath\b/.test(className)) {
      return <Formula value={nodeText(node)} display={/math-display/.test(className)} />;
    }
    return (
      <span className={className} {...props}>
        {children}
      </span>
    );
  },
  div: ({ node, className, children, ...props }) => {
    if (typeof className === "string" && /\bmath\b/.test(className)) {
      return <Formula value={nodeText(node)} display />;
    }
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  },
  code: ({ node, className, children, ...props }) => {
    if (typeof className === "string" && /language-math/.test(className)) {
      return <Formula value={nodeText(node)} display={/math-display/.test(className)} />;
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ node, children }) => {
    const child = node?.children?.[0];
    const childClass = child?.properties?.className;
    const isMath = Array.isArray(childClass) && childClass.some((name) => String(name).includes("math"));
    if (isMath) return <Formula value={nodeText(child)} display />;
    return <pre>{children}</pre>;
  },
  table: ({ children }) => (
    <div className="md-table-wrap">
      <table>{children}</table>
    </div>
  ),
};

export default function Markdown({ children, className = "" }) {
  const source = typeof children === "string" ? children : String(children ?? "");
  if (!source.trim()) return null;

  return (
    <div className={`md ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
