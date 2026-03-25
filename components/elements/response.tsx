"use client";

import type { ComponentProps } from "react";
import { memo, useCallback, useEffect, useRef } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

type ResponseProps = ComponentProps<typeof Streamdown>;

const STREAMDOWN_CLASS =
  "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_code]:whitespace-pre-wrap [&_code]:break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto";

/**
 * Adds "Copy" buttons to all <pre> blocks inside the container.
 * Called once on mount and on each MutationObserver callback.
 */
function addCopyButtons(el: HTMLElement) {
  for (const pre of el.querySelectorAll("pre")) {
    if (pre.querySelector("[data-copy-btn]")) {
      continue;
    }
    (pre as HTMLElement).style.position = "relative";
    const btn = document.createElement("button");
    btn.setAttribute("data-copy-btn", "true");
    btn.setAttribute("aria-label", "Copiar código");
    btn.className = "copy-code-btn";
    btn.textContent = "Copiar";
    btn.addEventListener("click", async () => {
      const code =
        pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
      try {
        await navigator.clipboard.writeText(code.trim());
      } catch {
        // Fallback para contextos sem permissão de clipboard (HTTP / iframe)
        const ta = document.createElement("textarea");
        ta.value = code.trim();
        ta.style.cssText =
          "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      btn.textContent = "\u2713 Copiado";
      setTimeout(() => {
        btn.textContent = "Copiar";
      }, 1500);
    });
    pre.appendChild(btn);
  }
}

function PureResponse({ className, children, ...props }: ResponseProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleMutation = useCallback(() => {
    const el = wrapperRef.current;
    if (el) {
      addCopyButtons(el);
    }
  }, []);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) {
      return;
    }

    addCopyButtons(el);
    const obs = new MutationObserver(handleMutation);
    obs.observe(el, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [handleMutation]);

  return (
    <div ref={wrapperRef}>
      <Streamdown className={cn(STREAMDOWN_CLASS, className)} {...props}>
        {children}
      </Streamdown>
    </div>
  );
}

/**
 * Memoized markdown response renderer.
 * Prevents re-renders when the parent re-renders with the same children/props.
 * During streaming, children change on each token — memo still helps because
 * sibling components and non-text message parts won't trigger a re-render of this subtree.
 */
export const Response = memo(PureResponse);
