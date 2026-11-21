// PROTOTYPE (throwaway): does a signed token for user A read A's feed, and is it rejected for user B?
import { signUserToken } from "@knocklabs/node/lib/tokenSigner";
import { readFileSync } from "node:fs";
const kv = Object.fromEntries(readFileSync(".env.my","utf8").trim().split("\n").map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim().replace(/^['"]|['"]$/g,"")]));
const feed = (u: string, tok?: string) => fetch(`https://api.knock.app/v1/users/${u}/feeds/${kv.key2}`, { headers: { Authorization: `Bearer ${kv.key6}`, ...(tok ? { "X-Knock-User-Token": tok } : {}) } }).then(async r => `${r.status} ${(await r.text()).slice(0,90)}`);
const tA = await signUserToken("probe-a", { signingKey: kv.signing });
console.log("A token, A feed:", await feed("probe-a", tA));
console.log("A token, B feed:", await feed("probe-b", tA));
console.log("bad token, A feed:", await feed("probe-a", tA.slice(0,-4)+"AAAA"));
console.log("no token, A feed:", await feed("probe-a"));
