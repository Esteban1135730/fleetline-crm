"use client";

import { useEffect } from "react";
import {
  filterPasted,
  inferFieldKind,
  isAllowedPartial,
  validateComplete,
  type FieldKind,
} from "@fsg/shared";

function isTextControl(
  el: EventTarget | null,
): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

function kindOf(el: HTMLInputElement | HTMLTextAreaElement): FieldKind | null {
  if (el.readOnly || el.disabled) return null;
  if (el.dataset.noValidate === "true") return null;
  return inferFieldKind({
    type: el instanceof HTMLTextAreaElement ? "textarea" : el.type,
    name: el.name,
    id: el.id,
    inputMode: el.inputMode,
    autocomplete: el.autocomplete,
    placeholder: el.placeholder,
    ariaLabel: el.getAttribute("aria-label") || "",
    dataField: el.getAttribute("data-field"),
  });
}

function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  desc?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function markValidity(
  el: HTMLInputElement | HTMLTextAreaElement,
  kind: FieldKind,
) {
  const msg = validateComplete(kind, el.value, el.required);
  el.setCustomValidity(msg || "");
  el.setAttribute("aria-invalid", msg ? "true" : "false");
}

/**
 * Validación transversal: restringe teclas/pegado y exige formato al enviar.
 */
export function FormGuard() {
  useEffect(() => {
    const onBeforeInput = (event: Event) => {
      const e = event as InputEvent;
      if (!isTextControl(e.target)) return;
      const el = e.target;
      const kind = kindOf(el);
      if (!kind) return;
      if (e.inputType?.startsWith("delete") || e.inputType === "historyUndo") {
        return;
      }
      const data = e.data;
      if (data == null) return;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, start) + data + el.value.slice(end);
      if (!isAllowedPartial(kind, next)) {
        e.preventDefault();
      }
    };

    const onPaste = (event: Event) => {
      const e = event as ClipboardEvent;
      if (!isTextControl(e.target)) return;
      const el = e.target;
      const kind = kindOf(el);
      if (!kind) return;
      const pasted = e.clipboardData?.getData("text") ?? "";
      e.preventDefault();
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next =
        el.value.slice(0, start) +
        filterPasted(kind, pasted) +
        el.value.slice(end);
      const clipped = isAllowedPartial(kind, next)
        ? next
        : filterPasted(kind, next);
      setNativeValue(el, clipped);
    };

    const onBlur = (event: Event) => {
      if (!isTextControl(event.target)) return;
      const el = event.target;
      const kind = kindOf(el);
      if (!kind) return;
      markValidity(el, kind);
    };

    const onInput = (event: Event) => {
      if (!isTextControl(event.target)) return;
      const el = event.target;
      const kind = kindOf(el);
      if (!kind) return;
      if (el.validationMessage) {
        const msg = validateComplete(kind, el.value, el.required);
        el.setCustomValidity(msg || "");
        if (!msg) el.setAttribute("aria-invalid", "false");
      }
    };

    const onSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      let first: HTMLInputElement | HTMLTextAreaElement | null = null;
      for (const node of Array.from(form.elements)) {
        if (!isTextControl(node)) continue;
        const kind = kindOf(node);
        if (!kind) continue;
        markValidity(node, kind);
        if (node.validationMessage && !first) first = node;
      }
      if (first) {
        event.preventDefault();
        event.stopPropagation();
        first.reportValidity();
        first.focus();
      }
    };

    document.addEventListener("beforeinput", onBeforeInput, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("focusout", onBlur, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("beforeinput", onBeforeInput, true);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("focusout", onBlur, true);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  return null;
}
