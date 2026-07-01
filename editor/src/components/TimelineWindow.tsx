import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Pop the timeline out into a separate browser window (handy for long videos on a
// second monitor). The children render through a portal, so they stay in the SAME
// React tree + zustand store as the main window — edits, selection and the playhead
// keep syncing automatically. Closing the popup restores the timeline to the main
// window via `onClose`.
export const TimelineWindow: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const win = window.open("", "ez-timeline", "width=1280,height=380");
    if (!win) {
      // popup blocked by the browser — fall back to the inline timeline
      alert("팝업이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 시도하세요.");
      onClose();
      return;
    }
    win.document.title = "타임라인 — Remotion 웹 에디터";
    // Copy the app's stylesheets so the timeline looks identical in the popup.
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      win.document.head.appendChild(node.cloneNode(true));
    });
    // Fill the popup vertically so the timeline grows when the window is resized.
    win.document.documentElement.style.height = "100%";
    Object.assign(win.document.body.style, {
      margin: "0",
      height: "100%",
      overflow: "hidden",
      background: "#16181f",
      color: "#e7e9ee",
    });
    const mount = win.document.createElement("div");
    mount.style.height = "100%";
    win.document.body.appendChild(mount);
    setContainer(mount);

    // Restore to the main window if the user closes the popup themselves. The poll
    // must live on the MAIN window — a timer owned by the popup dies with it.
    const poll = window.setInterval(() => {
      if (win.closed) {
        window.clearInterval(poll);
        onClose();
      }
    }, 400);

    return () => {
      window.clearInterval(poll);
      if (!win.closed) win.close();
    };
  }, [onClose]);

  return container ? createPortal(children, container) : null;
};
