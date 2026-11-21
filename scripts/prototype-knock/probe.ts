// PROTOTYPE (throwaway): probe Knock Development env. Not production code.
import Knock from "@knocklabs/node";
const knock = new Knock();
async function main() {
  try {
    const r = await knock.workflows.trigger("discussion-reply", { recipients: ["probe-user"], data: {} });
    console.log("trigger discussion-reply:", r);
  } catch (e: any) { console.log("trigger discussion-reply ERR", e.status, e.message); }
  try {
    const p = await knock.users.getPreferences("probe-user", "default");
    console.log("prefs:", JSON.stringify(p));
  } catch (e: any) { console.log("prefs ERR", e.status, e.message); }
}
main();
