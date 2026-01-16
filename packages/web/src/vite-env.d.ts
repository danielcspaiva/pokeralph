/// <reference types="vite/client" />

// @tailwindcss/vite doesn't ship with TypeScript types
declare module "@tailwindcss/vite" {
  import type { Plugin } from "vite";
  export default function tailwindcss(): Plugin;
}
