"use client";
import { useGm } from "@/components/gm/gm-app/gm-context";
import { RulesRef } from "@/components/ui/rules-ref/rules-ref";

export default function RulesPage() {
  return <RulesRef rules={useGm().rules} />;
}
