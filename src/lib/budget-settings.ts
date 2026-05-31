/**
 * Budget settings stored in localStorage, keyed per user email.
 * Shared between settings.tsx, reports.tsx and AppShell.tsx.
 */

const key = (email: string, field: string) => `pl.${email}.${field}`;

export function getBudgetSettings(email = "") {
  if (typeof window === "undefined") return { salary: 50000, limit: 5000 };
  return {
    salary: Number(localStorage.getItem(key(email, "salary")) || 50000),
    limit:  Number(localStorage.getItem(key(email, "limit"))  || 5000),
  };
}

export function saveBudgetSettings(email: string, salary: number, limit: number) {
  localStorage.setItem(key(email, "salary"), String(salary));
  localStorage.setItem(key(email, "limit"),  String(limit));
  window.dispatchEvent(new Event("budget-settings-changed"));
}
