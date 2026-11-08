/** A row of segments. It reports the step; it does not advance it. */
export default function Stepper({
  step,
  of,
  labels,
}: {
  step: number;
  of: number;
  labels: string[];
}) {
  return (
    <ol className="v2-stepper" aria-label={`Step ${step} of ${of}`}>
      {labels.slice(0, of).map((label, i) => (
        <li key={label} aria-current={i + 1 === step ? 'step' : undefined}>
          <span className="v2-stepper-seg" />
          {label}
        </li>
      ))}
    </ol>
  );
}
