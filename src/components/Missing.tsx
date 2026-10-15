"use client";

import { useId, useState } from "react";

/** A "—" for a value the data source doesn't provide, with a tooltip explaining why. */
export function Missing({ reason }: { reason: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="missing" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="missing-btn"
        aria-describedby={open ? id : undefined}
        aria-label={`Not available: ${reason}`}
        onClick={() => setOpen(true)}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        —<span className="info" aria-hidden>i</span>
      </button>
      {open && (
        <span role="tooltip" id={id} className="tooltip">
          {reason}
        </span>
      )}
    </span>
  );
}
