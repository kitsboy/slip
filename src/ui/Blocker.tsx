/** The sentence under a grey button. A press that does nothing, with no words, is a dead end. */
export default function Blocker({ show, children }: { show: boolean; children: string }) {
  if (!show) return null;
  return (
    <p className="mt-1 w-full text-xs text-warn" role="status" data-blocker>
      {children}
    </p>
  );
}
