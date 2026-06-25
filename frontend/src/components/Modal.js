import React, { useEffect } from "react";

function Modal({ isOpen, onClose, title, children }) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          zIndex: 999,
        }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || "Dialog"}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1000,
          padding: 24,
          borderRadius: 12,
          boxShadow: "0px 8px 32px rgba(0,0,0,0.6)",
          textAlign: "center",
          minWidth: 320,
        }}
        className="bg-[#1E2030] text-white border border-gray-700"
      >
        <button
          type="button"
          aria-label="Close modal"
          className="absolute right-3 top-3 rounded-full px-2 py-1 text-sm text-gray-400 transition hover:text-white"
          onClick={onClose}
        >
          x
        </button>
        {title && (
          <h3 className="text-lg font-semibold mb-4 text-white">{title}</h3>
        )}
        {children}
      </div>
    </>
  );
}

export default Modal;
