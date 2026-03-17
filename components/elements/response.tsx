"use client";

import type { ComponentProps } from "react";
import { useEffect, useRef } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

type ResponseProps = ComponentProps<typeof Streamdown>;

export function Response({ className, children, ...props }: ResponseProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) {
      return;
    }

    const addButtons = () => {
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
          btn.textContent = "✓ Copiado";
          setTimeout(() => {
            btn.textContent = "Copiar";
          }, 1500);
        });
        pre.appendChild(btn);
      }
    };

    addButtons();
    const obs = new MutationObserver(addButtons);
    obs.observe(el, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={wrapperRef}>
      <Streamdown
        className={cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_code]:whitespace-pre-wrap [&_code]:break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto",
          className
        )}
        {...props}
      >
        {children}
      </Streamdown>
    </div>
  );
}
