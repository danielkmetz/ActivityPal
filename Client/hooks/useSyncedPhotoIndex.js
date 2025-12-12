import { useEffect, useState } from "react";

export default function useSyncedPhotoIndex(currentIndexRef) {
  const [index, setIndex] = useState(0);

  // Same behavior you had: poll ref -> state
  useEffect(() => {
    const id = setInterval(() => {
      const next = Number.isFinite(currentIndexRef.current)
        ? currentIndexRef.current
        : 0;

      setIndex((prev) => (prev === next ? prev : next));
    }, 100);

    return () => clearInterval(id);
  }, [currentIndexRef]);

  return [index, setIndex];
}
