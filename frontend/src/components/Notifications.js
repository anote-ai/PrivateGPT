import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const NotificationContext = createContext(null);

function toDisplayText(value, fallback) {
  if (typeof value === "string") {
    return value.trim() || fallback;
  }

  if (value instanceof Error && typeof value.message === "string") {
    return value.message.trim() || fallback;
  }

  if (value && typeof value === "object" && typeof value.message === "string") {
    return value.message.trim() || fallback;
  }

  return fallback;
}

function getToastStyles(type) {
  switch (type) {
    case "success":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-50";
    case "warning":
      return "border-amber-500/30 bg-amber-500/10 text-amber-50";
    case "error":
      return "border-red-500/30 bg-red-500/10 text-red-50";
    default:
      return "border-sky-500/30 bg-sky-500/10 text-sky-50";
  }
}

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  const dismissNotification = useCallback((id) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id));
  }, []);

  const showNotification = useCallback(({ title, message, type = "info", durationMs = 4200 }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setNotifications((current) => [
      ...current,
      {
        id,
        title: toDisplayText(title, "Heads up"),
        message: toDisplayText(message, "Something happened, but we could not show the full details."),
        type,
      },
    ]);

    window.setTimeout(() => {
      dismissNotification(id);
    }, durationMs);
  }, [dismissNotification]);

  const value = useMemo(
    () => ({
      dismissNotification,
      showNotification,
      showError: (message, title = "Something went wrong") =>
        showNotification({ title, message, type: "error" }),
      showSuccess: (message, title = "Done") =>
        showNotification({ title, message, type: "success" }),
      showInfo: (message, title = "Heads up") =>
        showNotification({ title, message, type: "info" }),
    }),
    [dismissNotification, showNotification]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-[1100] flex w-full max-w-sm flex-col gap-3 px-4">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur ${getToastStyles(notification.type)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{notification.title}</p>
                <p className="mt-1 whitespace-pre-line text-sm opacity-90">{notification.message}</p>
              </div>
              <button
                type="button"
                className="rounded-full px-2 py-1 text-xs opacity-75 transition hover:opacity-100"
                onClick={() => dismissNotification(notification.id)}
              >
                Close
              </button>
            </div>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }

  return context;
}
