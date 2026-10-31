/**
 * Printing without `document.write`.
 *
 * `document.write` is banned by the bundle scanner (and rightly: it is the classic way an
 * injection becomes executable). A Blob URL gives the same result — a real printable document in
 * its own window — with no string-to-DOM parse of the current page.
 */

export function openPrintable(html: string, feature: string, size = 'width=420,height=640'): boolean {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const win = window.open(url, feature, size);
  if (!win) {
    URL.revokeObjectURL(url);
    return false;
  }
  win.addEventListener('load', () => {
    win.focus();
    win.print();
  });
  // Keep the URL alive long enough for the print dialog to read it, then release it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

export function escapeHtml(value: string): string {
  return value.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
}
