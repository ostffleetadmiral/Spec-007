/* dom-dialog.js — accessible DOM dialogs for the Rations desk.

   Browser-native prompt/alert/confirm are intentionally not used: Electron
   cannot host prompt(), and native dialogs bypass the page's containment,
   language, and accessibility controls. These helpers use <dialog> when the
   platform provides it and an explicitly opened dialog element otherwise.
*/
(function (global) {
  "use strict";

  let serial = 0;

  function text(tag, value, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = value;
    return el;
  }

  function focusable(root) {
    return Array.from(root.querySelectorAll(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    )).filter((el) => !el.disabled && el.offsetParent !== null);
  }

  function open(opts) {
    return new Promise((resolve) => {
      const invoker = document.activeElement;
      const id = `rations-dialog-${++serial}`;
      const dialog = document.createElement("dialog");
      const form = document.createElement("form");
      const title = text("h2", opts.title || "Rations", "dialog-title");
      const body = text("p", opts.message || "", "dialog-body");
      const actions = document.createElement("div");
      let input = null;
      let done = false;

      dialog.id = id;
      dialog.className = "rations-dialog";
      dialog.setAttribute("aria-labelledby", `${id}-title`);
      dialog.setAttribute("aria-describedby", `${id}-body`);
      title.id = `${id}-title`;
      body.id = `${id}-body`;
      form.method = "dialog";
      actions.className = "dialog-actions";

      form.appendChild(title);
      form.appendChild(body);

      if (opts.input) {
        const label = text("label", opts.label || "Value", "dialog-label");
        input = document.createElement(opts.textarea ? "textarea" : "input");
        input.id = `${id}-input`;
        label.htmlFor = input.id;
        if (!opts.textarea) input.type = opts.password ? "password" : "text";
        input.value = opts.value || "";
        if (opts.placeholder) input.placeholder = opts.placeholder;
        if (opts.readonly) input.readOnly = true;
        if (opts.rows) input.rows = opts.rows;
        input.autocomplete = opts.password ? "current-password" : "off";
        input.spellcheck = false;
        form.appendChild(label);
        form.appendChild(input);
      }

      function finish(value) {
        if (done) return;
        done = true;
        if (input && opts.clear !== false) {
          try { input.value = ""; } catch (_) {}
        }
        try { dialog.close(); } catch (_) {}
        dialog.remove();
        if (invoker && typeof invoker.focus === "function") invoker.focus();
        resolve(value);
      }

      for (const b of opts.buttons || []) {
        const btn = text("button", b.label, b.className || "");
        btn.type = "button";
        if (b.autofocus) btn.autofocus = true;
        btn.addEventListener("click", () => finish(
          b.value === "input" ? (input ? input.value : null) : b.value));
        actions.appendChild(btn);
      }
      form.appendChild(actions);
      dialog.appendChild(form);
      document.body.appendChild(dialog);

      dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        finish(opts.cancelValue);
      });
      dialog.addEventListener("keydown", (e) => {
        if (e.key !== "Tab") return;
        const items = focusable(dialog);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      });
      form.addEventListener("submit", (e) => e.preventDefault());

      try {
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
      } catch (_) {
        dialog.setAttribute("open", "");
      }
      (input || actions.querySelector("button") || dialog).focus();
      if (input && opts.select) input.select();
    });
  }

  global.RationsDialog = {
    confirm(opts) {
      return open(Object.assign({
        buttons: [
          { label: opts.cancelText || "Cancel", value: false },
          { label: opts.confirmText || "Continue", value: true, autofocus: true, className: "danger" },
        ],
        cancelValue: false,
      }, opts));
    },
    prompt(opts) {
      return open(Object.assign({
        input: true,
        buttons: [
          { label: opts.cancelText || "Cancel", value: null },
          { label: opts.confirmText || "Continue", value: "input", autofocus: true },
        ],
        cancelValue: null,
      }, opts));
    },
    notice(opts) {
      return open(Object.assign({
        buttons: [{ label: opts.confirmText || "OK", value: true, autofocus: true }],
        cancelValue: true,
      }, opts));
    },
    card(opts) {
      return open(Object.assign({
        input: true,
        textarea: true,
        readonly: true,
        clear: false,
        select: true,
        value: opts.value || "",
        buttons: [{ label: opts.confirmText || "Close", value: true, autofocus: true }],
        cancelValue: true,
      }, opts));
    },
  };
})(window);
