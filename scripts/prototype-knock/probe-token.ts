// PROTOTYPE (throwaway): does a signed token for user A read A's feed, and is it rejected for user B?
import { signUserToken } from "@knocklabs/node/lib/tokenSigner";
import { readFileSync } from "node:fs";
const kv = Object.fromEntries(readFileSync(".env.my","utf8").trim().split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim().replace(/^['"]|['"]$/g,"")]));
const feed = (u: string, tok?: string) => fetch(`https://api.knock.app/v1/users/${u}/feeds/${kv.key2}`, { headers: { Authorization: `Bearer ${kv.dev_public}`, ...(tok ? { "X-Knock-User-Token": tok } : {}) } }).then(async r => `${r.status} ${(await r.text()).slice(0,90)}`);
const tA = await signUserToken("cadence-2", { signingKey: kv.dev_signing });
console.log("A token, A feed:", await feed("cadence-2", tA));
console.log("A token, B feed:", await feed("cadence-3", tA));
console.log("bad token, A feed:", await feed("cadence-2", tA.slice(0,-4)+"AAAA"));
console.log("no token, A feed:", await feed("cadence-2"));
