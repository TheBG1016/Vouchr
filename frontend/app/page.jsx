"use client";

import dynamic from "next/dynamic";

const Vouchr = dynamic(() => import("./vouchr"), { ssr: false });

export default function HomePage() {
  return <Vouchr />;
}
