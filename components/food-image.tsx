"use client";
import { useEffect, useState } from "react";
import { Leaf } from "lucide-react";
export default function FoodImage({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img
      className={className}
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={`food-placeholder ${className}`}>
      <Leaf size={48} strokeWidth={1} />
      <span>A recipe worth keeping</span>
    </div>
  );
}
