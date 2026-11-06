import type { Metadata } from "next";
import { DemoApp } from "@/components/entry/DemoApp";

export const metadata: Metadata = { title: "114 / Shop · Local demo" };

export default function DemoPage() {
  return <DemoApp />;
}
