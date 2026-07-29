export const DIVISIONS = [
  { label: 'Residential', sqlCode: 'RESIDENTIAL' },
  { label: 'Spray Systems', sqlCode: 'SPRAY_SYSTEMS' },
] as const;

export type Division = (typeof DIVISIONS)[number];

export interface Technician {
  stageid: number;
  stage: string;
  bponum: string;
}

export interface Material {
  id: string;
  name: string;
  unit: string;
  productCode: string;
}

export interface RequestLine extends Material {
  quantity: number;
}

export interface RequestDraft {
  technician: Technician;
  technicianEmail: string;
  division: Division;
  notes: string;
  lines: RequestLine[];
}

export interface RequestReceipt extends RequestDraft {
  requestId: string;
  requestNumber: string;
  submittedAt: Date;
}

export const MAX_QUANTITY = 9999;

export function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(value)));
}
