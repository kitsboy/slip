# Proof photos

The review instrument is `scripts/shots-matrix.mjs`. It photographs the till, an empty counter, the pay screen, Money in, Books, Setup, Learn, the parts page, and the customer window. Phone, tablet, and laptop. Dark and light.

Frames land in `docs/shots/matrix/`, which is not committed. Run it against a local preview, never a tailnet address:

```bash
npx vite preview --host ::1 --port 4181 --strictPort
node scripts/shots-matrix.mjs "http://[::1]:4181/"
```

A customer frame is a simulated amount posted on the same device. The word simulated is in the label. It is not a sale.

The parts page is `?parts=1`. It is not in the shop navigation, and it is not the dev gallery.
