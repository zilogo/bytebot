"use client";

import { DesktopContainer } from "@/components/ui/desktop-container";

export default function LiveViewPage() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="h-full w-full p-4">
        <DesktopContainer viewOnly={false} status="live_view" nativeResolution={true}>
          {/* No action buttons - pure desktop view */}
        </DesktopContainer>
      </div>
    </div>
  );
}
