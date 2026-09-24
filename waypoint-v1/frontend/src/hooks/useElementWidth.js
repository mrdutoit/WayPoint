import { useEffect, useRef, useState } from 'react';

/**
 * Tracks an element's rendered width (ResizeObserver), for charts whose
 * layout depends on real pixels. Re-checks after every render so it also
 * works when the element mounts later than the component (e.g. only once
 * data has loaded) — a [ref]-only dependency would miss that.
 */
export function useElementWidth(ref) {
  const [width, setWidth] = useState(0);
  const observed = useRef(null);
  const observer = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (el === observed.current) return;
    observer.current?.disconnect();
    observed.current = el;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.current.observe(el);
  });

  useEffect(() => () => observer.current?.disconnect(), []);
  return width;
}
