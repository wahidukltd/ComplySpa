"use client";

import { scoreTier } from "@/lib/audit/readiness";

interface Props {
  score: number | null;
  size?: "sm" | "lg";
}

export function ReadinessScore({ score, size = "lg" }: Props) {
  const tier = score !== null ? scoreTier(score) : null;
  const diameter = size === "lg" ? 120 : 80;
  const strokeWidth = size === "lg" ? 8 : 6;
  const radius = (diameter - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = score !== null ? (score / 100) * circumference : circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={diameter} height={diameter} className="transform -rotate-90">
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          fill="none"
          stroke="#F6E3D6"
          strokeWidth={strokeWidth}
        />
        {score !== null && (
          <circle
            cx={diameter / 2}
            cy={diameter / 2}
            r={radius}
            fill="none"
            stroke={tier?.color ?? "#8B7D78"}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
          />
        )}
      </svg>
      <div className="text-center">
        <span
          className={`font-bold ${size === "lg" ? "text-2xl" : "text-lg"}`}
          style={{ color: tier?.color ?? "#8B7D78" }}
        >
          {score !== null ? score : "—"}
        </span>
        <span className="block text-xs" style={{ color: "#8B7D78" }}>
          {tier?.label ?? "Not scored"}
        </span>
      </div>
    </div>
  );
}
