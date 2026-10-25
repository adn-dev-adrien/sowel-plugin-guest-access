// ============================================================
// The shapes Sowel hands a plugin (core spec 180)
//
// Mirrored by hand, as recipe packages mirror their own types: a plugin never
// imports the core. Keep in step with `src/shared/types.ts` there.
// ============================================================

export interface PluginHttpRequest {
  method: string;
  /** Path under the plugin's own root, always starting with `/`. */
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
  ip: string;
  /** The admin surface only. */
  user?: { id: string; username: string; role: string };
}

export interface PluginHttpResponse {
  status?: number;
  body?: unknown;
  contentType?: string;
  headers?: Record<string, string>;
}

export interface IntegrationSettingDef {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "boolean";
  required: boolean;
  placeholder?: string;
  defaultValue?: string;
}

export type IntegrationStatus = "connected" | "disconnected" | "not_configured" | "error";

export interface Device {
  id: string;
  integrationId: string;
  sourceDeviceId: string;
  name: string;
}
