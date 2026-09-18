import { useState, useRef } from "react";

export default function SwipeCard({ children, onSwipeLeft, onSwipeRight, swipeLeftLabel, swipeRightLabel, singleAction }) {
  const ref = useRef(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const handleTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
    currentX.current = 0;
    setSwiping(true);
  };
  const handleTouchMove = (e) => {
    if (!swiping) return;
    currentX.current = e.touches[0].clientX - startX.current;
    setOffset(currentX.current);
  };
  const handleTouchEnd = () => {
    setSwiping(false);
    if (currentX.current < -80 && onSwipeLeft) onSwipeLeft();
    else if (currentX.current > 80 && onSwipeRight) onSwipeRight();
    setOffset(0);
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-0 flex">
        {singleAction ? (
          <div className="w-full bg-red-500 flex items-center justify-start pl-4 text-white text-xs font-semibold">
            {swipeLeftLabel || "Delete"} <i className="fa-solid fa-trash-can ms-1"></i>
          </div>
        ) : (
          <>
            <div className="w-1/2 bg-blue-500 flex items-center justify-end pr-4 text-white text-xs font-semibold">
              <i className="fa-solid fa-pen me-1"></i> {swipeRightLabel || "Edit"}
            </div>
            <div className="w-1/2 bg-red-500 flex items-center justify-start pl-4 text-white text-xs font-semibold">
              {swipeLeftLabel || "Delete"} <i className="fa-solid fa-trash-can ms-1"></i>
            </div>
          </>
        )}
      </div>
      <div
        ref={ref}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ transform: `translateX(${offset}px)`, transition: swiping ? "none" : "transform 0.2s ease" }}
        className="relative"
      >
        {children}
      </div>
    </div>
  );
}