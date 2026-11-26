// PROTOTYPE (throwaway) for "What does the Notification Feed look like in Cadence?" (#23).
// Floating bar that cycles ?variant= and toggles ?source=. Hidden in production builds.
// The choice is also kept in localStorage so it survives clicking sidebar links
// (which drop the search params).
import { useEffect, useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "~/lib/utils";

const STORAGE_PREFIX = "cadence-prototype-";

function readStored(key: string) {
  try {
    return localStorage.getItem(STORAGE_PREFIX + key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, value);
  } catch {}
}

/** ?key= wins, then localStorage, then the fallback. */
export function usePrototypeParam<T extends string>(key: string, allowed: readonly T[], fallback: T) {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get(key) as T | null;
  const [stored, setStored] = useState<T | null>(null);
  useEffect(() => setStored(readStored(key) as T | null), [key]);

  const value = [fromUrl, stored].find((v): v is T => !!v && allowed.includes(v)) ?? fallback;

  const set = (next: T) => {
    writeStored(key, next);
    setStored(next);
    setParams(
      (p) => {
        p.set(key, next);
        return p;
      },
      { replace: true, preventScrollReset: true }
    );
  };
  return [value, set] as const;
}

function isEditable(el: Element | null) {
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);
}

export function PrototypeSwitcher<V extends string, S extends string>({
  variants,
  names,
  current,
  onVariant,
  sources,
  source,
  onSource,
  seedAction,
}: {
  variants: readonly V[];
  names: Record<V, string>;
  current: V;
  onVariant: (v: V) => void;
  sources: readonly S[];
  source: S;
  onSource: (s: S) => void;
  /** Route that triggers real Knock workflows for the current user. */
  seedAction?: string;
}) {
  const seed = useFetcher<{ ok?: boolean; error?: string; sent?: string[] }>();
  const idx = variants.indexOf(current);
  const step = (d: number) => onVariant(variants[(idx + d + variants.length) % variants.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(document.activeElement)) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-900 px-3 py-2 text-sm text-white shadow-2xl ring-2 ring-amber-400">
      <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-zinc-900">PROTOTYPE</span>
      <button onClick={() => step(-1)} className="rounded-full p-1 hover:bg-white/10" title="Previous (←)">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-36 text-center font-medium">
        {current} ({names[current]})
      </span>
      <button onClick={() => step(1)} className="rounded-full p-1 hover:bg-white/10" title="Next (→)">
        <ChevronRight className="size-4" />
      </button>
      <span className="h-5 w-px bg-white/20" />
      <div className="flex rounded-full bg-white/10 p-0.5">
        {sources.map((s) => (
          <button
            key={s}
            onClick={() => onSource(s)}
            className={cn("rounded-full px-2 py-0.5 text-xs", s === source ? "bg-white text-zinc-900" : "text-white/70")}
          >
            {s}
          </button>
        ))}
      </div>
      {seedAction && source === sources[0] && (
        <seed.Form method="post" action={seedAction}>
          <button
            disabled={seed.state !== "idle"}
            className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-zinc-900 disabled:opacity-50"
            title={seed.data?.error ?? seed.data?.sent?.join(", ")}
          >
            {seed.state !== "idle" ? "Sending…" : seed.data?.error ? "Send failed, retry" : "Send me 2 test Notifications"}
          </button>
        </seed.Form>
      )}
    </div>
  );
}
