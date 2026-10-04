// SPDX-License-Identifier: MIT
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/integrations/")({
  beforeLoad: () => {
    throw redirect({ to: "/integrations/sources" });
  },
});
