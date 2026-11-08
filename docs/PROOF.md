# Proof photos

The review instrument is `scripts/shots-matrix.mjs`. It photographs the till, an empty counter, the pay screen, Money in, Books, Setup, Learn, the parts page, and the customer window. Phone, tablet, and laptop. Dark and light.

Frames land in `docs/shots/matrix/`, which is not committed. Run it against a local preview, never a tailnet address:

```bash
npx vite preview --host ::1 --port 4181 --strictPort
node scripts/shots-matrix.mjs "http://[::1]:4181/"
```

A customer frame is a simulated amount posted on the same device. The word simulated is in the label. It is not a sale.

The parts page is `?parts=1`. It is not in the shop navigation, and it is not the dev gallery.

A 320px-wide phone must show one item and Charge, with no sideways scroll. Amount keys are 64px. The torn edge is only on the printed receipt, which is a separate black-on-white page. High contrast stays black with white words. It does not turn the page white.

