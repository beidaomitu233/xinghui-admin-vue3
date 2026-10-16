import { requestClient } from '#/api/request';

export type BusinessSection = 'oss' | 'sms' | 'wechat';
export interface BusinessConfig {
  section: BusinessSection;
  enabled: boolean;
  parameters: Record<string, string>;
  secretsConfigured: Record<string, boolean>;
  revision: number;
  updateTime: null | string;
  source: string;
  effectiveState: string;
  encryptionReady: boolean;
}
export interface BusinessConfigChange {
  enabled: boolean;
  parameters: Record<string, string>;
  secrets: Record<string, string>;
  clearSecrets: string[];
  revision: number;
}
export const getBusinessConfig = (section: BusinessSection) =>
  requestClient.get<BusinessConfig>(`/system/businessConfig/${section}`);
export const saveBusinessConfig = (
  section: BusinessSection,
  data: BusinessConfigChange,
) =>
  requestClient.put<BusinessConfig>(`/system/businessConfig/${section}`, data);
