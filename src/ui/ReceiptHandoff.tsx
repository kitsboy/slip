import { useState } from 'react';
export default function ReceiptHandoff({ url }: { url: string }) {
  const [note, setNote] = useState('');
  const full = new URL(url, window.location.href).href;
  async function copy() {
    try { await navigator.clipboard.writeText(full); setNote('Full receipt URL copied. Share it only with the intended person.'); }
    catch { setNote('Copy failed. Select and copy the full URL below.'); }
  }
  async function share() {
    try { await navigator.share({ title: 'slip — unsigned receipt', url: full }); setNote('Receipt handed to the share sheet. Delivery is not verified.'); }
    catch (e) { setNote(e instanceof Error && e.name === 'AbortError' ? 'Sharing cancelled. Nothing confirmed as sent.' : 'Sharing failed. Copy the full URL instead.'); }
  }
  return <div data-receipt-handoff>
    <div className="mt-2 flex flex-wrap gap-2">
      {typeof navigator.share === 'function' && <button className="btn btn-secondary" onClick={() => void share()}>Share receipt</button>}
      <button className="btn btn-secondary" onClick={() => void copy()}>Copy full receipt URL</button>
    </div>
    <details><summary>Full receipt URL</summary><label>Unsigned receipt link<textarea readOnly value={full} className="w-full" rows={3} /></label></details>
    <p>Unsigned record, not independent proof of payment. Anyone with this link can read it. No email, account or receipt server.</p>
    <p role="status">{note}</p>
  </div>;
}
