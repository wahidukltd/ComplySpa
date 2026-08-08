"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";

const VALID_TABS = ["profile", "recipients", "credential-types", "users"];

/**
 * Tab container with URL persistence (plan §4.8). The server page reads the
 * `tab` query param into defaultTab (no useSearchParams/Suspense needed);
 * switches update the URL with a shallow router.replace so tabs survive
 * refresh and are deep-linkable.
 */
export function SettingsTabs({
  defaultTab,
  children,
}: {
  defaultTab: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(VALID_TABS.includes(defaultTab) ? defaultTab : "profile");

  function handleTabChange(value: string | null) {
    if (!value) return;
    setTab(value);
    router.replace(`/dashboard/settings?tab=${value}`);
  }

  return (
    <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
      {children}
    </Tabs>
  );
}
