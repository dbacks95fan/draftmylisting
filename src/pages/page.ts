// Copyright (c) 2026 DPSystems, LLC.
// The small web pages (ux-foundations surface WEB): one centered card, styled
// only with CSS variables generated from docs/tokens.json (design.md).

import type { Response } from "express";

export const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? c,
  );

// Component rules from design.md §3–4; every value is a token variable.
const COMPONENT_CSS =
  "*{box-sizing:border-box}" +
  "body{margin:0;background:var(--color-bg);color:var(--color-text);font-family:var(--font-family-sans);" +
  "font-size:var(--font-size-md);line-height:var(--font-line-height-body)}" +
  "main{max-width:var(--size-content-max);margin:var(--space-xl) auto;padding:0 var(--space-md)}" +
  ".product{color:var(--color-text-muted);font-size:var(--font-size-sm);margin:0 0 var(--space-sm)}" +
  ".card{background:var(--color-surface);border-radius:var(--radius-md);padding:var(--space-lg)}" +
  "h1{font-size:var(--font-size-xl);line-height:var(--font-line-height-heading);font-weight:var(--font-weight-semibold);margin:0 0 var(--space-sm)}" +
  "p{margin:0 0 var(--space-md)}" +
  "label{display:block;font-size:var(--font-size-sm);font-weight:var(--font-weight-semibold);margin-bottom:var(--space-xs)}" +
  "input{width:100%;min-height:var(--size-touch-target);padding:0 var(--space-md);font:inherit;color:var(--color-text);" +
  "background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius-md)}" +
  "button{width:100%;min-height:var(--size-touch-target);margin-top:var(--space-md);font:inherit;font-weight:var(--font-weight-semibold);" +
  "color:var(--color-on-primary);background:var(--color-primary);border:0;border-radius:var(--radius-md);cursor:pointer}" +
  "button:hover{background:var(--color-primary-hover)}" +
  "input:focus-visible,button:focus-visible{outline:var(--size-focus-ring) solid var(--color-focus);outline-offset:2px}" +
  ".alert{border-left:4px solid var(--color-danger);background:var(--color-bg);border-radius:var(--radius-md);padding:var(--space-md);margin:0 0 var(--space-md)}" +
  ".alert.success{border-left-color:var(--color-success)}";

export interface PageOptions {
  status: number;
  title: string;
  body: string;
  tokensCss: string;
}

export function sendPage(res: Response, page: PageOptions): void {
  res
    .status(page.status)
    .set({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      // No scripts or outside resources on any page.
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
    })
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<title>${escapeHtml(page.title)} · DraftMyListing</title>` +
        `<style>${page.tokensCss}${COMPONENT_CSS}</style></head>` +
        `<body><main><p class="product">DraftMyListing</p><div class="card">${page.body}</div></main></body></html>`,
    );
}

/** SCR-WEB-001: the household sign-in page (ux-foundations Part B2). */
export function signInBody(
  requestId: string,
  clientName: string,
  message?: string,
): string {
  return (
    `<h1>Sign in</h1>` +
    `<p>${escapeHtml(clientName)} wants to use DraftMyListing. Enter the household password to allow it.</p>` +
    (message === undefined
      ? ""
      : `<div class="alert" role="alert">${escapeHtml(message)}</div>`) +
    `<form method="post" action="/sign-in">` +
    `<input type="hidden" name="request_id" value="${escapeHtml(requestId)}">` +
    `<label for="p">Household password</label>` +
    `<input id="p" name="password" type="password" autocomplete="current-password" required>` +
    `<button type="submit">Sign in</button></form>`
  );
}

export function messageBody(heading: string, message: string): string {
  return `<h1>${escapeHtml(heading)}</h1><div class="alert" role="alert">${escapeHtml(message)}</div>`;
}
