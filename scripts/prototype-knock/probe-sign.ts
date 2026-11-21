// PROTOTYPE (throwaway): can the 94-char key sign a user token?
import { signUserToken } from "@knocklabs/node/lib/tokenSigner";
import { readFileSync } from "node:fs";
const kv = Object.fromEntries(readFileSync(".env.my","utf8").trim().split("\n").map(l=>[l.slice(0,l.indexOf("=")), l.slice(l.indexOf("=")+1).trim()]));
for (const k of Object.keys(kv)) {
  try { const t = await signUserToken("probe-user", { signingKey: kv[k] }); console.log(k, "signed OK, len", t.length); }
  catch (e: any) { console.log(k, "sign FAIL:", e.message.slice(0,120)); }
}
