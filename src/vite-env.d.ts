/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_GOLF_API_KEY: string
  readonly VITE_GOLF_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
