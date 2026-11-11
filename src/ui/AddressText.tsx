
/** Groups of four, for the eye. No spaces are inserted, so a check that reads the text still sees the plain address. */
export function addressGroups(address: string): string[] {
  const raw = address.replace(/\s+/g, '');
  return raw.match(/.{1,4}/g) ?? [raw];
}

export default function AddressText({ address }: { address: string }) {
  const raw = address.replace(/\s+/g, '');
  const groups = addressGroups(raw);
  return (
    <span className="v2-addr">
      {groups.map((group, index) => {
        const start = index * 4;
        const end = start + group.length;
        const bold = start < 6 || end > raw.length - 6;
        return (
          <span key={start} className={bold ? 'v2-addr-end' : undefined}>
            {group}
          </span>
        );
      })}
    </span>
  );
}
