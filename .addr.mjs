
import { HDKey } from "@scure/bip32";
import * as btc from "@scure/btc-signer";
const seed = new Uint8Array(32).fill(7);
const child = HDKey.fromMasterSeed(seed).derive("m/84'/1'/0'/0/0");
for (const hrp of ["tltc", "rltc"]) {
  const a = btc.p2wpkh(child.publicKey, { bech32: hrp }).address;
  console.log(hrp, a);
}
