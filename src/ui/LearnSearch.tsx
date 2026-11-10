import { useEffect, useMemo, useState } from 'react';

/**
 * A way into the manual, for someone who already knows the word.
 *
 * slip's Learn section is prose on purpose, and prose is bad at being searched by eye. This is not a
 * second copy of the text and it is not a filter: it reads the headings and the two lists that
 * already exist on the page (the glossary and "what slip cannot do") and offers them as jumps. The
 * body is never hidden — a shopkeeper who searches "fee" and gets an empty page has been told the
 * wrong thing.
 */

export type Hit = { text: string; kind: 'section' | 'term' | 'limit'; id: string };

/** Read the page once, after render. Cheap: a few dozen nodes, no reflow of the prose. */
export function collectHits(root: ParentNode): Hit[] {
  const out: Hit[] = [];
  const seen = new Set<string>();
  const push = (text: string, kind: Hit['kind'], el: Element) => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean || seen.has(`${kind}:${clean}`)) return;
    seen.add(`${kind}:${clean}`);
    if (!el.id) el.id = `learn-${kind}-${out.length}`;
    out.push({ text: clean, kind, id: el.id });
  };
  root.querySelectorAll('h2, h3').forEach((h) => push(h.textContent ?? '', 'section', h));
  root.querySelectorAll('[data-panel="glossary"] dt').forEach((dt) => push(dt.textContent ?? '', 'term', dt));
  root.querySelectorAll('[data-cannot] dt').forEach((dt) => push(dt.textContent ?? '', 'limit', dt));
  return out;
}

/** Plain substring, case-folded, every word must appear. Deliberately dumb: no fuzzy surprises. */
export function rankLearn(hits: Hit[], query: string, limit = 8): Hit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return hits
    .filter((h) => {
      const text = h.text.toLowerCase();
      return words.every((w) => text.includes(w));
    })
    .sort((a, b) => {
      const aStarts = a.text.toLowerCase().startsWith(words[0] ?? '') ? 0 : 1;
      const bStarts = b.text.toLowerCase().startsWith(words[0] ?? '') ? 0 : 1;
      return aStarts - bStarts || a.text.length - b.text.length;
    })
    .slice(0, limit);
}

export default function LearnSearch() {
  const [hits, setHits] = useState<Hit[]>([]);
  const [query, setQuery] = useState('');

  // Collected after mount, from the page that is actually rendered — no second copy of the text to
  // drift out of date with it.
  useEffect(() => {
    const root = document.querySelector('[data-section="learn"]');
    if (root) setHits(collectHits(root));
  }, []);

  const results = useMemo(() => rankLearn(hits, query), [hits, query]);

  return (
    <div className="v2-learn-search" data-learn-search>
      <label className="v2-learn-search-label" htmlFor="ls-q">
        Find a word in this manual
      </label>
      <input
        id="ls-q"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="fee, refund, xpub, lightning…"
        autoComplete="off"
        spellCheck={false}
        className="v2-learn-search-input"
      />
      {query.trim() !== '' && (
        <ul className="v2-learn-search-hits" aria-live="polite">
          {results.length === 0 ? (
            <li className="v2-learn-search-none">
              Nothing in the manual uses that word. Try a shorter one — “fee”, not “fees on Lightning”.
            </li>
          ) : (
            results.map((h) => (
              <li key={`${h.kind}:${h.id}`}>
                <a
                  href={`#${h.id}`}
                  className="v2-learn-search-hit"
                  onClick={() => {
                    const el = document.getElementById(h.id);
                    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    el?.classList.add('v2-jump');
                    window.setTimeout(() => el?.classList.remove('v2-jump'), 1200);
                  }}
                >
                  <span className="v2-learn-search-kind">{h.kind === 'limit' ? 'limit' : h.kind}</span>
                  <span>{h.text}</span>
                </a>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
