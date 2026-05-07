import { useCallback, useEffect, useState } from "react";

const NEWSNOW_URL = "https://newsnow.busiyi.world";
const MANUAL_DISMISS_KEY = "newsnow_auth_manual_dismissed";

const AUTH_COOKIE_PATTERNS: RegExp[] = [
  /^user$/i,
  /^_?user$/i,
  /^session/i,
  /^_?session/i,
  /^auth/i,
  /^_?auth/i,
  /^token/i,
  /^_?token/i,
  /jwt/i,
  /next-auth/i,
  /^sb-/i,
  /^__Secure-/i,
  /^__Host-/i,
  /login/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
];

const MIN_AUTH_COOKIE_LENGTH = 8;
const STRONG_TOKEN_LENGTH = 24;

export type NewsNowAuthStatus =
  | "loading"
  | "authed"
  | "guest"
  | "unsupported";

export interface NewsNowAuthResult {
  status: NewsNowAuthStatus;
  recheck: () => void;
  dismiss: () => void;
  reset: () => void;
}

function isManuallyDismissed(): boolean {
  try {
    return localStorage.getItem(MANUAL_DISMISS_KEY) === "true";
  } catch {
    return false;
  }
}

function setManualDismiss(value: boolean): void {
  try {
    if (value) localStorage.setItem(MANUAL_DISMISS_KEY, "true");
    else localStorage.removeItem(MANUAL_DISMISS_KEY);
  } catch {}
}

function isCookiesApiAvailable(): boolean {
  return (
    typeof chrome !== "undefined" &&
    !!chrome.cookies &&
    typeof chrome.cookies.getAll === "function"
  );
}

function looksLikeAuthCookie(c: chrome.cookies.Cookie): boolean {
  if (!c.value || c.value.length < MIN_AUTH_COOKIE_LENGTH) return false;
  if (c.httpOnly) return true;
  if (
    c.value.length >= STRONG_TOKEN_LENGTH &&
    /^[A-Za-z0-9._\-=+/%]+$/.test(c.value)
  ) {
    return true;
  }
  return AUTH_COOKIE_PATTERNS.some((pat) => pat.test(c.name));
}

export function useNewsNowAuth(): NewsNowAuthResult {
  const [status, setStatus] = useState<NewsNowAuthStatus>("loading");

  const check = useCallback(async () => {
    if (isManuallyDismissed()) {
      setStatus("authed");
      return;
    }
    if (!isCookiesApiAvailable()) {
      setStatus("unsupported");
      return;
    }
    try {
      let cookies = await chrome.cookies.getAll({ url: NEWSNOW_URL });
      if (cookies.length === 0) {
        cookies = await chrome.cookies.getAll({
          domain: "newsnow.busiyi.world",
        });
      }
      const matched = cookies.filter(looksLikeAuthCookie);
      setStatus(matched.length > 0 ? "authed" : "guest");
    } catch {
      setStatus("unsupported");
    }
  }, []);

  useEffect(() => {
    void check();

    const onFocus = () => void check();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [check]);

  const dismiss = useCallback(() => {
    setManualDismiss(true);
    setStatus("authed");
  }, []);

  const reset = useCallback(() => {
    setManualDismiss(false);
    void check();
  }, [check]);

  return { status, recheck: check, dismiss, reset };
}
