import type { IOperationResult } from '@microsoft/power-apps/data';
import { GetMaterialListService } from './generated/services/GetMaterialListService';
import { GetTechListService } from './generated/services/GetTechListService';
import { Office365UsersService } from './generated/services/Office365UsersService';
import { Spaar_materialrequestlinesService } from './generated/services/Spaar_materialrequestlinesService';
import { Spaar_materialrequestsService } from './generated/services/Spaar_materialrequestsService';
import type { GetMaterialListResponse } from './generated/models/GetMaterialListModel';
import type { GetTechListResponse } from './generated/models/GetTechListModel';
import type { User } from './generated/models/Office365UsersModel';
import type {
  Division,
  Material,
  RequestDraft,
  RequestReceipt,
  Technician,
} from './domain';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function operationData<T>(result: IOperationResult<T>, message: string): T {
  if (!result.success) {
    throw new Error(result.error?.message || message);
  }
  return result.data;
}

function stringValue(row: UnknownRecord, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined) return String(value).trim();
  }
  return '';
}

function findRows(value: unknown, depth = 0): UnknownRecord[] {
  if (depth > 5 || value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    if (value.every(isRecord)) return value;
    for (const candidate of value) {
      const rows = findRows(candidate, depth + 1);
      if (rows.length) return rows;
    }
    return [];
  }
  if (!isRecord(value)) return [];

  const likelyKeys = [
    'Table1',
    'table1',
    'Table',
    'table',
    'ResultSet1',
    'resultSet1',
    'resultset',
    'resultsets',
    'ResultSets',
  ];
  for (const key of likelyKeys) {
    const rows = findRows(value[key], depth + 1);
    if (rows.length) return rows;
  }
  for (const candidate of Object.values(value)) {
    const rows = findRows(candidate, depth + 1);
    if (rows.length) return rows;
  }
  return [];
}

function sqlRows(response: GetTechListResponse | GetMaterialListResponse): UnknownRecord[] {
  return findRows(response.ResultSets ?? response);
}

export async function loadTechnicians(): Promise<Technician[]> {
  const response = operationData(
    await GetTechListService.GetTechList({}),
    'The technician list could not be loaded.',
  );

  const rows = sqlRows(response);
  if (!rows.length) {
    throw new Error('The technician list returned no usable rows.');
  }

  return rows.map((row, index): Technician => {
    const stageid = Number(row.stageid);
    const stage = stringValue(row, 'stage');
    const bponum = stringValue(row, 'bponum');

    if (!Number.isFinite(stageid) || !stage || !bponum) {
      throw new Error(`Technician row ${index + 1} is missing stageid, stage, or bponum.`);
    }

    return { stageid, stage, bponum };
  });
}

export async function loadMaterials(division: Division): Promise<Material[]> {
  const response = operationData(
    await GetMaterialListService.GetMaterialList({ DivisionCode: division.sqlCode }),
    `The ${division.label} material list could not be loaded.`,
  );

  const materials = sqlRows(response)
    .map((row): Material => ({
      id: stringValue(row, 'id', 'Id', 'ID'),
      name: stringValue(row, 'name', 'Name'),
      unit: stringValue(row, 'unit', 'Unit'),
      productCode: stringValue(row, 'product_code', 'productCode', 'ProductCode'),
    }))
    .filter((material) => material.id && material.name);

  if (!materials.length) {
    throw new Error(`No materials were returned for ${division.label}.`);
  }

  return materials.sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function userName(user: User): string {
  return user.DisplayName || [user.GivenName, user.Surname].filter(Boolean).join(' ');
}

export async function findTechnicianEmail(technicianName: string): Promise<string> {
  const result = await Office365UsersService.SearchUser(technicianName, 15);
  const users = operationData(result, 'The Microsoft 365 directory could not be searched.');
  const target = normalizeName(technicianName);

  const exact = users.find((user) => normalizeName(userName(user)) === target);
  if (exact) return exact.Mail || exact.UserPrincipalName || '';

  const targetTokens = target.split(' ').filter(Boolean);
  const likely = users.filter((user) => {
    const candidate = normalizeName(userName(user));
    return targetTokens.length >= 2 && targetTokens.every((token) => candidate.includes(token));
  });

  return likely.length === 1 ? likely[0].Mail || likely[0].UserPrincipalName || '' : '';
}

const PENDING_STATUS = 534470001 as const;

async function bestEffortRollback(lineIds: string[], requestId: string): Promise<void> {
  await Promise.allSettled(lineIds.map((id) => Spaar_materialrequestlinesService.delete(id)));
  if (requestId) await Spaar_materialrequestsService.delete(requestId).catch(() => undefined);
}

export async function submitRequest(draft: RequestDraft): Promise<RequestReceipt> {
  let requestId = '';
  const lineIds: string[] = [];

  try {
    const header = operationData(
      await Spaar_materialrequestsService.create({
        spaar_division: draft.division.label,
        spaar_notes: draft.notes.trim() || undefined,
        spaar_stage: draft.technician.stage || undefined,
        spaar_stageid: String(draft.technician.stageid),
        spaar_technicianemail: draft.technicianEmail || undefined,
        spaar_technicianname: draft.technician.bponum,
        statecode: 0,
        statuscode: 1,
      }),
      'The material request header could not be created.',
    );

    requestId = header.spaar_materialrequestid;
    if (!requestId) throw new Error('Dataverse did not return a material request ID.');

    for (const line of draft.lines) {
      const createdLine = operationData(
        await Spaar_materialrequestlinesService.create({
          'spaar_MaterialRequest@odata.bind': `/spaar_materialrequests(${requestId})`,
          spaar_materialid: line.id,
          spaar_productcode: line.productCode || undefined,
          spaar_quantity: line.quantity,
          spaar_requestedmaterialname: line.name,
          spaar_unit: line.unit || undefined,
          statecode: 0,
          statuscode: 1,
        }),
        `The request line for ${line.name} could not be created.`,
      );
      if (!createdLine.spaar_materialrequestlineid) {
        throw new Error(`Dataverse did not return an ID for ${line.name}.`);
      }
      lineIds.push(createdLine.spaar_materialrequestlineid);
    }

    operationData(
      await Spaar_materialrequestsService.update(requestId, { spaar_status: PENDING_STATUS }),
      'The request was saved, but it could not be marked Pending.',
    );

    return {
      ...draft,
      requestId,
      requestNumber: header.spaar_material_request_id || requestId,
      submittedAt: new Date(),
    };
  } catch (error) {
    await bestEffortRollback(lineIds, requestId);
    throw error;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Please try again.';
}
