/** C-23. Shows a time it was given. It does not start a clock of its own. */
export default function Countdown({ secondsLeft }: { secondsLeft: number }) {
  const m = Math.floor(Math.max(0, secondsLeft) / 60);
  const s = Math.max(0, secondsLeft) % 60;
  const clock = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (secondsLeft <= 0) {
    return (
      <p className="v2-count v2-count-dead" role="timer">
        This QR has expired. Make a new one.
      </p>
    );
  }
  return (
    <p className={secondsLeft <= 60 ? 'v2-count v2-count-soon' : 'v2-count'} role="timer">
      <span className="v2-money-num">{clock}</span>
      <span className="v2-status-detail">until this QR expires</span>
      {secondsLeft <= 60 ? <span className="v2-badge v2-badge-warn">Expiring</span> : null}
    </p>
  );
}
