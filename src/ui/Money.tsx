/**
 * C-02. Displays a figure it was given. It does not add, convert, or round.
 * Ten or more digits drop below the 24 px floor so the line cannot overflow
 * a 200 px slip. The full words stay available to a screen reader.
 */
export default function Money({
  text,
  unit,
  variant,
  label,
}: {
  text: string;
  unit: string;
  variant: 'hero' | 'inline' | 'sats';
  label?: string;
}) {
  const digits = text.replace(/\D/g, '').length;
  const tight = variant === 'hero' && digits >= 10;
  return (
    <span
      className={`v2-money v2-money-${variant}`}
      data-unit={unit}
      data-fit={tight ? 'tight' : 'ok'}
    >
      <span className="v2-money-num">{text}</span>
      {variant !== 'sats' ? <span className="v2-money-unit">{unit}</span> : null}
      <span className="sr-only">{label ?? `${text} ${unit}`}</span>
    </span>
  );
}
