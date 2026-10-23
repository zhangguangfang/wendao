import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Packaging writes standalone HTML outside the source tree. Watching those
  // files would reload an open development draft when a release is generated.
  server: { watch: { ignored: ["**/release/**", "**/downloads/**"] } },
});
